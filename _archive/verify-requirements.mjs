import assert from 'node:assert/strict';
import { roundTenth, appliedWaterUnitPrice, waterCharge } from './calculator.js';
assert.equal(roundTenth(27.21),27.2);
assert.equal(roundTenth(27.19),27.2);
assert.equal(appliedWaterUnitPrice(272.1,10),27.2);
assert.equal(appliedWaterUnitPrice(271.9,10),27.2);
assert.equal(waterCharge(1.234,27.2),33.5648);
console.log('OK: water rounding and resident charge rules');
