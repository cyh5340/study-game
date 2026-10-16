'use strict';
const assert = require('node:assert/strict');
require('../physics.js');
require('../levels.js');

const P = globalThis.CircuitPhysics;
const factory = globalThis.CircuitLevelFactory;

assert.equal(P.ohmsCurrent(12, 4), 3);
assert.equal(P.ohmsVoltage(3, 4), 12);
assert.equal(P.ohmsResistance(12, 3), 4);
assert.equal(P.seriesResistance([2, 4]), 6);
assert.equal(P.parallelResistance([6, 12]), 4);
assert.equal(P.voltageDividerOutput(12, 2000, 1000), 4);
assert.equal(P.ledSeriesCurrent(9, 2, 350), 0.02);
assert.ok(P.nearlyEqual(P.powerFromCurrent(0.02, 350), 0.14));
assert.equal(P.powerFromVoltageCurrent(12, 2), 24);
assert.equal(P.powerFromVoltage(10, 5), 20);

const signatures = new Set();
for (let seed = 1; seed <= 500; seed += 1) {
  const levels = factory.createCampaign(seed);
  assert.equal(levels.length, 30);
  signatures.add(levels.map(level => JSON.stringify(level.specs)).join('|'));
  levels.forEach(level => {
    const correct = level.correctValue;
    assert.equal(new Set(level.choices.map(choice => choice.value)).size, 3, `${level.id}: choices must be unique`);
    assert.ok(level.choices.some(choice => choice.value === correct), `${level.id}: correct choice must be offered`);
    assert.ok(P.nearlyEqual(level.calculate(correct), level.target), `${level.id}: deterministic calculation must hit target`);
    level.choices.filter(choice => choice.value !== correct).forEach(choice => {
    assert.ok(!P.nearlyEqual(level.calculate(choice.value), level.target), `${level.id}: distractor must not equal target`);
    });
  });
}

assert.deepEqual(
  factory.createCampaign(207).map(level => level.specs),
  factory.createCampaign(207).map(level => level.specs),
  'a seed must reproduce the same mission numbers'
);
assert.ok(signatures.size > 450, 'campaign numbers should vary substantially between seeds');

console.log(`Validated ${P.PHYSICS_RULES.length} deterministic rules across 15,000 randomized mission variants.`);
