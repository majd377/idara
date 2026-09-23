import json, os, sqlite3, math, csv, zipfile, xml.etree.ElementTree as ET
from datetime import datetime, date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROOT=os.path.dirname(os.path.abspath(__file__))
DB_PATH=os.path.join(ROOT,'db','amin.sqlite3')
os.makedirs(os.path.dirname(DB_PATH),exist_ok=True)

SCHEMA='''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS organizations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,currency TEXT NOT NULL DEFAULT 'ILS',currency_symbol TEXT NOT NULL DEFAULT '₪',timezone TEXT NOT NULL DEFAULT 'Asia/Hebron',water_unit_name TEXT NOT NULL DEFAULT 'كوب (م³)',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS buildings(id INTEGER PRIMARY KEY AUTOINCREMENT,organization_id INTEGER NOT NULL,code TEXT NOT NULL,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(organization_id) REFERENCES organizations(id),UNIQUE(organization_id,code));
CREATE TABLE IF NOT EXISTS units(id INTEGER PRIMARY KEY AUTOINCREMENT,building_id INTEGER NOT NULL,code TEXT NOT NULL,floor TEXT,unit_number TEXT,unit_type TEXT DEFAULT 'سكنية',active INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(building_id) REFERENCES buildings(id),UNIQUE(building_id,code));
CREATE TABLE IF NOT EXISTS subscribers(id INTEGER PRIMARY KEY AUTOINCREMENT,organization_id INTEGER NOT NULL,unit_id INTEGER,code TEXT NOT NULL,name TEXT NOT NULL,phone TEXT,type TEXT NOT NULL DEFAULT 'داخلي',active INTEGER NOT NULL DEFAULT 1,default_guard_fee NUMERIC NOT NULL DEFAULT 0,default_pump_insurance NUMERIC NOT NULL DEFAULT 0,notes TEXT,FOREIGN KEY(organization_id) REFERENCES organizations(id),FOREIGN KEY(unit_id) REFERENCES units(id),UNIQUE(organization_id,code));
CREATE TABLE IF NOT EXISTS meters(id INTEGER PRIMARY KEY AUTOINCREMENT,organization_id INTEGER NOT NULL,meter_code TEXT NOT NULL,meter_type TEXT NOT NULL,subscriber_id INTEGER,unit_id INTEGER,active INTEGER NOT NULL DEFAULT 1,FOREIGN KEY(organization_id) REFERENCES organizations(id),FOREIGN KEY(subscriber_id) REFERENCES subscribers(id),FOREIGN KEY(unit_id) REFERENCES units(id),UNIQUE(organization_id,meter_code));
CREATE TABLE IF NOT EXISTS billing_periods(id INTEGER PRIMARY KEY AUTOINCREMENT,organization_id INTEGER NOT NULL,label TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Draft',approved_at TEXT,closed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(organization_id) REFERENCES organizations(id),UNIQUE(organization_id,start_date,end_date));
CREATE TABLE IF NOT EXISTS meter_readings(id INTEGER PRIMARY KEY AUTOINCREMENT,period_id INTEGER NOT NULL,meter_id INTEGER NOT NULL,previous_reading NUMERIC,current_reading NUMERIC,consumption NUMERIC,unit_price NUMERIC,charge_amount NUMERIC,status TEXT NOT NULL DEFAULT 'Pending',note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(period_id) REFERENCES billing_periods(id),FOREIGN KEY(meter_id) REFERENCES meters(id),UNIQUE(period_id,meter_id));
CREATE TABLE IF NOT EXISTS energy_sources(id INTEGER PRIMARY KEY AUTOINCREMENT,organization_id INTEGER NOT NULL,name TEXT NOT NULL,source_type TEXT NOT NULL DEFAULT 'مولد',provider TEXT,active INTEGER NOT NULL DEFAULT 1,notes TEXT,FOREIGN KEY(organization_id) REFERENCES organizations(id),UNIQUE(organization_id,name));
CREATE TABLE IF NOT EXISTS energy_readings(id INTEGER PRIMARY KEY AUTOINCREMENT,period_id INTEGER NOT NULL,energy_source_id INTEGER NOT NULL,previous_reading NUMERIC,current_reading NUMERIC,loss NUMERIC NOT NULL DEFAULT 0,consumption NUMERIC,price_per_kwh NUMERIC,cost NUMERIC,notes TEXT,FOREIGN KEY(period_id) REFERENCES billing_periods(id),FOREIGN KEY(energy_source_id) REFERENCES energy_sources(id),UNIQUE(period_id,energy_source_id));
CREATE TABLE IF NOT EXISTS operational_costs(id INTEGER PRIMARY KEY AUTOINCREMENT,period_id INTEGER,cost_type TEXT NOT NULL,description TEXT,amount NUMERIC NOT NULL,allocation_rule TEXT NOT NULL DEFAULT 'WATER_CONSUMPTION',vendor TEXT,quantity NUMERIC,unit_price NUMERIC,is_credit INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(period_id) REFERENCES billing_periods(id));
CREATE TABLE IF NOT EXISTS charges(id INTEGER PRIMARY KEY AUTOINCREMENT,subscriber_id INTEGER NOT NULL,period_id INTEGER,type TEXT NOT NULL,description TEXT,amount NUMERIC NOT NULL,source_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(subscriber_id) REFERENCES subscribers(id),FOREIGN KEY(period_id) REFERENCES billing_periods(id));
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,subscriber_id INTEGER NOT NULL,amount NUMERIC NOT NULL,payment_date TEXT NOT NULL,method TEXT NOT NULL DEFAULT 'Cash',receipt_number TEXT,reference TEXT,note TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(subscriber_id) REFERENCES subscribers(id));
CREATE TABLE IF NOT EXISTS ledger_transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,subscriber_id INTEGER NOT NULL,period_id INTEGER,transaction_type TEXT NOT NULL,debit NUMERIC NOT NULL DEFAULT 0,credit NUMERIC NOT NULL DEFAULT 0,description TEXT,source_table TEXT,source_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(subscriber_id) REFERENCES subscribers(id),FOREIGN KEY(period_id) REFERENCES billing_periods(id));
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL DEFAULT 'system',action TEXT NOT NULL,entity_type TEXT,entity_id INTEGER,old_value TEXT,new_value TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS system_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_readings_period ON meter_readings(period_id);CREATE INDEX IF NOT EXISTS idx_readings_meter ON meter_readings(meter_id);CREATE INDEX IF NOT EXISTS idx_ledger_sub ON ledger_transactions(subscriber_id);CREATE INDEX IF NOT EXISTS idx_ledger_period ON ledger_transactions(period_id);
'''

def db():
    c=sqlite3.connect(DB_PATH); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON'); return c

def init_db():
    c=db(); c.executescript(SCHEMA)
    if c.execute('SELECT 1 FROM organizations LIMIT 1').fetchone() is None:
        c.execute("INSERT INTO organizations(name,currency,currency_symbol,timezone,water_unit_name) VALUES(?,?,?,?,?)",('عمارة الأمين','ILS','₪','Asia/Hebron','كوب (م³)'))
        oid=c.execute('SELECT id FROM organizations LIMIT 1').fetchone()[0]
        c.execute('INSERT INTO buildings(organization_id,code,name) VALUES(?,?,?)',(oid,'1','البناية الأولى'))
        c.execute('INSERT INTO buildings(organization_id,code,name) VALUES(?,?,?)',(oid,'2','البناية الثانية'))
        for name,typ in [('مولد أبو زايد','مولد'),('مولد السويسي','مولد'),('مولد خارجي','مولد خارجي')]: c.execute('INSERT INTO energy_sources(organization_id,name,source_type) VALUES(?,?,?)',(oid,name,typ))
        seed_subscribers(c,oid)
        c.execute("INSERT INTO billing_periods(organization_id,label,start_date,end_date,status) VALUES(?,?,?,?,?)",(oid,'أسبوع 03/09/2026','2026-09-03','2026-09-03','Calculated'))
        pid=c.execute('SELECT id FROM billing_periods ORDER BY id DESC LIMIT 1').fetchone()[0]
        seed_readings(c,pid)
    c.commit(); c.close()

def seed_subscribers(c,oid):
    data=json.load(open(os.path.join(ROOT,'data_seed.json'),encoding='utf-8'))['subscribers']
    bids={r['code']:r['id'] for r in c.execute('SELECT id,code FROM buildings').fetchall()}
    for r in data:
        b_id=bids.get(str(r[2]))
        unit_code=r[0]
        uid=None
        if b_id:
            row=c.execute('SELECT id FROM units WHERE building_id=? AND code=?',(b_id,unit_code)).fetchone()
            if not row:
                uid=c.execute('INSERT INTO units(building_id,code,floor) VALUES(?,?,?)',(b_id,unit_code,r[3])).lastrowid
            else: uid=row[0]
        c.execute('INSERT OR IGNORE INTO subscribers(organization_id,unit_id,code,name,phone,type,active,default_guard_fee,default_pump_insurance,notes) VALUES(?,?,?,?,?,?,?,?,?,?)',(oid,uid,str(r[0]),r[1],str(r[5]) if r[5] is not None else None,r[4],1 if str(r[6])=='نعم' else 0,float(r[7] or 0),float(r[8] or 0),r[9]))
        s_id=c.execute('SELECT id FROM subscribers WHERE organization_id=? AND code=?',(oid,str(r[0]))).fetchone()[0]
        # Every internal subscriber gets a stable water meter code; external gets one too.
        c.execute('INSERT OR IGNORE INTO meters(organization_id,meter_code,meter_type,subscriber_id,unit_id) VALUES(?,?,?,?,?)',(oid,f"W-{r[0]}",'مياه',s_id,uid))

def seed_readings(c,pid):
    sample=[('1-01',33455,35981),('1-02',751616,756537),('1-03',2687303,2688073),('1-04',45789,45852),('1-05',127084,129225),('1-06',62437,62942),('1-07',165343,166530),('1-08',54965,56020)]
    for code,prev,cur in sample:
        m=c.execute('SELECT id FROM meters WHERE meter_code=?',(f'W-{code}',)).fetchone()
        if m: c.execute('INSERT OR IGNORE INTO meter_readings(period_id,meter_id,previous_reading,current_reading,status) VALUES(?,?,?,?,?)',(pid,m[0],prev,cur,'Entered'))

def audit(c,action,etype,eid,old=None,new=None):
    c.execute('INSERT INTO audit_logs(actor,action,entity_type,entity_id,old_value,new_value) VALUES(?,?,?,?,?,?)',('admin',action,etype,eid,json.dumps(old,ensure_ascii=False),json.dumps(new,ensure_ascii=False)))

def n(v):
    try:return float(v or 0)
    except:return 0.0

def meter_consumption(prev,cur):
    if prev in (None,'') or cur in (None,''): return None
    return round((n(cur)-n(prev))/1000,3)

def energy_consumption(prev,cur,loss=0):
    if prev in (None,'') or cur in (None,''): return None
    return n(cur)-n(prev)+n(loss)

def round_money(v): return round(n(v)+1e-9,2)

def subscriber_balance(c,sid):
    r=c.execute('SELECT COALESCE(SUM(debit),0)-COALESCE(SUM(credit),0) v FROM ledger_transactions WHERE subscriber_id=?',(sid,)).fetchone(); return round_money(r['v'])

def recalc_period(pid):
    c=db(); p=c.execute('SELECT * FROM billing_periods WHERE id=?',(pid,)).fetchone()
    if not p: c.close(); raise ValueError('الفترة غير موجودة')
    et=0
    for r in c.execute('SELECT er.*,es.name FROM energy_readings er JOIN energy_sources es ON es.id=er.energy_source_id WHERE er.period_id=?',(pid,)):
        cons=energy_consumption(r['previous_reading'],r['current_reading'],r['loss']); et += round_money(cons*n(r['price_per_kwh'])) if cons is not None else 0
    costs=c.execute('SELECT * FROM operational_costs WHERE period_id=?',(pid,)).fetchall(); net=et+sum((-n(x['amount']) if x['is_credit'] else n(x['amount'])) for x in costs)
    rows=c.execute('SELECT mr.*,m.subscriber_id FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id WHERE mr.period_id=?',(pid,)).fetchall()
    total=0
    for r in rows:
        cons=meter_consumption(r['previous_reading'],r['current_reading']); status='Pending' if cons is None else ('Invalid' if cons<0 else ('No Consumption' if cons==0 else 'Calculated'))
        if cons is not None and cons>=0: total+=cons
        c.execute('UPDATE meter_readings SET consumption=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(cons,status,r['id']))
    raw=net/total if total>0 else 0; applied=math.ceil(raw) if total>0 else 0; diff=round_money(applied*total-net)
    # Rebuild water transactions for this period idempotently.
    c.execute("DELETE FROM charges WHERE period_id=? AND type='WATER'",(pid,)); c.execute("DELETE FROM ledger_transactions WHERE period_id=? AND transaction_type='WATER'",(pid,))
    c.execute('UPDATE meter_readings SET unit_price=?,charge_amount=CASE WHEN status!=\'Invalid\' AND consumption IS NOT NULL THEN ROUND(consumption*?,2) ELSE NULL END WHERE period_id=?',(applied,applied,pid))
    groups=c.execute("SELECT m.subscriber_id,SUM(COALESCE(mr.charge_amount,0)) amount FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id WHERE mr.period_id=? AND m.subscriber_id IS NOT NULL AND mr.status!='Invalid' GROUP BY m.subscriber_id",(pid,)).fetchall()
    for g in groups:
        amt=round_money(g['amount'])
        if amt:
            desc=f"مياه {p['label']}"; cid=c.execute('INSERT INTO charges(subscriber_id,period_id,type,description,amount) VALUES(?,?,?,?,?)',(g['subscriber_id'],pid,'WATER',desc,amt)).lastrowid
            c.execute('INSERT INTO ledger_transactions(subscriber_id,period_id,transaction_type,debit,credit,description,source_table,source_id) VALUES(?,?,?,?,?,?,?,?)',(g['subscriber_id'],pid,'WATER',amt,0,desc,'charges',cid))
    audit(c,'RECALCULATE','billing_period',pid,None,{'totalConsumption':round_money(total),'netOperational':round_money(net),'rawUnitPrice':raw,'appliedUnitPrice':applied,'roundingDifference':diff}); c.commit(); c.close()
    return {'period':dict(p),'energyTotal':round_money(et),'netOperational':round_money(net),'totalConsumption':round_money(total),'rawUnitPrice':raw,'appliedUnitPrice':applied,'roundingDifference':diff}

# load seed data produced from the provided workbook analysis
if not os.path.exists(os.path.join(ROOT,'data_seed.json')):
    raise SystemExit('data_seed.json missing')
init_db()

class Handler(BaseHTTPRequestHandler):
    def _json(self,obj,status=200):
        b=json.dumps(obj,ensure_ascii=False,default=str).encode('utf-8'); self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
    def _body(self):
        l=int(self.headers.get('Content-Length','0')); return json.loads(self.rfile.read(l) or b'{}')
    def do_GET(self):
        p=urlparse(self.path); path=p.path; qs=parse_qs(p.query); c=db()
        try:
            if path=='/api/dashboard':
                periods=c.execute('SELECT * FROM billing_periods ORDER BY start_date DESC LIMIT 12').fetchall(); sub=c.execute('SELECT COUNT(*) v FROM subscribers WHERE active=1').fetchone()['v']; ch=c.execute('SELECT COALESCE(SUM(debit),0)v FROM ledger_transactions').fetchone()['v']; pay=c.execute('SELECT COALESCE(SUM(credit),0)v FROM ledger_transactions').fetchone()['v']; self._json({'subscribers':sub,'totalCharges':ch,'totalPayments':pay,'outstanding':round_money(ch-pay),'periods':[dict(x) for x in periods]}); return
            if path=='/api/buildings': self._json([dict(x) for x in c.execute('SELECT * FROM buildings ORDER BY code')]); return
            if path=='/api/subscribers':
                q=qs.get('q',[''])[0]; sql='SELECT s.*,u.code unit_code,b.name building_name,u.floor FROM subscribers s LEFT JOIN units u ON u.id=s.unit_id LEFT JOIN buildings b ON b.id=u.building_id'; args=[]
                if q: sql+=' WHERE s.name LIKE ? OR s.code LIKE ? OR COALESCE(s.phone,\'\') LIKE ?'; args=[f'%{q}%',f'%{q}%',f'%{q}%']
                sql+=' ORDER BY s.code'; rows=[]
                for r in c.execute(sql,args): d=dict(r); d['balance']=subscriber_balance(c,r['id']); rows.append(d)
                self._json(rows); return
            if path=='/api/periods': self._json([dict(x) for x in c.execute('SELECT * FROM billing_periods ORDER BY start_date DESC')]); return
            if path.startswith('/api/periods/') and path.endswith('/summary'): self._json(recalc_period(int(path.split('/')[3]))); return
            if path.startswith('/api/readings/'):
                pid=int(path.split('/')[3]); self._json([dict(x) for x in c.execute('SELECT mr.*,m.meter_code,s.code subscriber_code,s.name subscriber_name FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id LEFT JOIN subscribers s ON s.id=m.subscriber_id WHERE mr.period_id=? ORDER BY s.code,m.meter_code',(pid,))]); return
            if path=='/api/meters': self._json([dict(x) for x in c.execute('SELECT m.*,s.name subscriber_name,s.code subscriber_code,u.code unit_code FROM meters m LEFT JOIN subscribers s ON s.id=m.subscriber_id LEFT JOIN units u ON u.id=m.unit_id ORDER BY m.meter_code')]); return
            if path=='/api/energy/sources': self._json([dict(x) for x in c.execute('SELECT * FROM energy_sources ORDER BY id')]); return
            if path.startswith('/api/subscribers/') and path.endswith('/account'):
                sid=int(path.split('/')[3]); s=c.execute('SELECT s.*,u.code unit_code,b.name building_name,u.floor FROM subscribers s LEFT JOIN units u ON u.id=s.unit_id LEFT JOIN buildings b ON b.id=u.building_id WHERE s.id=?',(sid,)).fetchone();
                if not s: self._json({'error':'غير موجود'},404); return
                self._json({'subscriber':dict(s),'balance':subscriber_balance(c,sid),'ledger':[dict(x) for x in c.execute('SELECT * FROM ledger_transactions WHERE subscriber_id=? ORDER BY created_at DESC,id DESC',(sid,))],'readings':[dict(x) for x in c.execute('SELECT mr.*,bp.label FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id JOIN billing_periods bp ON bp.id=mr.period_id WHERE m.subscriber_id=? ORDER BY bp.start_date DESC',(sid,))],'payments':[dict(x) for x in c.execute('SELECT * FROM payments WHERE subscriber_id=? ORDER BY payment_date DESC,id DESC',(sid,))]}); return
            if path=='/api/audit': self._json([dict(x) for x in c.execute('SELECT * FROM audit_logs ORDER BY created_at DESC,id DESC LIMIT 200')]); return
            if path=='/api/settings': self._json(dict(c.execute('SELECT * FROM organizations LIMIT 1').fetchone())); return
            if path.startswith('/api/'): self._json({'error':'API route not found'},404); return
            rel=path.lstrip('/') or 'index.html'
            public_root=os.path.join(ROOT,'public')
            fp=os.path.normpath(os.path.join(public_root,rel))
            if not fp.startswith(public_root): self._json({'error':'Forbidden'},403); return
            if not os.path.isfile(fp): self._json({'error':'Not found'},404); return
            ext=os.path.splitext(fp)[1].lower(); ct={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8'}.get(ext,'application/octet-stream')
            b=open(fp,'rb').read(); self.send_response(200); self.send_header('Content-Type',ct); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b)
        except Exception as e: self._json({'error':str(e)},400)
        finally: c.close()
    def do_POST(self):
        path=urlparse(self.path).path; data=self._body(); c=db()
        try:
            oid=c.execute('SELECT id FROM organizations LIMIT 1').fetchone()['id']
            if path=='/api/subscribers':
                code=data.get('code'); name=data.get('name'); bid=data.get('buildingId'); unit_code=data.get('unitCode') or code; floor=data.get('floor') or ''
                if not code or not name: self._json({'error':'الكود والاسم مطلوبان'},400); return
                uid=None
                if bid:
                    row=c.execute('SELECT id FROM units WHERE building_id=? AND code=?',(bid,unit_code)).fetchone(); uid=row['id'] if row else c.execute('INSERT INTO units(building_id,code,floor) VALUES(?,?,?)',(bid,unit_code,floor)).lastrowid
                sid=c.execute('INSERT INTO subscribers(organization_id,unit_id,code,name,phone,type,default_guard_fee,default_pump_insurance,notes) VALUES(?,?,?,?,?,?,?,?,?)',(oid,uid,code,name,data.get('phone'),data.get('type','داخلي'),1,float(data.get('guardFee') or 0),float(data.get('pumpInsurance') or 0),data.get('notes'))).lastrowid
                c.execute('INSERT INTO meters(organization_id,meter_code,meter_type,subscriber_id,unit_id) VALUES(?,?,?,?,?)',(oid,f'W-{code}','مياه',sid,uid)); audit(c,'CREATE','subscriber',sid,None,data); c.commit(); self._json({'id':sid}); return
            if path=='/api/periods':
                r=c.execute('INSERT INTO billing_periods(organization_id,label,start_date,end_date) VALUES(?,?,?,?,?)',(oid,data.get('label') or data['startDate'],data['startDate'],data['endDate'])).lastrowid; audit(c,'CREATE','billing_period',r,None,data); c.commit(); self._json({'id':r}); return
            if path=='/api/readings':
                pid=int(data['periodId']); mid=int(data['meterId']); prev=data.get('previous'); cur=data.get('current'); cons=meter_consumption(prev,cur); status='Pending' if cur in (None,'') else ('Invalid' if cons is not None and cons<0 else ('No Consumption' if cons==0 else 'Entered'))
                c.execute('INSERT INTO meter_readings(period_id,meter_id,previous_reading,current_reading,status,note) VALUES(?,?,?,?,?,?) ON CONFLICT(period_id,meter_id) DO UPDATE SET previous_reading=excluded.previous_reading,current_reading=excluded.current_reading,status=excluded.status,note=excluded.note,updated_at=CURRENT_TIMESTAMP',(pid,mid,prev if prev!='' else None,cur if cur!='' else None,status,data.get('note',''))); audit(c,'UPSERT','meter_reading',None,None,data); c.commit(); self._json({'status':status,'consumption':cons}); return
            if path=='/api/energy/reading':
                pid=int(data['periodId']); sid=int(data['sourceId']); cons=energy_consumption(data.get('previous'),data.get('current'),data.get('loss',0)); cost=round_money(cons*n(data.get('price'))) if cons is not None else None
                c.execute('INSERT INTO energy_readings(period_id,energy_source_id,previous_reading,current_reading,loss,consumption,price_per_kwh,cost) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(period_id,energy_source_id) DO UPDATE SET previous_reading=excluded.previous_reading,current_reading=excluded.current_reading,loss=excluded.loss,consumption=excluded.consumption,price_per_kwh=excluded.price_per_kwh,cost=excluded.cost',(pid,sid,data.get('previous'),data.get('current'),data.get('loss',0),cons,data.get('price'),cost)); audit(c,'UPSERT','energy_reading',None,None,data); c.commit(); self._json({'consumption':cons,'cost':cost}); return
            if path=='/api/operational-cost':
                r=c.execute('INSERT INTO operational_costs(period_id,cost_type,description,amount,allocation_rule,vendor,quantity,unit_price,is_credit) VALUES(?,?,?,?,?,?,?,?,?)',(data.get('periodId'),data.get('type','مصروف آخر'),data.get('description',''),float(data.get('amount') or 0),data.get('allocationRule','WATER_CONSUMPTION'),data.get('vendor'),data.get('quantity'),data.get('unitPrice'),1 if data.get('isCredit') else 0)).lastrowid; audit(c,'CREATE','operational_cost',r,None,data); c.commit(); self._json({'id':r}); return
            if path=='/api/payments':
                sid=int(data['subscriberId']); amount=float(data['amount']); p=c.execute('INSERT INTO payments(subscriber_id,amount,payment_date,method,receipt_number,reference,note) VALUES(?,?,?,?,?,?,?)',(sid,amount,data.get('date') or date.today().isoformat(),data.get('method','Cash'),data.get('receiptNumber'),data.get('reference'),data.get('note'))).lastrowid; c.execute('INSERT INTO ledger_transactions(subscriber_id,transaction_type,debit,credit,description,source_table,source_id) VALUES(?,?,?,?,?,?,?)',(sid,'PAYMENT',0,amount,f"دفعة {data.get('receiptNumber') or p}",'payments',p)); audit(c,'CREATE','payment',p,None,data); c.commit(); self._json({'id':p}); return
            if path=='/api/recalculate': self._json(recalc_period(int(data['periodId']))); return
            self._json({'error':'API route not found'},404)
        except Exception as e: c.rollback(); self._json({'error':str(e)},400)
        finally:c.close()

if __name__=='__main__':
    port=int(os.environ.get('PORT','3000')); print(f'عمارة الأمين running on http://localhost:{port}'); ThreadingHTTPServer(('0.0.0.0',port),Handler).serve_forever()
