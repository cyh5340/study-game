/** Randomized mission inputs backed exclusively by pure functions in physics.js. */
(function (root) {
  'use strict';
  const P = root.CircuitPhysics;

  function seededRandom(seed) {
    let state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function randomSeed() {
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      const seed = new Uint32Array(1);
      root.crypto.getRandomValues(seed);
      return seed[0];
    }
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function pick(rng, values) { return values[Math.floor(rng() * values.length)]; }
  function shuffle(rng, values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function choices(rng, correct, wrong, formatter) {
    // Dedupe on significant figures, not decimals: capacitor answers are micro-scale.
    const unique = [...new Map([correct, ...wrong].map(value => [value.toPrecision(6), value])).values()].slice(0, 3);
    if (unique.length !== 3) throw new Error('Mission generator produced duplicate choices.');
    return shuffle(rng, unique.map(value => Object.freeze({ value, label: formatter(value) })));
  }
  function freeze(config, correctValue) {
    const sourceSpec = config.specs.find(([label]) => ['SUPPLY','VOLTAGE','INPUT','BRANCH VOLTAGE'].includes(label));
    const circuit = config.circuit || {
      topology:['parallel','mixed'].includes(config.type) ? config.type : 'series',
      source:sourceSpec ? sourceSpec[1] : null,
      components:config.specs
        .filter(([label]) => label !== 'FIND' && (!sourceSpec || label !== sourceSpec[0]))
        .map(([label,value]) => ({ kind:/R|RESIST|LOAD/.test(label) ? 'resistor' : 'meter', label, value }))
    };
    return Object.freeze({ ...config, circuit:Object.freeze({ ...circuit, components:Object.freeze(circuit.components.map(Object.freeze)) }), correctValue, choices: Object.freeze(config.choices) });
  }

  function ledMission(rng) {
    const supply = pick(rng, [5, 9, 12]);
    const ledDrop = pick(rng, supply === 5 ? [2, 3] : [2, 2.5, 3]);
    const targetMA = pick(rng, [10, 20, 25]);
    const target = targetMA / 1000;
    const resistor = P.ohmsResistance(supply - ledDrop, target);
    return freeze({ id:'led-resistor', title:'Light the LED', accent:'Don\'t burn it out.', type:'led', metric:'CURRENT', unit:'A', description:`Choose the series resistor that gives the beacon exactly ${targetMA} mA.`, specs:[['SUPPLY',volts(supply)],['LED DROP',volts(ledDrop)],['TARGET',`${targetMA} mA`]], circuit:{topology:'series',source:volts(supply),components:[{kind:'resistor',label:'R',value:'?'},{kind:'led',label:'LED',value:volts(ledDrop)}]}, formula:'I = (Vs − VLED) ÷ R', prompt:`Which resistor produces ${targetMA} mA through the ${volts(ledDrop)} LED?`, choices:choices(rng,resistor,[resistor/10,resistor*10],ohms), target, calculate:r=>P.ledSeriesCurrent(supply,ledDrop,r), equation:(r,a)=>`I = (${volts(supply)} − ${volts(ledDrop)}) ÷ ${ohms(r)} = ${amps(a)}`, success:'You delivered the LED’s rated current without overheating it.' }, resistor);
  }

  function currentMission(rng) {
    const resistance=pick(rng,[2,3,4,5,6,8,10]); const current=pick(rng,[1,2,3,4]); const voltage=P.ohmsVoltage(current,resistance);
    return answerMission(rng,{id:'ohms-current',title:'Start the motor',accent:'Calculate the current.',type:'motor',metric:'CURRENT',unit:'A',description:`A ${volts(voltage)} source drives a ${ohms(resistance)} motor winding. Predict the ammeter reading.`,specs:[['SUPPLY',volts(voltage)],['LOAD',ohms(resistance)],['FIND','CURRENT']],formula:'I = V ÷ R',prompt:'What current should the series ammeter read?',correct:current,wrong:[voltage*resistance,current/2],format:amps,equation:a=>`I = ${volts(voltage)} ÷ ${ohms(resistance)} = ${amps(a)}`,success:'The ammeter shows the same current everywhere in the series loop.'});
  }

  function resistanceMission(rng) {
    const resistance=pick(rng,[3,4,5,6,8,10,12]); const current=pick(rng,[1,2,3]); const voltage=P.ohmsVoltage(current,resistance);
    return answerMission(rng,{id:'ohms-resistance',title:'Repair the heater',accent:'Rearrange V = IR.',type:'heater',metric:'RESISTANCE',unit:'Ω',description:`The heater draws ${amps(current)} from ${volts(voltage)}. Determine its resistance.`,specs:[['VOLTAGE',volts(voltage)],['CURRENT',amps(current)],['FIND','RESISTANCE']],formula:'R = V ÷ I',prompt:'Which resistance matches the measured voltage and current?',correct:P.ohmsResistance(voltage,current),wrong:[resistance/2,resistance*2],format:ohms,equation:a=>`R = ${volts(voltage)} ÷ ${amps(current)} = ${ohms(a)}`,success:'You rearranged Ohm’s law and identified the load resistance.'});
  }

  function seriesTotalMission(rng) {
    const rs=[pick(rng,[4,5,6,8,10]),pick(rng,[10,12,15,18]),pick(rng,[20,22,25,30])]; const total=P.seriesResistance(rs);
    return answerMission(rng,{id:'series-total',title:'Stack the barriers',accent:'Series resistance adds.',type:'series',metric:'TOTAL RESISTANCE',unit:'Ω',description:'Reduce three series resistors to a single equivalent resistance.',specs:rs.map((r,i)=>[`R${i+1}`,ohms(r)]),circuit:{topology:'series',source:null,components:rs.map((r,i)=>({kind:'resistor',label:`R${i+1}`,value:ohms(r)}))},formula:'Rₜ = R₁ + R₂ + R₃',prompt:'What is the total resistance of the series chain?',correct:total,wrong:[rs[0]+rs[2],rs[1]*rs[2]],format:ohms,equation:a=>`Rₜ = ${rs.map(ohms).join(' + ')} = ${ohms(a)}`,success:'All three series resistances were added correctly.'});
  }

  function seriesCurrentMission(rng) {
    const current=pick(rng,[.2,.25,.5,1,2]); const resistance=pick(rng,[8,10,12,20,24,40]); const voltage=P.ohmsVoltage(current,resistance);
    return answerMission(rng,{id:'series-current',title:'Run the series loop',accent:'Current stays the same.',type:'series',metric:'CURRENT',unit:'A',description:`A ${volts(voltage)} source drives a ${ohms(resistance)} series chain.`,specs:[['SUPPLY',volts(voltage)],['Rₜ',ohms(resistance)],['FIND','CURRENT']],formula:'I = V ÷ Rₜ',prompt:'What does an ammeter read anywhere in this loop?',correct:current,wrong:[current/2,current*2],format:amps,equation:a=>`I = ${volts(voltage)} ÷ ${ohms(resistance)} = ${amps(a)}`,success:'The calculated current flows through every series component.'});
  }

  function voltageDropMission(rng) {
    const current=pick(rng,[.1,.2,.25,.5,1,2]); const resistance=pick(rng,[4,5,8,10,20,40]); const voltage=P.ohmsVoltage(current,resistance);
    return answerMission(rng,{id:'series-drop',title:'Measure the voltage drop',accent:'Voltage is shared.',type:'meter',metric:'VOLTAGE DROP',unit:'V',description:`A ${amps(current)} current flows through a ${ohms(resistance)} resistor.`,specs:[['CURRENT',amps(current)],['RESISTOR',ohms(resistance)],['FIND','VOLTAGE']],formula:'V = IR',prompt:`What voltage appears across the ${ohms(resistance)} resistor?`,correct:voltage,wrong:[voltage/2,voltage*2],format:volts,equation:a=>`V = ${amps(current)} × ${ohms(resistance)} = ${volts(a)}`,success:'The component voltage drop follows V = IR.'});
  }

  const parallelPairs=[[3,6],[4,12],[5,20],[6,12],[8,8],[10,10]];
  function parallelTotalMission(rng) {
    const [r1,r2]=pick(rng,parallelPairs); const total=P.parallelResistance([r1,r2]);
    return answerMission(rng,{id:'parallel-total',title:'Open another path',accent:'Parallel lowers resistance.',type:'parallel',metric:'EQUIV. RESISTANCE',unit:'Ω',description:`Reduce a ${ohms(r1)} and ${ohms(r2)} parallel network.`,specs:[['BRANCH 1',ohms(r1)],['BRANCH 2',ohms(r2)],['FIND','Rₜ']],circuit:{topology:'parallel',source:null,components:[{kind:'resistor',label:'R1',value:ohms(r1)},{kind:'resistor',label:'R2',value:ohms(r2)}]},formula:'Rₜ = (R₁R₂) ÷ (R₁ + R₂)',prompt:'What is the equivalent resistance?',correct:total,wrong:[(r1+r2)/2,r1+r2],format:ohms,equation:a=>`Rₜ = (${ohms(r1)} × ${ohms(r2)}) ÷ (${ohms(r1)} + ${ohms(r2)}) = ${ohms(a)}`,success:'The equivalent resistance is lower than either branch.'});
  }

  function branchCurrentMission(rng) {
    const resistance=pick(rng,[3,4,6,8,12]); const current=pick(rng,[1,2,3]); const voltage=P.ohmsVoltage(current,resistance);
    return answerMission(rng,{id:'branch-current',title:'Choose a branch',accent:'Voltage stays the same.',type:'parallel',metric:'BRANCH CURRENT',unit:'A',description:`Every branch receives ${volts(voltage)}. Find the current through the ${ohms(resistance)} branch.`,specs:[['BRANCH VOLTAGE',volts(voltage)],['BRANCH R',ohms(resistance)],['FIND','IBRANCH']],formula:'Ibranch = V ÷ Rbranch',prompt:`What current flows through the ${ohms(resistance)} branch?`,correct:current,wrong:[current/2,current*2],format:amps,equation:a=>`Ibranch = ${volts(voltage)} ÷ ${ohms(resistance)} = ${amps(a)}`,success:'Every parallel branch receives the full section voltage.'});
  }

  function totalCurrentMission(rng) {
    const i1=pick(rng,[.5,1,1.5,2,3]); const i2=pick(rng,[.5,1,2,3]); const total=i1+i2;
    return answerMission(rng,{id:'parallel-current',title:'Rejoin the streams',accent:'Branch currents add.',type:'parallel',metric:'TOTAL CURRENT',unit:'A',description:`One branch carries ${amps(i1)} and the other ${amps(i2)}.`,specs:[['BRANCH 1',amps(i1)],['BRANCH 2',amps(i2)],['FIND','Iₜ']],formula:'Iₜ = I₁ + I₂',prompt:'What does the ammeter before the junction read?',correct:total,wrong:[Math.max(i1,i2),total*2],format:amps,equation:a=>`Iₜ = ${amps(i1)} + ${amps(i2)} = ${amps(a)}`,success:'The branch currents recombine in the main wire.'});
  }

  function mixedEquivalentMission(rng) {
    const series=pick(rng,[2,3,4,5]); const [r1,r2]=pick(rng,parallelPairs); const parallel=P.parallelResistance([r1,r2]); const total=P.seriesResistance([series,parallel]);
    return answerMission(rng,{id:'mixed-equivalent',title:'Reduce the mixed maze',accent:'Parallel first, then series.',type:'mixed',metric:'TOTAL RESISTANCE',unit:'Ω',description:`A ${ohms(series)} resistor is in series with ${ohms(r1)} ‖ ${ohms(r2)}.`,specs:[['SERIES',ohms(series)],['PARALLEL',`${ohms(r1)} ‖ ${ohms(r2)}`],['FIND','Rₜ']],circuit:{topology:'mixed',source:null,components:[{kind:'resistor',label:'Rs',value:ohms(series)},{kind:'resistor',label:'R1',value:ohms(r1),branch:1},{kind:'resistor',label:'R2',value:ohms(r2),branch:2}]},formula:'Rₜ = Rs + (R₁R₂) ÷ (R₁ + R₂)',prompt:'What is the whole network’s equivalent resistance?',correct:total,wrong:[parallel,series+r1+r2],format:ohms,equation:a=>`Rₜ = ${ohms(series)} + (${ohms(r1)} ‖ ${ohms(r2)}) = ${ohms(series)} + ${ohms(parallel)} = ${ohms(a)}`,success:'You reduced the parallel section before adding the series resistor.'});
  }

  function mixedCurrentMission(rng) {
    const resistance=pick(rng,[5,6,7,8,10,12]); const current=pick(rng,[1,2,3]); const voltage=P.ohmsVoltage(current,resistance);
    return answerMission(rng,{id:'mixed-current',title:'Power the mixed network',accent:'Use the final equivalent.',type:'mixed',metric:'TOTAL CURRENT',unit:'A',description:`The reduced network is ${ohms(resistance)} across ${volts(voltage)}.`,specs:[['SUPPLY',volts(voltage)],['Rₜ',ohms(resistance)],['FIND','Iₜ']],formula:'Iₜ = V ÷ Rₜ',prompt:'What total current leaves the source?',correct:current,wrong:[current/2,current*2],format:amps,equation:a=>`Iₜ = ${volts(voltage)} ÷ ${ohms(resistance)} = ${amps(a)}`,success:'You used the final equivalent resistance to find source current.'});
  }

  function sectionVoltageMission(rng) {
    const resistance=pick(rng,[2,3,4,5,6,8]); const current=pick(rng,[1,2,3]); const voltage=P.ohmsVoltage(current,resistance);
    return answerMission(rng,{id:'mixed-section-voltage',title:'Scan the parallel section',accent:'Find its shared voltage.',type:'mixed',metric:'SECTION VOLTAGE',unit:'V',description:`A ${ohms(resistance)} equivalent parallel section carries ${amps(current)}.`,specs:[['SECTION R',ohms(resistance)],['CURRENT',amps(current)],['FIND','VSECTION']],formula:'Vsection = I × Rsection',prompt:'What voltage is shared by both parallel branches?',correct:voltage,wrong:[voltage/2,voltage*2],format:volts,equation:a=>`Vsection = ${amps(current)} × ${ohms(resistance)} = ${volts(a)}`,success:'Both parallel branches share the calculated section voltage.'});
  }

  function powerVIMission(rng) {
    const voltage=pick(rng,[5,6,9,12,18,24]); const current=pick(rng,[1,2,3,4]); const power=P.powerFromVoltageCurrent(voltage,current);
    return answerMission(rng,{id:'power-vi',title:'Charge the power core',accent:'Power is voltage × current.',type:'power',metric:'POWER',unit:'W',description:`A device operates at ${volts(voltage)} and draws ${amps(current)}.`,specs:[['VOLTAGE',volts(voltage)],['CURRENT',amps(current)],['FIND','POWER']],formula:'P = VI',prompt:'How much electrical power does the device receive?',correct:power,wrong:[power/2,power*2],format:watts,equation:a=>`P = ${volts(voltage)} × ${amps(current)} = ${watts(a)}`,success:'Electrical power is voltage multiplied by current.'});
  }

  function powerHeatMission(rng) {
    const current=pick(rng,[1,2,3,4]); const resistance=pick(rng,[2,3,4,5,6,8]); const power=P.powerFromCurrent(current,resistance);
    return answerMission(rng,{id:'power-i2r',title:'Survive the heat zone',accent:'Current is squared.',type:'power',metric:'RESISTOR POWER',unit:'W',description:`A ${amps(current)} current flows through a ${ohms(resistance)} resistor.`,specs:[['CURRENT',amps(current)],['RESISTOR',ohms(resistance)],['FIND','POWER']],formula:'P = I²R',prompt:'How much power is converted to heat?',correct:power,wrong:[power/2,power*2],format:watts,equation:a=>`P = (${amps(current)})² × ${ohms(resistance)} = ${watts(a)}`,success:'Squaring the current gives the resistor’s heating power.'});
  }

  function fuseMission(rng) {
    const limit=pick(rng,[1,2,3,4,5]); const resistance=pick(rng,[4,5,6,8,10,12]); const voltage=P.ohmsVoltage(limit,resistance);
    return answerMission(rng,{id:'fuse-limit',title:'Defeat the overload',accent:'Protect the circuit.',type:'boss',metric:'MINIMUM RESISTANCE',unit:'Ω',description:`A ${volts(voltage)} load must stay at or below ${amps(limit)}.`,specs:[['SUPPLY',volts(voltage)],['CURRENT LIMIT',amps(limit)],['FIND','MIN R']],formula:'Rmin = V ÷ Imax',prompt:`Which minimum resistance keeps current at the ${amps(limit)} limit?`,correct:resistance,wrong:[resistance/2,resistance*2],format:ohms,equation:a=>`Rmin = ${volts(voltage)} ÷ ${amps(limit)} = ${ohms(a)}`,success:'The minimum resistance keeps the protected circuit at its current limit.'});
  }

  function answerMission(rng, config) {
    const { correct, wrong, format, equation, ...rest } = config;
    return freeze({ ...rest, target:correct, calculate:value=>value, choices:choices(rng,correct,wrong,format), equation:(_,answer)=>equation(answer) }, correct);
  }

  const microfarads=[10,22,47,100,220,470];
  function capacitorChargeMission(rng) {
    const capacitance=pick(rng,microfarads)*1e-6; const voltage=pick(rng,[5,6,9,12]); const charge=P.capacitorCharge(capacitance,voltage);
    return answerMission(rng,{id:'capacitor-charge',title:'Fill the capacitor',accent:'Charge is C × V.',type:'capacitor',metric:'CHARGE',unit:'C',description:`A ${farads(capacitance)} capacitor is charged to ${volts(voltage)}.`,specs:[['SUPPLY',volts(voltage)],['CAPACITOR',farads(capacitance)],['FIND','CHARGE']],circuit:{topology:'series',source:volts(voltage),components:[{kind:'capacitor',label:'C',value:farads(capacitance)}]},formula:'Q = CV',prompt:'How much charge is stored on the plates?',correct:charge,wrong:[capacitance/voltage,charge/2],format:coulombs,equation:a=>`Q = ${farads(capacitance)} × ${volts(voltage)} = ${coulombs(a)}`,success:'Stored charge grows with both capacitance and voltage.'});
  }

  function capacitorEnergyMission(rng) {
    const capacitance=pick(rng,microfarads)*1e-6; const voltage=pick(rng,[5,6,9,12]); const energy=P.capacitorEnergy(capacitance,voltage);
    return answerMission(rng,{id:'capacitor-energy',title:'Store the pulse',accent:'Energy is ½CV².',type:'capacitor',metric:'STORED ENERGY',unit:'J',description:`A ${farads(capacitance)} capacitor is charged to ${volts(voltage)}.`,specs:[['SUPPLY',volts(voltage)],['CAPACITOR',farads(capacitance)],['FIND','ENERGY']],circuit:{topology:'series',source:volts(voltage),components:[{kind:'capacitor',label:'C',value:farads(capacitance)}]},formula:'E = ½CV²',prompt:'How much energy does the charged capacitor store?',correct:energy,wrong:[energy*2,energy/voltage],format:joules,equation:a=>`E = ½ × ${farads(capacitance)} × (${volts(voltage)})² = ${joules(a)}`,success:'Doubling the voltage would store four times the energy.'});
  }

  function seriesCapacitanceMission(rng) {
    const [c1,c2]=pick(rng,parallelPairs).map(c=>c*10e-6); const total=P.seriesCapacitance([c1,c2]);
    return answerMission(rng,{id:'series-capacitance',title:'Stack the plates',accent:'Series capacitance shrinks.',type:'capacitor',metric:'EQUIV. CAPACITANCE',unit:'F',description:`Combine ${farads(c1)} and ${farads(c2)} capacitors in series.`,specs:[['C1',farads(c1)],['C2',farads(c2)],['FIND','Cₜ']],circuit:{topology:'series',source:null,components:[{kind:'capacitor',label:'C1',value:farads(c1)},{kind:'capacitor',label:'C2',value:farads(c2)}]},formula:'Cₜ = (C₁C₂) ÷ (C₁ + C₂)',prompt:'What is the equivalent capacitance of the series pair?',correct:total,wrong:[c1+c2,(c1+c2)/2],format:farads,equation:a=>`Cₜ = (${farads(c1)} × ${farads(c2)}) ÷ (${farads(c1)} + ${farads(c2)}) = ${farads(a)}`,success:'In series, capacitors combine like resistors in parallel.'});
  }

  function parallelCapacitanceMission(rng) {
    const [c1,c2]=pick(rng,[[10,22],[22,47],[47,100],[100,220],[33,68]]).map(c=>c*1e-6); const total=P.parallelCapacitance([c1,c2]);
    return answerMission(rng,{id:'parallel-capacitance',title:'Widen the plates',accent:'Parallel capacitance adds.',type:'capacitor',metric:'EQUIV. CAPACITANCE',unit:'F',description:`Combine ${farads(c1)} and ${farads(c2)} capacitors in parallel.`,specs:[['C1',farads(c1)],['C2',farads(c2)],['FIND','Cₜ']],circuit:{topology:'parallel',source:null,components:[{kind:'capacitor',label:'C1',value:farads(c1)},{kind:'capacitor',label:'C2',value:farads(c2)}]},formula:'Cₜ = C₁ + C₂',prompt:'What is the equivalent capacitance of the parallel pair?',correct:total,wrong:[P.seriesCapacitance([c1,c2]),Math.max(c1,c2)],format:farads,equation:a=>`Cₜ = ${farads(c1)} + ${farads(c2)} = ${farads(a)}`,success:'In parallel, capacitors combine like resistors in series.'});
  }

  function timeConstantMission(rng) {
    const resistance=pick(rng,[1000,2200,4700,10000]); const capacitance=pick(rng,[10,22,47,100])*1e-6; const tau=P.rcTimeConstant(resistance,capacitance);
    return answerMission(rng,{id:'rc-time-constant',title:'Time the charge-up',accent:'τ = RC.',type:'capacitor',metric:'TIME CONSTANT',unit:'s',description:`A ${ohms(resistance)} resistor charges a ${farads(capacitance)} capacitor.`,specs:[['RESISTOR',ohms(resistance)],['CAPACITOR',farads(capacitance)],['FIND','τ']],circuit:{topology:'series',source:null,components:[{kind:'resistor',label:'R',value:ohms(resistance)},{kind:'capacitor',label:'C',value:farads(capacitance)}]},formula:'τ = RC',prompt:'What is the RC time constant (time to reach about 63% charge)?',correct:tau,wrong:[tau*5,tau/2],format:seconds,equation:a=>`τ = ${ohms(resistance)} × ${farads(capacitance)} = ${seconds(a)}`,success:'After one time constant the capacitor is about 63% charged; after 5τ it is effectively full.'});
  }

  function chargingVoltageMission(rng) {
    const supply=pick(rng,[5,9,10,12]); const resistance=pick(rng,[1000,2200,4700,10000]); const capacitance=pick(rng,[10,22,47,100])*1e-6;
    const tau=P.rcTimeConstant(resistance,capacitance); const n=pick(rng,[1,2,3]); const time=n*tau; const voltage=P.capacitorChargingVoltage(supply,resistance,capacitance,time);
    return answerMission(rng,{id:'charging-voltage',title:'Watch it charge',accent:'Exponential, not linear.',type:'capacitor',metric:'CAPACITOR VOLTAGE',unit:'V',description:`A ${volts(supply)} supply charges an empty ${farads(capacitance)} capacitor through ${ohms(resistance)}.`,specs:[['RC',`${ohms(resistance)} · ${farads(capacitance)}`],['TIME',seconds(time)],['FIND','VC']],circuit:{topology:'series',source:volts(supply),components:[{kind:'resistor',label:'R',value:ohms(resistance)},{kind:'capacitor',label:'C',value:farads(capacitance)}]},formula:'V = V₀(1 − e^(−t/RC))',prompt:`What is the capacitor voltage after ${seconds(time)}?`,correct:voltage,wrong:[supply*Math.exp(-n),supply],format:volts,equation:a=>`τ = ${seconds(tau)}, so V = ${volts(supply)} × (1 − e^(−${n})) = ${volts(a)}`,success:`After ${n}τ the capacitor is ${Math.round((1-Math.exp(-n))*100)}% charged; it never quite reaches the supply voltage.`});
  }

  function dischargingVoltageMission(rng) {
    const initial=pick(rng,[5,9,10,12]); const resistance=pick(rng,[1000,2200,4700,10000]); const capacitance=pick(rng,[10,22,47,100])*1e-6;
    const tau=P.rcTimeConstant(resistance,capacitance); const n=pick(rng,[1,2,3]); const time=n*tau; const voltage=P.capacitorDischargingVoltage(initial,resistance,capacitance,time);
    return answerMission(rng,{id:'discharging-voltage',title:'Drain the capacitor',accent:'It decays, not drops.',type:'capacitor',metric:'CAPACITOR VOLTAGE',unit:'V',description:`A ${farads(capacitance)} capacitor charged to ${volts(initial)} discharges through ${ohms(resistance)}.`,specs:[['RC',`${ohms(resistance)} · ${farads(capacitance)}`],['TIME',seconds(time)],['FIND','VC']],circuit:{topology:'series',source:null,components:[{kind:'capacitor',label:'C',value:volts(initial)},{kind:'resistor',label:'R',value:ohms(resistance)}]},formula:'V = V₀e^(−t/RC)',prompt:`What voltage is left on the capacitor after ${seconds(time)}?`,correct:voltage,wrong:[initial*(1-Math.exp(-n)),initial*(1-n/5)],format:volts,equation:a=>`τ = ${seconds(tau)}, so V = ${volts(initial)} × e^(−${n}) = ${volts(a)}`,success:`After ${n}τ only ${Math.round(Math.exp(-n)*100)}% of the starting voltage remains; each τ removes 63% of what is left.`});
  }

  const sections = Object.freeze([
    ['Ohm’s law',[ledMission,currentMission,resistanceMission]],
    ['Series circuits',[seriesTotalMission,seriesCurrentMission,voltageDropMission]],
    ['Parallel circuits',[parallelTotalMission,branchCurrentMission,totalCurrentMission]],
    ['Mixed circuits',[mixedEquivalentMission,mixedCurrentMission,sectionVoltageMission]],
    ['Power',[powerVIMission,powerHeatMission,fuseMission]],
    ['Capacitors',[capacitorChargeMission,capacitorEnergyMission,seriesCapacitanceMission,parallelCapacitanceMission,timeConstantMission,chargingVoltageMission,dischargingVoltageMission]]
  ]);
  const generators = Object.freeze(sections.flatMap(([, sectionGenerators]) => sectionGenerators));
  function createCampaign(seed = randomSeed()) {
    const rng = seededRandom(seed);
    // Each section plays its concepts twice with fresh numbers before the next section.
    // The equations stay fixed; only valid operands and answer choices vary.
    return Object.freeze(sections.flatMap(([section, sectionGenerators]) => [0, 1].flatMap(pass => sectionGenerators.map(generator => {
      const mission = generator(rng);
      return Object.freeze({ ...mission, id: `${mission.id}-${pass + 1}`, section });
    }))));
  }

  function createEndlessMission(rng) {
    const generator = pick(rng, generators);
    return generator(rng);
  }

  function number(v){ return Number(v.toFixed(3)); }
  function ohms(v){ return v>=1000?`${number(v/1000)} kΩ`:`${number(v)} Ω`; }
  function amps(v){ return v<1?`${number(v*1000)} mA`:`${number(v)} A`; }
  function volts(v){ return `${number(v)} V`; }
  function watts(v){ return `${number(v)} W`; }
  function farads(v){ return `${number(v*1e6)} µF`; }
  function coulombs(v){ return v<1e-3?`${number(v*1e6)} µC`:`${number(v*1e3)} mC`; }
  function joules(v){ return v<1?`${number(v*1e3)} mJ`:`${number(v)} J`; }
  function seconds(v){ return v<1?`${number(v*1e3)} ms`:`${number(v)} s`; }

  root.CircuitLevelFactory = Object.freeze({ createCampaign, createEndlessMission, seededRandom, missionCount:generators.length * 2 });
})(typeof window !== 'undefined' ? window : globalThis);
