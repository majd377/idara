const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'amin.db'));
db.pragma('foreign_keys = ON');
const schema = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8');
db.exec(schema);

const existingOrg = db.prepare('SELECT id FROM organizations LIMIT 1').get();
if (!existingOrg) {
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
}
module.exports = db;
