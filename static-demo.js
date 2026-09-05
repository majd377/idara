/*
 * GitHub Pages / static-host demo adapter.
 * It keeps the application interactive in the browser using localStorage.
 * Local production mode still uses the real SQLite + API backend.
 */
(function () {
  const isStaticHost = ['github.io', 'githubusercontent.com'].some(suffix => location.hostname.endsWith(suffix));
  if (!isStaticHost && location.protocol !== 'file:') return;

  window.__AMIN_STATIC_DEMO__ = true;
  const KEY = 'amin-building-manager-demo-v2';
  const n = v => (v === '' || v == null ? 0 : Number(v));
  const money = v => Math.round((n(v) + Number.EPSILON) * 100) / 100;
  const roundup = v => Math.ceil(n(v));
  const parseBody = opts => { try { return opts?.body ? JSON.parse(opts.body) : {}; } catch { return {}; } };

  let data = null;
  let loading = null;
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));

  async function ensureData() {
    if (data) return data;
    if (loading) return loading;
    loading = (async () => {
      const stored = localStorage.getItem(KEY);
      if (stored) {
        try { data = JSON.parse(stored); return data; } catch {}
      }
      const res = await fetch('./data_seed.json');
      const seed = await res.json();
      data = {
        next: { id: 1000, period: 1, audit: 1 },
        buildings: [
          {id:1,organization_id:1,code:'1',name:'البناية الأولى'},
          {id:2,organization_id:1,code:'2',name:'البناية الثانية'}
        ],
        units: [], subscribers: [], meters: [], periods: [], readings: [],
        sources: [
          {id:1,name:'مولد أبو زايد',source_type:'مولد',active:1},
          {id:2,name:'مولد السويسي',source_type:'مولد',active:1},
          {id:3,name:'مولد خارجي',source_type:'مولد خارجي',active:1}
        ],
        energyReadings: [], costs: [], payments: [], ledger: [], audit: [],
      };
      for (const row of (seed.subscribers || [])) {
        const [code,name,buildingCode,floor,type,phone,_active,guardFee,pumpInsurance,notes] = row;
        const buildingId = Number(buildingCode) || 0;
        let unit = null;
        if (buildingId) {
          unit = data.units.find(u => u.building_id === buildingId && u.code === String(code));
          if (!unit) {
            unit = {id:data.next.id++,building_id:buildingId,code:String(code),floor:String(floor ?? ''),unit_number:String(code)};
            data.units.push(unit);
          }
        }
        const id = data.next.id++;
        data.subscribers.push({id,organization_id:1,unit_id:unit?.id||null,code:String(code),name:String(name).trim(),phone:phone?String(phone):null,type:type||'داخلي',active:1,default_guard_fee:n(guardFee),default_pump_insurance:n(pumpInsurance),notes:notes||null});
        data.meters.push({id:data.next.id++,meter_code:`W-${code}`,meter_type:'مياه',subscriber_id:id,unit_id:unit?.id||null,active:1});
      }
      data.periods.push({id:1,label:'أسبوع 03/09/2026',start_date:'2026-09-03',end_date:'2026-09-03',status:'Draft'});
      for (const m of data.meters) data.readings.push({id:data.next.id++,period_id:1,meter_id:m.id,previous_reading:null,current_reading:null,consumption:null,unit_price:null,charge_amount:null,status:'Pending'});
      data.audit.push({id:data.next.audit++,actor:'demo',action:'INIT',entity_type:'demo',entity_id:null,created_at:new Date().toISOString()});
      save();
      return data;
    })();
    try { return await loading; } finally { loading = null; }
  }

  function buildingName(id) { return data.buildings.find(b => b.id === Number(id))?.name || '-'; }
  function subscriberRow(s) {
    const unit = data.units.find(u => u.id === s.unit_id);
    const balance = data.ledger.filter(t => t.subscriber_id === s.id).reduce((a,t)=>a+n(t.debit)-n(t.credit),0);
    return {...s, unit_code:unit?.code||'-', building_name:buildingName(unit?.building_id), balance:money(balance)};
  }
  function subscriberBalance(id) { return money(data.ledger.filter(t => t.subscriber_id === Number(id)).reduce((a,t)=>a+n(t.debit)-n(t.credit),0)); }
  function periodSummary(id) {
    const period = data.periods.find(p => p.id === Number(id));
    const energyRows = data.energyReadings.filter(r=>r.period_id===Number(id));
    const energyTotal = energyRows.reduce((a,r)=>a+money((n(r.current_reading)-n(r.previous_reading)+n(r.loss))*n(r.price_per_kwh)),0);
    const costs = data.costs.filter(c=>c.period_id===Number(id));
    const netOperational = money(energyTotal + costs.reduce((a,c)=>a+(c.is_credit?-n(c.amount):n(c.amount)),0));
    const rows = data.readings.filter(r=>r.period_id===Number(id));
    let totalConsumption=0;
    rows.forEach(r=>{
      if(r.current_reading!=null && r.previous_reading!=null){
        r.consumption=money((n(r.current_reading)-n(r.previous_reading))/1000);
        r.status = r.consumption < 0 ? 'Invalid' : (r.consumption === 0 ? 'No Consumption':'Calculated');
        totalConsumption += r.consumption > 0 ? r.consumption : 0;
      } else r.status='Pending';
    });
    const rawUnitPrice = totalConsumption>0 ? netOperational/totalConsumption : 0;
    const appliedUnitPrice = totalConsumption>0 ? roundup(rawUnitPrice) : 0;
    rows.forEach(r=>{
      if(r.status!=='Invalid' && r.consumption!=null){ r.unit_price=appliedUnitPrice; r.charge_amount=money(r.consumption*appliedUnitPrice); }
    });
    save();
    return {period,energyTotal:money(energyTotal),netOperational:money(netOperational),totalConsumption:money(totalConsumption),rawUnitPrice,appliedUnitPrice,roundingDifference:money(appliedUnitPrice*totalConsumption-netOperational)};
  }
  function refreshWaterCharges(periodId){
    const s=periodSummary(periodId);
    // Rebuild only demo water transactions for this period.
    data.ledger = data.ledger.filter(t => !(t.period_id===Number(periodId) && t.transaction_type==='WATER'));
    for (const r of data.readings.filter(x=>x.period_id===Number(periodId) && x.status!=='Invalid')) {
      const m=data.meters.find(x=>x.id===r.meter_id); if(!m?.subscriber_id || !r.charge_amount) continue;
      data.ledger.push({id:data.next.id++,subscriber_id:m.subscriber_id,period_id:Number(periodId),transaction_type:'WATER',debit:r.charge_amount,credit:0,description:`مياه ${s.period.label}`,created_at:new Date().toISOString()});
    }
    save(); return s;
  }

  async function api(url, opts={}) {
    await ensureData();
    if (url.includes('/api/export/')) throw new Error('STATIC_EXPORT');
    const method=(opts.method||'GET').toUpperCase(), body=parseBody(opts);
    const path=url.split('?')[0];
    if (path === '/api/dashboard') {
      const totalCharges=data.ledger.reduce((a,t)=>a+n(t.debit),0), totalPayments=data.ledger.reduce((a,t)=>a+n(t.credit),0);
      return {subscribers:data.subscribers.filter(s=>s.active).length,readings:data.readings.filter(r=>['Entered','Calculated','No Consumption'].includes(r.status)).length,totalCharges:money(totalCharges),totalPayments:money(totalPayments),outstanding:money(totalCharges-totalPayments),periods:data.periods.slice().sort((a,b)=>b.start_date.localeCompare(a.start_date)).slice(0,12)};
    }
    if (path === '/api/buildings') return data.buildings;
    if (path === '/api/meters') return data.meters.map(m=>({...m,subscriber_name:data.subscribers.find(s=>s.id===m.subscriber_id)?.name,subscriber_code:data.subscribers.find(s=>s.id===m.subscriber_id)?.code,unit_code:data.units.find(u=>u.id===m.unit_id)?.code}));
    if (path === '/api/energy/sources') return data.sources;
    if (path === '/api/audit') return data.audit.slice().reverse().slice(0,100);
    if (path === '/api/settings') return {name:'عمارة الأمين',currency:'ILS',currency_symbol:'₪',timezone:'Asia/Hebron',water_unit_name:'كوب (م³)'};

    if (path === '/api/subscribers' && method === 'GET') {
      const q=new URLSearchParams(url.split('?')[1]||'').get('q')?.trim().toLowerCase()||'';
      return data.subscribers.filter(s=>!q || [s.name,s.code,s.phone||''].some(v=>String(v).toLowerCase().includes(q))).map(subscriberRow);
    }
    if (path === '/api/subscribers' && method === 'POST') {
      if (data.subscribers.some(s=>s.code===String(body.code))) throw new Error('كود المشترك مستخدم مسبقًا');
      let unit=null;
      if(body.buildingId && body.unitCode){ unit=data.units.find(u=>u.building_id===Number(body.buildingId)&&u.code===String(body.unitCode)); if(!unit){unit={id:data.next.id++,building_id:Number(body.buildingId),code:String(body.unitCode),floor:String(body.floor||''),unit_number:String(body.unitCode)};data.units.push(unit);} }
      const id=data.next.id++;
      data.subscribers.push({id,organization_id:1,unit_id:unit?.id||null,code:String(body.code),name:String(body.name),phone:body.phone||null,type:body.type||'داخلي',active:1,default_guard_fee:n(body.guardFee),default_pump_insurance:n(body.pumpInsurance),notes:body.notes||null});
      data.meters.push({id:data.next.id++,meter_code:`W-${body.code}`,meter_type:'مياه',subscriber_id:id,unit_id:unit?.id||null,active:1});
      data.audit.push({id:data.next.audit++,actor:'demo',action:'CREATE',entity_type:'subscriber',entity_id:id,created_at:new Date().toISOString()}); save(); return {id};
    }
    if (path === '/api/periods' && method === 'GET') return data.periods.slice().sort((a,b)=>b.start_date.localeCompare(a.start_date));
    if (path === '/api/periods' && method === 'POST') {
      const id=data.next.period++; data.periods.push({id,label:String(body.label||body.startDate),start_date:body.startDate,end_date:body.endDate,status:'Draft'});
      data.audit.push({id:data.next.audit++,actor:'demo',action:'CREATE',entity_type:'billing_period',entity_id:id,created_at:new Date().toISOString()});
      for (const m of data.meters) {
        const previous=[...data.readings].filter(r=>r.meter_id===m.id&&r.current_reading!=null).sort((a,b)=>b.id-a.id)[0]?.current_reading ?? null;
        data.readings.push({id:data.next.id++,period_id:id,meter_id:m.id,previous_reading:previous,current_reading:null,consumption:null,unit_price:null,charge_amount:null,status:'Pending'});
      }
      save(); return {id};
    }
    const sm=path.match(/^\/api\/periods\/(\d+)\/summary$/); if(sm) return refreshWaterCharges(Number(sm[1]));
    const rm=path.match(/^\/api\/readings\/(\d+)$/); if(rm && method==='GET') return data.readings.filter(r=>r.period_id===Number(rm[1])).map(r=>{const m=data.meters.find(x=>x.id===r.meter_id);const s=data.subscribers.find(x=>x.id===m?.subscriber_id);return {...r,meter_code:m?.meter_code,subscriber_id:s?.id,subscriber_code:s?.code,subscriber_name:s?.name};});
    if(path==='/api/readings' && method==='POST'){
      const existing=data.readings.find(r=>r.period_id===Number(body.periodId)&&r.meter_id===Number(body.meterId)); if(!existing) throw new Error('العداد غير مرتبط بالفترة');
      existing.previous_reading=body.previous===''?null:n(body.previous); existing.current_reading=body.current===''?null:n(body.current);
      const c=(existing.previous_reading!=null&&existing.current_reading!=null)?money((existing.current_reading-existing.previous_reading)/1000):null;
      existing.consumption=c; existing.status=c==null?'Pending':c<0?'Invalid':c===0?'No Consumption':'Entered'; save(); return {status:existing.status,consumption:c};
    }
    if(path==='/api/energy/reading' && method==='POST'){
      const key=`${body.periodId}:${body.sourceId}`; const row=data.energyReadings.find(r=>r.key===key)||{key}; Object.assign(row,{period_id:Number(body.periodId),energy_source_id:Number(body.sourceId),previous_reading:n(body.previous),current_reading:n(body.current),loss:n(body.loss),price_per_kwh:n(body.price)}); row.consumption=row.current_reading-row.previous_reading+row.loss; row.cost=money(row.consumption*row.price_per_kwh); if(!data.energyReadings.includes(row)) data.energyReadings.push(row); save(); return {consumption:row.consumption,cost:row.cost};
    }
    if(path==='/api/operational-cost' && method==='POST'){const c={id:data.next.id++,period_id:Number(body.periodId),cost_type:body.type,description:body.description||'',amount:n(body.amount),allocation_rule:body.allocationRule||'WATER_CONSUMPTION',vendor:body.vendor||null,is_credit:body.isCredit?1:0,created_at:new Date().toISOString()};data.costs.push(c);save();return{id:c.id};}
    if(path==='/api/payments' && method==='POST'){
      if(!body.subscriberId || n(body.amount)<=0 || !body.date) throw new Error('بيانات الدفعة غير مكتملة');
      const id=data.next.id++, p={id,subscriber_id:Number(body.subscriberId),amount:n(body.amount),payment_date:body.date,method:body.method||'Cash',receipt_number:body.receiptNumber||null,reference:body.reference||null,note:body.note||null};data.payments.push(p);data.ledger.push({id:data.next.id++,subscriber_id:p.subscriber_id,period_id:null,transaction_type:'PAYMENT',debit:0,credit:p.amount,description:`دفعة رقم ${p.receipt_number||p.id}`,created_at:new Date().toISOString()});data.audit.push({id:data.next.audit++,actor:'demo',action:'CREATE',entity_type:'payment',entity_id:id,created_at:new Date().toISOString()});save();return{id};
    }
    const am=path.match(/^\/api\/subscribers\/(\d+)\/account$/); if(am){const id=Number(am[1]), s=data.subscribers.find(x=>x.id===id); if(!s) throw new Error('المشترك غير موجود'); const ledger=data.ledger.filter(t=>t.subscriber_id===id).slice().reverse(); const readings=data.readings.filter(r=>data.meters.find(m=>m.id===r.meter_id)?.subscriber_id===id).map(r=>({...r,label:data.periods.find(p=>p.id===r.period_id)?.label||''})); const payments=data.payments.filter(p=>p.subscriber_id===id).slice().reverse(); return {subscriber:{...subscriberRow(s),building_name:buildingName(data.units.find(u=>u.id===s.unit_id)?.building_id)},balance:subscriberBalance(id),ledger,readings,payments};}
    throw new Error('المسار غير مدعوم في وضع المعاينة');
  }

  window.__AMIN_STATIC_API__ = api;
  window.addEventListener('DOMContentLoaded', () => {
    const top = document.querySelector('.topbar-heading');
    if (!top) return;
    const note=document.createElement('div'); note.className='demo-banner'; note.innerHTML='وضع المعاينة على GitHub Pages — البيانات التي تدخلها هنا محفوظة في هذا المتصفح فقط. التشغيل المحلي الكامل يستخدم SQLite.'; top.prepend(note);
  });
})();

// Simple Excel-friendly export for GitHub Pages preview (CSV with UTF-8 BOM).
window.__AMIN_STATIC_EXPORT__ = function(url,name){
  try{
    const path=url.split('?')[0];
    let rows=[], headers=[];
    if(path.includes('/export/subscribers')){
      headers=['الكود','الاسم','البناية','الوحدة','الهاتف','الرصيد'];
      rows=data.subscribers.map(s=>{const r=subscriberRow(s);return [r.code,r.name,r.building_name,r.unit_code,r.phone||'',r.balance]});
    } else {
      const m=path.match(/\/api\/export\/period\/(\d+)\.xlsx/); const pid=m?Number(m[1]):null;
      const rr=data.readings.filter(r=>r.period_id===pid); headers=['الكود','الاسم','القراءة السابقة','القراءة الحالية','الاستهلاك','الحالة','قيمة المياه'];
      rows=rr.map(r=>{const meter=data.meters.find(x=>x.id===r.meter_id);const s=data.subscribers.find(x=>x.id===meter?.subscriber_id);return [s?.code||'',s?.name||'',r.previous_reading??'',r.current_reading??'',r.consumption??'',r.status||'',r.charge_amount??'']});
    }
    const csv='\ufeff'+[headers,...rows].map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name.replace(/\.xlsx$/i,'.csv');document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),500); toast('تم تنزيل ملف يمكن فتحه مباشرة في Excel');
  }catch(e){toast('تعذر التصدير','error')}
};
