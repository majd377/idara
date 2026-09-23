function n(v) { return v === null || v === undefined || v === '' ? 0 : Number(v); }
function roundMoney(v) { return n(v); }
function roundTenth(v) { const x=n(v); return Number((Math.round((x + Number.EPSILON) * 10) / 10).toFixed(1)); }
function meterConsumption(previous, current) { if (previous === null || previous === undefined || previous === '' || current === null || current === undefined || current === '') return null; return (n(current) - n(previous)) / 1000; }
function energyConsumption(previous, current, loss = 0) { if (previous === null || previous === undefined || previous === '' || current === null || current === undefined || current === '') return null; return n(current) - n(previous) + n(loss); }
function energyCost(consumption, price) { return n(consumption) * n(price); }
function rawWaterUnitPrice(netCost, totalConsumption) { return totalConsumption > 0 ? n(netCost) / n(totalConsumption) : 0; }
function appliedWaterUnitPrice(netCost, totalConsumption) { return roundTenth(rawWaterUnitPrice(netCost, totalConsumption)); }
function waterCharge(consumption, unitPrice) { return n(consumption) * roundTenth(unitPrice); }
function ledgerBalance(rows) { return rows.reduce((acc, r) => acc + n(r.debit) - n(r.credit), 0); }
module.exports = { meterConsumption, energyConsumption, energyCost, rawWaterUnitPrice, appliedWaterUnitPrice, waterCharge, ledgerBalance, roundMoney, roundTenth, n };
