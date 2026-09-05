const db = require('../db');
const calc = require('./calculator');
function audit(action, entityType, entityId, oldValue, newValue, actor='system') {
  db.prepare(`INSERT INTO audit_logs (actor,action,entity_type,entity_id,old_value,new_value) VALUES (?,?,?,?,?,?)`).run(actor,action,entityType,entityId,JSON.stringify(oldValue ?? null),JSON.stringify(newValue ?? null));
}
function recalculatePeriod(periodId) {
  const period = db.prepare(`SELECT * FROM billing_periods WHERE id=?`).get(periodId);
  if (!period) throw new Error('الفترة غير موجودة');
  const energyRows = db.prepare(`SELECT er.*, es.name FROM energy_readings er JOIN energy_sources es ON es.id=er.energy_source_id WHERE er.period_id=?`).all(periodId);
  const energyTotal = energyRows.reduce((s,r)=>{ const c = calc.energyConsumption(r.previous_reading,r.current_reading,r.loss); return s + (c==null?0:calc.energyCost(c,r.price_per_kwh)); },0);
  const costs = db.prepare(`SELECT * FROM operational_costs WHERE period_id=?`).all(periodId);
  const netOperational = costs.reduce((s,r)=>s + (r.is_credit ? -Number(r.amount) : Number(r.amount)),0) + energyTotal;
  const rows = db.prepare(`SELECT mr.*, m.subscriber_id FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id WHERE mr.period_id=?`).all(periodId);
  let totalConsumption = 0;
  for (const r of rows) {
    const consumption = calc.meterConsumption(r.previous_reading,r.current_reading);
    const status = consumption === null ? 'Pending' : (consumption < 0 ? 'Invalid' : (consumption === 0 ? 'No Consumption' : 'Calculated'));
    if (consumption !== null && consumption >= 0) totalConsumption += consumption;
    db.prepare(`UPDATE meter_readings SET consumption=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(consumption,status,r.id);
  }
  const raw = calc.rawWaterUnitPrice(netOperational,totalConsumption);
  const applied = totalConsumption > 0 ? calc.appliedWaterUnitPrice(netOperational,totalConsumption) : 0;
  const roundingDifference = calc.roundMoney(applied * totalConsumption - netOperational);
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM charges WHERE period_id=? AND type='WATER'`).run(periodId);
    db.prepare(`DELETE FROM ledger_transactions WHERE period_id=? AND transaction_type='WATER'`).run(periodId);
    db.prepare(`UPDATE meter_readings SET unit_price=?, charge_amount=CASE WHEN status!='Invalid' AND consumption IS NOT NULL THEN ROUND(consumption*?,2) ELSE NULL END WHERE period_id=?`).run(applied || null, applied || 0, periodId);
    const grouped = db.prepare(`SELECT m.subscriber_id, ROUND(SUM(COALESCE(mr.charge_amount,0)),2) amount FROM meter_readings mr JOIN meters m ON m.id=mr.meter_id WHERE mr.period_id=? AND m.subscriber_id IS NOT NULL AND mr.status!='Invalid' GROUP BY m.subscriber_id`).all(periodId);
    for (const g of grouped) {
      if (Number(g.amount) !== 0) {
        const desc=`مياه ${period.label}`;
        const c=db.prepare(`INSERT INTO charges(subscriber_id,period_id,type,description,amount) VALUES (?,?,?,?,?)`).run(g.subscriber_id,periodId,'WATER',desc,g.amount);
        db.prepare(`INSERT INTO ledger_transactions(subscriber_id,period_id,transaction_type,debit,credit,description,source_table,source_id) VALUES (?,?,?,?,?,?,?,?)`).run(g.subscriber_id,periodId,'WATER',g.amount,0,desc,'charges',c.lastInsertRowid);
      }
    }
    audit('RECALCULATE_PERIOD','billing_period',periodId,null,{rawUnitPrice:raw,appliedUnitPrice:applied,totalConsumption,netOperational,roundingDifference});
  });
  tx();
  return { period, energyTotal:calc.roundMoney(energyTotal), netOperational:calc.roundMoney(netOperational), totalConsumption:calc.roundMoney(totalConsumption), rawUnitPrice:raw, appliedUnitPrice:applied, roundingDifference };
}
function subscriberBalance(subscriberId) { return calc.ledgerBalance(db.prepare(`SELECT debit,credit FROM ledger_transactions WHERE subscriber_id=?`).all(subscriberId)); }
module.exports={recalculatePeriod,subscriberBalance,audit};
