const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('./db');
const { recalculatePeriod, subscriberBalance, audit } = require('./services/billing');
const calc = require('./services/calculator');
const xlsx = require('xlsx');

const app = express();
const uploadDir = process.env.AMIN_UPLOAD_DIR || (process.env.VERCEL ? '/tmp/amin-building-manager-uploads' : path.join(__dirname,'..','uploads'));
require('fs').mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
app.use(express.json({limit:'5mb'}));
app.use(express.static(path.join(__dirname,'..','public')));

function orgId() { return db.prepare('SELECT id FROM organizations LIMIT 1').get().id; }

app.get('/api/dashboard', (req,res)=>{
  const periods = db.prepare(`SELECT * FROM billing_periods ORDER BY start_date DESC LIMIT 12`).all();
  const subscribers = db.prepare(`SELECT COUNT(*) c FROM subscribers WHERE active=1`).get().c;
  const readings = db.prepare(`SELECT COUNT(*) c FROM meter_readings WHERE status IN ('Entered','Calculated','No Consumption')`).get().c;
  const totalCharges = db.prepare(`SELECT COALESCE(SUM(debit),0) v FROM ledger_transactions`).get().v;
  const totalPayments = db.prepare(`SELECT COALESCE(SUM(credit),0) v FROM ledger_transactions`).get().v;
  const outstanding = calc.roundMoney(totalCharges-totalPayments);
  res.json({subscribers,readings,totalCharges,totalPayments,outstanding,periods});
});

app.get('/api/buildings',(req,res)=>res.json(db.prepare(`SELECT * FROM buildings ORDER BY code`).all()));
app.get('/api/units',(req,res)=>res.json(db.prepare(`SELECT u.*,b.name building_name,b.code building_code FROM units u JOIN buildings b ON b.id=u.building_id ORDER BY b.code,u.code`).all()));
app.get('/api/subscribers',(req,res)=>{
  const q=(req.query.q||'').trim();
  const rows=q ? db.prepare(`SELECT s.*,u.code unit_code,b.name building_name FROM subscribers s LEFT JOIN units u ON u.id=s.unit_id LEFT JOIN buildings b ON b.id=u.building_id WHERE s.name LIKE ? OR s.code LIKE ? OR COALESCE(s.phone,'') LIKE ? ORDER BY s.code`).all(`%${q}%`,`%${q}%`,`%${q}%`) : db.prepare(`SELECT s.*,u.code unit_code,b.name building_name FROM subscribers s LEFT JOIN units u ON u.id=s.unit_id LEFT JOIN buildings b ON b.id=u.building_id ORDER BY s.code`).all();
  res.json(rows.map(r=>({...r,balance:subscriberBalance(r.id)})));
});
app.post('/api/subscribers',(req,res)=>{
  try { const {code,name,buildingId,unitCode,floor,phone,type='داخلي',guardFee=0,pumpInsurance=0,notes=''}=req.body; if(!code||!name) return res.status(400).json({error:'الكود والاسم مطلوبان'}); let unitId=null; if(buildingId&&unitCode){ const b=db.prepare('SELECT id FROM buildings WHERE id=?').get(buildingId); if(b){ const u=db.prepare('SELECT id FROM units WHERE building_id=? AND code=?').get(buildingId,unitCode); unitId=u?.id || db.prepare('INSERT INTO units(building_id,code,floor) VALUES (?,?,?)').run(buildingId,unitCode,floor||'').lastInsertRowid; }} const r=db.prepare(`INSERT INTO subscribers(organization_id,unit_id,code,name,phone,type,default_guard_fee,default_pump_insurance,notes) VALUES (?,?,?,?,?,?,?,?,?)`).run(orgId(),unitId,code,name,phone||null,type,guardFee,pumpInsurance,notes||null); audit('CREATE','subscriber',r.lastInsertRowid,null,req.body); res.json({id:r.lastInsertRowid}); } catch(e){res.status(400).json({error:e.message});}
});

app.get('/api/periods',(req,res)=>res.json(db.prepare(`SELECT * FROM billing_periods ORDER BY start_date DESC`).all()));
app.post('/api/periods',(req,res)=>{ try { const {label,startDate,endDate}=req.body; const r=db.prepare(`INSERT INTO billing_periods(organization_id,label,start_date,end_date) VALUES (?,?,?,?,?)`).run(orgId(),label||startDate,startDate,endDate); audit('CREATE','billing_period',r.lastInsertRowid,null,req.body); res.json({id:r.lastInsertRowid}); } catch(e){res.status(400).json({error:e.message});}});

app.get('/api/energy/sources',(req,res)=>res.json(db.prepare(`SELECT * FROM energy_sources ORDER BY id`).all()));
app.post('/api/energy/reading',(req,res)=>{ try { const {periodId,sourceId,previous,current,loss=0,price}=req.body; const consumption=calc.energyConsumption(previous,current,loss); const cost=consumption==null?null:calc.energyCost(consumption,price); db.prepare(`INSERT INTO energy_readings(period_id,energy_source_id,previous_reading,current_reading,loss,consumption,price_per_kwh,cost) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(period_id,energy_source_id) DO UPDATE SET previous_reading=excluded.previous_reading,current_reading=excluded.current_reading,loss=excluded.loss,consumption=excluded.consumption,price_per_kwh=excluded.price_per_kwh,cost=excluded.cost`).run(periodId,sourceId,previous,current,loss,consumption,price,cost); audit('UPSERT','energy_reading',periodId,null,req.body); res.json({consumption,cost}); } catch(e){res.status(400).json({error:e.message});}});

app.post('/api/operational-cost',(req,res)=>{ try { const {periodId,type,description,amount,allocationRule='WATER_CONSUMPTION',vendor,quantity,unitPrice,isCredit=false}=req.body; const r=db.prepare(`INSERT INTO operational_costs(period_id,cost_type,description,amount,allocation_rule,vendor,quantity,unit_price,is_credit) VALUES (?,?,?,?,?,?,?,?,?)`).run(periodId||null,type,description||'',amount,allocationRule,vendor||null,quantity||null,unitPrice||null,isCredit?1:0); audit('CREATE','operational_cost',r.lastInsertRowid,null,req.body); res.json({id:r.lastInsertRowid}); } catch(e){res.status(400).json({error:e.message});}});
app.get('/api/periods/:id/summary',(req,res)=>{ try{res.json(recalculatePeriod(Number(req.params.id)));}catch(e){res.status(400).json({error:e.message});}});

app.get('/api/meters',(req,res)=>res.json(db.prepare(`SELECT m.*,s.name subscriber_name,s.code subscriber_code,u.code unit_code FROM meters m LEFT JOIN subscribers s ON s.id=m.subscriber_id LEFT JOIN units u ON u.id=m.unit_id ORDER BY m.meter_code`).all()));
app.post('/api/meters',(req,res)=>{try{const {meterCode,meterType='مياه',subscriberId,unitId}=req.body; const r=db.prepare(`INSERT INTO meters(organization_id,meter_code,meter_type,subscriber_id,unit_id) VALUES (?,?,?,?,?)`).run(orgId(),meterCode,meterType,subscriberId||null,unitId||null); audit('CREATE','meter',r.lastInsertRowid,null,req.body); res.json({id:r.lastInsertRowid});}catch(e){res.status(400).json({error:e.message});}});

app.get('/api/readings/:periodId',(req,res)=>res.json(db.prepare(`SELECT mr.*,m.meter_code,m.subscriber_id,s.code subscriber_code,s.name subscriber_name FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id LEFT JOIN subscribers s ON s.id=m.subscriber_id WHERE mr.period_id=? ORDER BY s.code,m.meter_code`).all(req.params.periodId)));
app.post('/api/readings',(req,res)=>{try{const {periodId,meterId,previous,current,note=''}=req.body; const existing=db.prepare(`SELECT * FROM meter_readings WHERE period_id=? AND meter_id=?`).get(periodId,meterId); const status=current===''||current==null?'Pending':calc.meterConsumption(previous,current)<0?'Invalid':calc.meterConsumption(previous,current)===0?'No Consumption':'Entered'; db.prepare(`INSERT INTO meter_readings(period_id,meter_id,previous_reading,current_reading,status,note) VALUES (?,?,?,?,?,?) ON CONFLICT(period_id,meter_id) DO UPDATE SET previous_reading=excluded.previous_reading,current_reading=excluded.current_reading,status=excluded.status,note=excluded.note,updated_at=CURRENT_TIMESTAMP`).run(periodId,meterId,previous||null,current===''?null:current,status,note); audit('UPSERT','meter_reading',existing?.id||null,existing,req.body); res.json({status,consumption:calc.meterConsumption(previous,current)});}catch(e){res.status(400).json({error:e.message});}});

app.post('/api/payments',(req,res)=>{try{const {subscriberId,amount,date,method='Cash',receiptNumber,reference,note}=req.body; if(!subscriberId||Number(amount)<=0||!date) return res.status(400).json({error:'بيانات الدفعة غير مكتملة'}); const tx=db.transaction(()=>{const p=db.prepare(`INSERT INTO payments(subscriber_id,amount,payment_date,method,receipt_number,reference,note) VALUES (?,?,?,?,?,?,?)`).run(subscriberId,Number(amount),date,method,receiptNumber||null,reference||null,note||null); db.prepare(`INSERT INTO ledger_transactions(subscriber_id,period_id,transaction_type,debit,credit,description,source_table,source_id) VALUES (?,?,?,0,?,?,?,?)`).run(subscriberId,null,'PAYMENT',Number(amount),`دفعة رقم ${receiptNumber||p.lastInsertRowid}`,'payments',p.lastInsertRowid); return p.lastInsertRowid;}); const id=tx(); audit('CREATE','payment',id,null,req.body); res.json({id});}catch(e){res.status(400).json({error:e.message});}});

app.get('/api/subscribers/:id/account',(req,res)=>{const id=Number(req.params.id); const s=db.prepare(`SELECT s.*,u.code unit_code,b.name building_name FROM subscribers s LEFT JOIN units u ON u.id=s.unit_id LEFT JOIN buildings b ON b.id=u.building_id WHERE s.id=?`).get(id); if(!s)return res.status(404).json({error:'غير موجود'}); const ledger=db.prepare(`SELECT * FROM ledger_transactions WHERE subscriber_id=? ORDER BY created_at DESC,id DESC`).all(id); const readings=db.prepare(`SELECT mr.*,bp.label FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id JOIN billing_periods bp ON bp.id=mr.period_id WHERE m.subscriber_id=? ORDER BY bp.start_date DESC`).all(id); const payments=db.prepare(`SELECT * FROM payments WHERE subscriber_id=? ORDER BY payment_date DESC,id DESC`).all(id); res.json({subscriber:s,balance:subscriberBalance(id),ledger,readings,payments});});

app.post('/api/import/excel', upload.single('file'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'لم يتم رفع ملف'});
  try {
    const workbook=xlsx.readFile(req.file.path,{cellDates:true});
    const result={sheets:workbook.SheetNames, counts:{}};
    for(const sn of workbook.SheetNames){const rows=xlsx.utils.sheet_to_json(workbook.Sheets[sn],{defval:null}); result.counts[sn]=rows.length;}
    res.json(result);
  } catch(e){res.status(400).json({error:e.message});}
});

function sendXlsx(res, filename, headers, rows){
  const ws=xlsx.utils.aoa_to_sheet([headers,...rows]);
  const wb=xlsx.utils.book_new(); xlsx.utils.book_append_sheet(wb,ws,'تقرير');
  const buf=xlsx.write(wb,{type:'buffer',bookType:'xlsx'});
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(filename)}"`); res.send(buf);
}
app.get('/api/export/subscribers.xlsx',(req,res)=>{try{const rows=db.prepare(`SELECT s.code,s.name,b.name building_name,u.code unit_code,s.phone,COALESCE((SELECT SUM(debit-credit) FROM ledger_transactions lt WHERE lt.subscriber_id=s.id),0) balance FROM subscribers s LEFT JOIN units u ON u.id=s.unit_id LEFT JOIN buildings b ON b.id=u.building_id WHERE s.active=1 ORDER BY s.code`).all();sendXlsx(res,'المشتركون.xlsx',['الكود','الاسم','البناية','الوحدة','الهاتف','الرصيد'],rows.map(r=>[r.code,r.name,r.building_name||'',r.unit_code||'',r.phone||'',r.balance]));}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/export/period/:id.xlsx',(req,res)=>{try{const id=Number(req.params.id);const rows=db.prepare(`SELECT s.code subscriber_code,s.name subscriber_name,mr.previous_reading,mr.current_reading,mr.consumption,mr.status,mr.charge_amount,bp.label period_label FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id LEFT JOIN subscribers s ON s.id=m.subscriber_id JOIN billing_periods bp ON bp.id=mr.period_id WHERE mr.period_id=? ORDER BY s.code`).all(id);sendXlsx(res,'تقرير-'+id+'.xlsx',['الكود','الاسم','القراءة السابقة','القراءة الحالية','الاستهلاك','الحالة','قيمة المياه','الفترة'],rows.map(r=>[r.subscriber_code||'',r.subscriber_name||'',r.previous_reading??'',r.current_reading??'',r.consumption??'',r.status||'',r.charge_amount??'',r.period_label||'']));}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/audit',(req,res)=>res.json(db.prepare(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100`).all()));
app.get('/api/settings',(req,res)=>{ const org=db.prepare('SELECT * FROM organizations LIMIT 1').get(); res.json(org); });

app.use((req,res)=>{ if(req.path.startsWith('/api/')) return res.status(404).json({error:'API route not found'}); res.sendFile(path.join(__dirname,'..','public','index.html')); });

const port=process.env.PORT||3000;
if (require.main === module) app.listen(port,()=>console.log(`Amin Building Manager running on http://localhost:${port}`));
module.exports = app;
