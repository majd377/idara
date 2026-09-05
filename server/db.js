const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbDir = process.env.AMIN_DB_DIR || (process.env.VERCEL ? '/tmp/amin-building-manager-db' : path.join(__dirname, '..', 'db'));
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const database = new DatabaseSync(path.join(dbDir, 'amin.db'));
database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

afterInit(database);

function wrap(db) {
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql),
    transaction: (fn) => () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch {}
        throw err;
      }
    },
  };
}

function afterInit(raw) {
  const schema = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8');
  raw.exec(schema);
  const existingOrg = raw.prepare('SELECT id FROM organizations LIMIT 1').get();
  if (existingOrg) return;

  const db = wrap(raw);
  const org = db.prepare(`INSERT INTO organizations (name,currency,currency_symbol,timezone,water_unit_name) VALUES (?,?,?,?,?)`).run('عمارة الأمين', 'ILS', '₪', 'Asia/Hebron', 'كوب (م³)');
  db.prepare(`INSERT INTO buildings (organization_id, code, name) VALUES (?,?,?)`).run(org.lastInsertRowid, '1', 'البناية الأولى');
  db.prepare(`INSERT INTO buildings (organization_id, code, name) VALUES (?,?,?)`).run(org.lastInsertRowid, '2', 'البناية الثانية');
  for (const [name,type] of [['مولد أبو زايد','مولد'],['مولد السويسي','مولد'],['مولد خارجي','مولد خارجي']]) {
    db.prepare(`INSERT INTO energy_sources (organization_id,name,source_type) VALUES (?,?,?)`).run(org.lastInsertRowid,name,type);
  }
  const services = [
    ['GUARD','خدمة الحارس',30,'MONTHLY','EACH_SUBSCRIBER'],
    ['PUMP','تأمين الغاطس',15,'CUSTOM','EACH_SUBSCRIBER'],
    ['MAINT','صيانة مشتركة',0,'CUSTOM','CUSTOM'],
    ['OTHER','خدمة/مصروف آخر',0,'CUSTOM','CUSTOM']
  ];
  for (const s of services) db.prepare(`INSERT INTO services (organization_id,code,name,default_amount,frequency,allocation_rule) VALUES (?,?,?,?,?,?)`).run(org.lastInsertRowid,...s);

  try {
    const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data_seed.json'), 'utf8'));
    const buildingMap = new Map(db.prepare('SELECT id, code FROM buildings WHERE organization_id=?').all(org.lastInsertRowid).map(r => [String(r.code), r.id]));
    const insertUnit = db.prepare(`INSERT OR IGNORE INTO units (building_id, code, floor, unit_number) VALUES (?,?,?,?)`);
    const insertSubscriber = db.prepare(`INSERT OR IGNORE INTO subscribers (organization_id,unit_id,code,name,phone,type,default_guard_fee,default_pump_insurance,notes) VALUES (?,?,?,?,?,?,?,?,?)`);
    const insertMeter = db.prepare(`INSERT OR IGNORE INTO meters (organization_id,meter_code,meter_type,subscriber_id,unit_id) VALUES (?,?,?,?,?)`);
    for (const row of (seed.subscribers || [])) {
      const [code,name,buildingCode,floor,type,phone,_active,guardFee,pumpInsurance,notes] = row;
      let unitId = null;
      const buildingId = buildingMap.get(String(buildingCode));
      if (buildingId) {
        insertUnit.run(buildingId, String(code), String(floor ?? ''), String(code));
        unitId = db.prepare('SELECT id FROM units WHERE building_id=? AND code=?').get(buildingId, String(code)).id;
      }
      insertSubscriber.run(org.lastInsertRowid, unitId, String(code), String(name).trim(), phone ? String(phone) : null, type || 'داخلي', Number(guardFee||0), Number(pumpInsurance||0), notes || null);
      const subscriber = db.prepare('SELECT id FROM subscribers WHERE organization_id=? AND code=?').get(org.lastInsertRowid, String(code));
      if (subscriber) insertMeter.run(org.lastInsertRowid, `W-${code}`, 'مياه', subscriber.id, unitId);
    }
  } catch (e) {
    console.warn('Seed data import skipped:', e.message);
  }
}

module.exports = wrap(database);
