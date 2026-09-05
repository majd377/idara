function n(v) { return v === null || v === undefined || v === '' ? 0 : Number(v); }
function roundMoney(v) { return Math.round((n(v) + Number.EPSILON) * 100) / 100; }
function roundupInteger(v) { return Math.ceil(n(v)); }
function meterConsumption(previous, current) { if (previous === null || previous === undefined || previous === '' || current === null || current === undefined || current === '') return null; return roundMoney((n(current) - n(previous)) / 1000); }
function energyConsumption(previous, current, loss = 0) { if (previous === null || previous === undefined || previous === '' || current === null || current === undefined || current === '') return null; return n(current) - n(previous) + n(loss); }
function energyCost(consumption, price) { return roundMoney(n(consumption) * n(price)); }
function rawWaterUnitPrice(netCost, totalConsumption) { return totalConsumption > 0 ? n(netCost) / n(totalConsumption) : 0; }
function appliedWaterUnitPrice(netCost, totalConsumption) { return roundupInteger(rawWaterUnitPrice(netCost, totalConsumption)); }
function waterCharge(consumption, unitPrice) { return roundMoney(n(consumption) * n(unitPrice)); }
function ledgerBalance(rows) { return roundMoney(rows.reduce((acc, r) => acc + n(r.debit) - n(r.credit), 0)); }
module.exports = { meterConsumption, energyConsumption, energyCost, rawWaterUnitPrice, appliedWaterUnitPrice, waterCharge, ledgerBalance, roundMoney, n };
