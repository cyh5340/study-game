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
assert.ok(P.nearlyEqual(P.capacitorCharge(100e-6, 12), 1.2e-3));
assert.ok(P.nearlyEqual(P.capacitorEnergy(100e-6, 10), 5e-3));
assert.ok(P.nearlyEqual(P.seriesCapacitance([30e-6, 60e-6]), 20e-6));
assert.ok(P.nearlyEqual(P.parallelCapacitance([22e-6, 47e-6]), 69e-6));
assert.ok(P.nearlyEqual(P.rcTimeConstant(1000, 100e-6), 0.1));
assert.ok(P.nearlyEqual(P.capacitorChargingVoltage(10, 1000, 100e-6, 0.1), 10 * (1 - Math.exp(-1))));
assert.equal(P.capacitorChargingVoltage(10, 1000, 100e-6, 0), 0);
assert.ok(P.nearlyEqual(P.capacitorDischargingVoltage(10, 1000, 100e-6, 0.1), 10 * Math.exp(-1)));
assert.equal(P.capacitorDischargingVoltage(10, 1000, 100e-6, 0), 10);

const signatures = new Set();
for (let seed = 1; seed <= 500; seed += 1) {
  const levels = factory.createCampaign(seed);
  assert.equal(levels.length, factory.missionCount);
  const sectionOrder = levels.map(level => level.section).filter((section, i, all) => section !== all[i - 1]);
  assert.equal(new Set(sectionOrder).size, sectionOrder.length, 'each section must be one contiguous block');
  signatures.add(levels.map(level => JSON.stringify(level.specs)).join('|'));
  levels.forEach(level => {
    assert.ok(level.circuit, `${level.id}: mission must describe its circuit`);
    assert.ok(['series','parallel','mixed'].includes(level.circuit.topology), `${level.id}: circuit topology must be renderable`);
    assert.ok(level.circuit.components.length > 0, `${level.id}: circuit must include its question components`);
    const correct = level.correctValue;
    assert.equal(new Set(level.choices.map(choice => choice.value)).size, 3, `${level.id}: choices must be unique`);
    assert.equal(new Set(level.choices.map(choice => choice.label)).size, 3, `${level.id}: choice labels must be distinguishable`);
    assert.ok(level.choices.some(choice => choice.value === correct), `${level.id}: correct choice must be offered`);
    assert.ok(P.nearlyEqual(level.calculate(correct), level.target), `${level.id}: deterministic calculation must hit target`);
    level.choices.filter(choice => choice.value !== correct).forEach(choice => {
    assert.ok(!P.nearlyEqual(level.calculate(choice.value), level.target), `${level.id}: distractor must not equal target`);
    });
  });
  const seriesTotal = levels.find(level => level.id.startsWith('series-total'));
  assert.equal(seriesTotal.circuit.components.length, 3, 'three-resistor question must render three resistors');
  const parallelTotal = levels.find(level => level.id.startsWith('parallel-total'));
  assert.equal(parallelTotal.circuit.topology, 'parallel', 'parallel question must render parallel branches');
  assert.equal(parallelTotal.circuit.components.length, 2, 'two-branch question must render both resistors');
  const parallelCaps = levels.find(level => level.id.startsWith('parallel-capacitance'));
  assert.equal(parallelCaps.circuit.topology, 'parallel', 'parallel capacitor question must render parallel branches');
  assert.ok(parallelCaps.circuit.components.every(component => component.kind === 'capacitor'), 'capacitor question must render capacitors');
}

assert.deepEqual(
  factory.createCampaign(207).map(level => level.specs),
  factory.createCampaign(207).map(level => level.specs),
  'a seed must reproduce the same mission numbers'
);
assert.ok(signatures.size > 450, 'campaign numbers should vary substantially between seeds');

console.log(`Validated ${P.PHYSICS_RULES.length} deterministic rules across ${(500 * factory.missionCount).toLocaleString("en-US")} randomized mission variants.`);
