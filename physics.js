/**
 * Deterministic DC-circuit functions.
 *
 * Every function is pure: the same numeric inputs always produce the same
 * numeric output. No random values, network calls, AI, or mutable state belong
 * in this file. Values use SI base units: volts, amperes, ohms, watts, farads,
 * coulombs, joules, and seconds.
 */
(function (root) {
  'use strict';

  function requireFinitePositive(name, value) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a finite number greater than zero.`);
    }
    return value;
  }

  function ohmsCurrent(voltage, resistance) {
    return requireFinitePositive('voltage', voltage) / requireFinitePositive('resistance', resistance);
  }

  function ohmsVoltage(current, resistance) {
    return requireFinitePositive('current', current) * requireFinitePositive('resistance', resistance);
  }

  function ohmsResistance(voltage, current) {
    return requireFinitePositive('voltage', voltage) / requireFinitePositive('current', current);
  }

  function seriesResistance(resistances) {
    if (!Array.isArray(resistances) || resistances.length === 0) throw new RangeError('resistances must be a non-empty array.');
    return resistances.reduce((total, resistance) => total + requireFinitePositive('resistance', resistance), 0);
  }

  function parallelResistance(resistances) {
    if (!Array.isArray(resistances) || resistances.length < 2) throw new RangeError('parallel resistance needs at least two branches.');
    const conductance = resistances.reduce((total, resistance) => total + 1 / requireFinitePositive('resistance', resistance), 0);
    return 1 / conductance;
  }

  function voltageDividerOutput(inputVoltage, topResistance, bottomResistance) {
    const vin = requireFinitePositive('inputVoltage', inputVoltage);
    const r1 = requireFinitePositive('topResistance', topResistance);
    const r2 = requireFinitePositive('bottomResistance', bottomResistance);
    return vin * r2 / (r1 + r2);
  }

  function ledSeriesCurrent(supplyVoltage, ledDrop, resistance) {
    const supply = requireFinitePositive('supplyVoltage', supplyVoltage);
    const drop = requireFinitePositive('ledDrop', ledDrop);
    if (drop >= supply) return 0;
    return (supply - drop) / requireFinitePositive('resistance', resistance);
  }

  function powerFromCurrent(current, resistance) {
    const amps = requireFinitePositive('current', current);
    return amps * amps * requireFinitePositive('resistance', resistance);
  }

  function powerFromVoltageCurrent(voltage, current) {
    return requireFinitePositive('voltage', voltage) * requireFinitePositive('current', current);
  }

  function powerFromVoltage(voltage, resistance) {
    const volts = requireFinitePositive('voltage', voltage);
    return volts * volts / requireFinitePositive('resistance', resistance);
  }

  function capacitorCharge(capacitance, voltage) {
    return requireFinitePositive('capacitance', capacitance) * requireFinitePositive('voltage', voltage);
  }

  function capacitorEnergy(capacitance, voltage) {
    const volts = requireFinitePositive('voltage', voltage);
    return 0.5 * requireFinitePositive('capacitance', capacitance) * volts * volts;
  }

  // Capacitors combine the opposite way to resistors.
  function seriesCapacitance(capacitances) {
    if (!Array.isArray(capacitances) || capacitances.length < 2) throw new RangeError('series capacitance needs at least two capacitors.');
    return 1 / capacitances.reduce((total, capacitance) => total + 1 / requireFinitePositive('capacitance', capacitance), 0);
  }

  function parallelCapacitance(capacitances) {
    if (!Array.isArray(capacitances) || capacitances.length === 0) throw new RangeError('capacitances must be a non-empty array.');
    return capacitances.reduce((total, capacitance) => total + requireFinitePositive('capacitance', capacitance), 0);
  }

  function rcTimeConstant(resistance, capacitance) {
    return requireFinitePositive('resistance', resistance) * requireFinitePositive('capacitance', capacitance);
  }

  // Voltage on an initially empty capacitor t seconds after connecting it through R.
  function capacitorChargingVoltage(supplyVoltage, resistance, capacitance, time) {
    const tau = rcTimeConstant(resistance, capacitance);
    if (!Number.isFinite(time) || time < 0) throw new RangeError('time must be a finite number of zero or more.');
    return requireFinitePositive('supplyVoltage', supplyVoltage) * (1 - Math.exp(-time / tau));
  }

  // Voltage left on a capacitor charged to V₀, t seconds after it starts discharging through R.
  function capacitorDischargingVoltage(initialVoltage, resistance, capacitance, time) {
    const tau = rcTimeConstant(resistance, capacitance);
    if (!Number.isFinite(time) || time < 0) throw new RangeError('time must be a finite number of zero or more.');
    return requireFinitePositive('initialVoltage', initialVoltage) * Math.exp(-time / tau);
  }

  function nearlyEqual(actual, expected, tolerance) {
    const limit = tolerance === undefined ? 1e-9 : Math.abs(tolerance);
    return Math.abs(actual - expected) <= limit;
  }

  const PHYSICS_RULES = Object.freeze([
    Object.freeze({ id: 'ohms-current', equation: 'I = V ÷ R', calculate: ohmsCurrent }),
    Object.freeze({ id: 'ohms-voltage', equation: 'V = I × R', calculate: ohmsVoltage }),
    Object.freeze({ id: 'ohms-resistance', equation: 'R = V ÷ I', calculate: ohmsResistance }),
    Object.freeze({ id: 'series-resistance', equation: 'Rₜ = R₁ + R₂ + …', calculate: seriesResistance }),
    Object.freeze({ id: 'parallel-resistance', equation: '1/Rₜ = 1/R₁ + 1/R₂ + …', calculate: parallelResistance }),
    Object.freeze({ id: 'voltage-divider', equation: 'Vout = Vin × R₂ ÷ (R₁ + R₂)', calculate: voltageDividerOutput }),
    Object.freeze({ id: 'led-series-current', equation: 'I = (Vs − VLED) ÷ R', calculate: ledSeriesCurrent }),
    Object.freeze({ id: 'resistor-power-current', equation: 'P = I²R', calculate: powerFromCurrent }),
    Object.freeze({ id: 'power-voltage-current', equation: 'P = VI', calculate: powerFromVoltageCurrent }),
    Object.freeze({ id: 'resistor-power-voltage', equation: 'P = V² ÷ R', calculate: powerFromVoltage }),
    Object.freeze({ id: 'capacitor-charge', equation: 'Q = CV', calculate: capacitorCharge }),
    Object.freeze({ id: 'capacitor-energy', equation: 'E = ½CV²', calculate: capacitorEnergy }),
    Object.freeze({ id: 'series-capacitance', equation: '1/Cₜ = 1/C₁ + 1/C₂ + …', calculate: seriesCapacitance }),
    Object.freeze({ id: 'parallel-capacitance', equation: 'Cₜ = C₁ + C₂ + …', calculate: parallelCapacitance }),
    Object.freeze({ id: 'rc-time-constant', equation: 'τ = RC', calculate: rcTimeConstant }),
    Object.freeze({ id: 'capacitor-charging-voltage', equation: 'V = V₀(1 − e^(−t/RC))', calculate: capacitorChargingVoltage }),
    Object.freeze({ id: 'capacitor-discharging-voltage', equation: 'V = V₀e^(−t/RC)', calculate: capacitorDischargingVoltage })
  ]);

  root.CircuitPhysics = Object.freeze({
    PHYSICS_RULES,
    ohmsCurrent,
    ohmsVoltage,
    ohmsResistance,
    seriesResistance,
    parallelResistance,
    voltageDividerOutput,
    ledSeriesCurrent,
    powerFromCurrent,
    powerFromVoltageCurrent,
    powerFromVoltage,
    capacitorCharge,
    capacitorEnergy,
    seriesCapacitance,
    parallelCapacitance,
    rcTimeConstant,
    capacitorChargingVoltage,
    capacitorDischargingVoltage,
    nearlyEqual
  });
})(typeof window !== 'undefined' ? window : globalThis);
