const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.querySelector('#startButton');
const retryButton = document.querySelector('#retryButton');
const startOverlay = document.querySelector('#startOverlay');
const resultOverlay = document.querySelector('#resultOverlay');
const hintButton = document.querySelector('#hintButton');
const hintText = document.querySelector('#hintText');
const liveEquation = document.querySelector('#liveEquation');
const choices = document.querySelector('#resistorChoices');
const feedback = document.querySelector('#selectionFeedback');
const lapReadout = document.querySelector('#lapReadout');
const currentReadout = document.querySelector('#currentReadout');
const voltageReadout = document.querySelector('#voltageReadout');
const bossMeter = document.querySelector('#bossMeter');
const pathLabel = document.querySelector('#pathLabel');
const campaignModeButton = document.querySelector('#campaignMode');
const endlessModeButton = document.querySelector('#endlessMode');
const skipAnimation = document.querySelector('#skipAnimation');
const soundButton = document.querySelector('#soundButton');
const appEntry = document.querySelector('#appEntry');
const entryProgress = document.querySelector('#entryProgress');
const entrySections = document.querySelector('#entrySections');
const entrySkipAnimation = document.querySelector('#entrySkipAnimation');
const entrySound = document.querySelector('#entrySound');
const homeButton = document.querySelector('#homeButton');
let levels = window.CircuitLevelFactory.createCampaign();
const physics = window.CircuitPhysics;
let gameMode = 'campaign';
const endlessRng = window.CircuitLevelFactory.seededRandom((Date.now() ^ 0x207) >>> 0);
let endlessMission = window.CircuitLevelFactory.createEndlessMission(endlessRng);

const W = canvas.width;
const H = canvas.height;
const track = { left: 140, right: 860, top: 105, bottom: 555, radius: 76 };
const perimeter = 2 * ((track.right - track.left) + (track.bottom - track.top));
const laneOffsets = [-20, 0, 20];
// LED sits second in the sourced series row (drawSeriesComponents(…, 330, 820) → x = 697.5).
const LED_PROGRESS = (697.5 - track.left) / perimeter;

const installedMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
let campaignProgress = readStored('circuitRunner.progress', { nextLevel:0, completed:0 });
let soundEnabled = readStored('circuitRunner.sound', true);
let levelIndex = Math.max(0, Math.min(levels.length - 1, campaignProgress.nextLevel || 0));
let selectedR = null;
let completedLevel = false;
let animationId = null;
let lastTime = 0;
let state = makeState();

skipAnimation.checked = readStored('circuitRunner.skipAnimation', false) === true;
entrySkipAnimation.checked = skipAnimation.checked;
entrySound.checked = soundEnabled;
updateSoundLabel();
skipAnimation.addEventListener('change', () => {
  entrySkipAnimation.checked = skipAnimation.checked;
  writeStored('circuitRunner.skipAnimation', skipAnimation.checked);
});
entrySkipAnimation.addEventListener('change', () => { skipAnimation.checked = entrySkipAnimation.checked; writeStored('circuitRunner.skipAnimation', skipAnimation.checked); });
entrySound.addEventListener('change', () => setSound(entrySound.checked));
soundButton.addEventListener('click', () => setSound(!soundEnabled));

function readStored(key, fallback) {
  try { const value=localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch (_) { return fallback; }
}
function writeStored(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
function setSound(enabled) { soundEnabled=enabled; entrySound.checked=enabled; writeStored('circuitRunner.sound', enabled); updateSoundLabel(); }
function updateSoundLabel() { soundButton.textContent=`SOUND: ${soundEnabled ? 'ON' : 'OFF'}`; }
// Mobile browsers keep audio suspended until it is created/resumed inside a user gesture,
// so one shared context is unlocked on the first tap/key and reused for every tone.
let audio = null;
function unlockAudio() {
  const AudioContext=window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audio ||= new AudioContext();
  if (audio.state === 'suspended') audio.resume();
}
// Touch pointerdown isn't a user-activation event; pointerup/touchend/click are, so listen to all of them.
['pointerdown','pointerup','touchend','click','keydown'].forEach(type => document.addEventListener(type, unlockAudio, { capture:true }));
function playTone(frequency, duration=.16) {
  if (!soundEnabled || !audio) return;
  const oscillator=audio.createOscillator(), gain=audio.createGain();
  oscillator.frequency.value=frequency; gain.gain.setValueAtTime(.15,audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);
}

function campaignSections() {
  return levels.reduce((sections, level, index) => {
    const last = sections.at(-1);
    if (last && last.name === level.section) last.end = index;
    else sections.push({ name: level.section, start: index, end: index });
    return sections;
  }, []);
}
function refreshEntry() {
  const next=(campaignProgress.nextLevel || 0)+1;
  entryProgress.textContent=campaignProgress.completed ? `${campaignProgress.completed} missions completed · Continue at mission ${next} of ${levels.length}.` : `Start mission 1 of ${levels.length}. Your progress and settings save on this device.`;
  entrySections.replaceChildren(...campaignSections().map(({ name, start, end }) => {
    const button = document.createElement('button');
    const done = (campaignProgress.completed || 0) > end;
    button.type = 'button'; button.className = `section-button${done ? ' done' : ''}`;
    button.innerHTML = `<strong></strong><small>${done ? '✓ ' : ''}${start + 1}–${end + 1}</small>`;
    button.querySelector('strong').textContent = name;
    button.addEventListener('click', () => { campaignProgress = { ...campaignProgress, nextLevel: start }; writeStored('circuitRunner.progress', campaignProgress); launchFromEntry('campaign'); });
    return button;
  }));
}
function openEntry() {
  cancelAnimationFrame(animationId);state.mode='idle';refreshEntry();appEntry.hidden=false;homeButton.hidden=true;
}
function launchFromEntry(mode, resetCampaign=false) {
  if (resetCampaign) { campaignProgress={nextLevel:0,completed:0};writeStored('circuitRunner.progress',campaignProgress);levels=window.CircuitLevelFactory.createCampaign(); }
  levelIndex=Math.max(0,Math.min(levels.length-1,campaignProgress.nextLevel || 0));
  appEntry.hidden=true;homeButton.hidden=false;setGameMode(mode);
}
document.querySelector('#continueCampaign').addEventListener('click',()=>launchFromEntry('campaign'));
document.querySelector('#newCampaign').addEventListener('click',()=>launchFromEntry('campaign',true));
document.querySelector('#entryEndless').addEventListener('click',()=>launchFromEntry('endless'));
homeButton.addEventListener('click',openEntry);
// ponytail: browsers only allow orientation lock while fullscreen (Android/Chrome); iOS Safari has no lock API, so it keeps the rotate prompt.
const rotatePrompt=document.querySelector('.rotate-device');
if (document.fullscreenEnabled && screen.orientation?.lock) {
  rotatePrompt.querySelector('strong').textContent='Tap to play in landscape';
  rotatePrompt.querySelector('span').textContent='Or rotate your device 90°.';
  rotatePrompt.addEventListener('click',()=>{
    document.documentElement.requestFullscreen().then(()=>screen.orientation.lock('landscape')).catch(()=>{});
  });
}

function getLevel() { return gameMode === 'endless' ? endlessMission : levels[levelIndex]; }

function makeState() {
  return {
    mode: 'idle',
    progress: 0,
    bossProgress: -0.19,
    lane: 1,
    targetLane: 1,
    pickups: 0,
    current: 0,
    voltage: 0,
    obstaclePhase: 0,
    flash: 0,
    failAnim: 0,
    failType: null
    ,score: 0,
    gates: 0,
    nextGate: .82,
    pickupLane: 0,
    gateResolved: false
  };
}

function electricalResult(r) {
  const level = getLevel();
  const actual = level.calculate(r);
  return { actual, safe: physics.nearlyEqual(actual, level.target, 1e-8), ratio: actual / level.target };
}

function renderLevel() {
  const level = getLevel();
  selectedR = null;
  completedLevel = false;
  document.querySelector('#missionNumber').textContent = gameMode === 'endless' ? 'ENDLESS GRID' : `MISSION ${String(levelIndex + 1).padStart(2,'0')} / ${String(levels.length).padStart(2,'0')} · ${level.section.toUpperCase()}`;
  document.querySelector('#missionName').textContent = level.title;
  document.querySelector('#missionTitle').innerHTML = gameMode === 'endless' ? `Endless Circuit.<br><em>Outrun the fault.</em>` : `${level.title}.<br><em>${level.accent}</em>`;
  document.querySelector('#missionDescription').textContent = gameMode === 'endless' ? 'Choose the lane carrying the correct answer at every gate. Collect charge, and survive as the circuit accelerates.' : level.description;
  level.specs.forEach(([label,value], index) => {
    document.querySelector(`#specLabel${index}`).textContent = label;
    document.querySelector(`#specValue${index}`).textContent = value;
  });
  document.querySelector('#equationFormula').textContent = level.formula;
  document.querySelector('#resultMetricLabel').textContent = level.metric;
  document.querySelector('#circuitPrompt').textContent = gameMode === 'endless' ? 'Three answer lanes. Switch rails before the gate.' : level.prompt;
  hintText.textContent = level.prompt;
  hintText.hidden = true;
  hintButton.textContent = 'Show concept hint';
  liveEquation.textContent = 'Choose a value to calculate the result.';
  delete liveEquation.dataset.status;
  choices.querySelectorAll('label').forEach((label, index) => {
    const choice = level.choices[index];
    const input = label.querySelector('input');
    input.value = choice.value;
    input.checked = false;
    input.disabled = gameMode === 'endless';
    label.querySelector('b').textContent = choice.label;
    label.querySelector('small').textContent = gameMode === 'endless' ? `LANE ${index + 1}` : `Option ${String.fromCharCode(65 + index)}`;
  });
  feedback.textContent = gameMode === 'endless' ? 'Correct answers extend your lead. Wrong gates let the fault gain.' : 'Select a component value to arm the circuit.';
  document.querySelector('#choiceLegend').textContent = gameMode === 'endless' ? 'Answer lanes — steer to one' : 'Install the missing value';
  startButton.firstChild.textContent = gameMode === 'endless' ? 'Start endless run ' : 'Close circuit & run ';
  startButton.disabled = gameMode !== 'endless';
  pathLabel.textContent = gameMode === 'endless' ? 'DISTANCE / SCORE' : 'CIRCUIT PATH';
  currentReadout.textContent = '—';
  resetGame();
}

choices.addEventListener('change', (event) => {
  if (!event.target.matches('input[name="resistor"]')) return;
  selectedR = Number(event.target.value);
  const result = electricalResult(selectedR);
  const level = getLevel();
  startButton.disabled = false;
  currentReadout.textContent = formatResult(result.actual, level);
  liveEquation.innerHTML = `${level.equation(selectedR, result.actual).replace(/= ([^=]+)$/, '= <strong>$1</strong>')}`;
  if (result.safe) {
    feedback.textContent = 'Prediction: target current acquired. Ready to energize.';
    liveEquation.dataset.status = 'safe';
  } else {
    feedback.textContent = result.ratio > 1 ? 'Prediction: result is above the target.' : 'Prediction: result is below the target.';
    liveEquation.dataset.status = 'danger';
  }
  draw();
});

hintButton.addEventListener('click', () => {
  hintText.hidden = !hintText.hidden;
  hintButton.textContent = hintText.hidden ? 'Show concept hint' : 'Hide concept hint';
});

startButton.addEventListener('click', startGame);
retryButton.addEventListener('click', () => {
  if (gameMode === 'endless') { renderLevel(); return; }
  if (completedLevel) {
    const nextIndex = (levelIndex + 1) % levels.length;
    if (nextIndex === 0) levels = window.CircuitLevelFactory.createCampaign();
    levelIndex = nextIndex;
    renderLevel();
  } else resetGame();
});

campaignModeButton.addEventListener('click', () => setGameMode('campaign'));
endlessModeButton.addEventListener('click', () => setGameMode('endless'));

function setGameMode(mode) {
  cancelAnimationFrame(animationId);
  gameMode = mode;
  document.body.dataset.gameMode = mode;
  campaignModeButton.classList.toggle('active', mode === 'campaign');
  endlessModeButton.classList.toggle('active', mode === 'endless');
  if (mode === 'endless') endlessMission = window.CircuitLevelFactory.createEndlessMission(endlessRng);
  renderLevel();
}

function startGame() {
  if (gameMode === 'campaign' && !selectedR) return;
  state = makeState();
  state.mode = 'running';
  playTone(440);
  if (gameMode === 'campaign') state.current = electricalResult(selectedR).actual;
  startOverlay.hidden = true;
  resultOverlay.hidden = true;
  choices.disabled = true;
  startButton.disabled = true;
  if (gameMode === 'campaign' && skipAnimation.checked) {
    const result = electricalResult(selectedR);
    state.progress = result.safe ? 1 : 0;
    lapReadout.textContent = result.safe ? '1 / 1' : '0 / 1';
    voltageReadout.textContent = '0.0 V';
    finish(result.safe ? 'win' : 'failed');
    draw();
    return;
  }
  lastTime = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function resetGame() {
  state = makeState();
  choices.disabled = false;
  startButton.disabled = gameMode === 'campaign' && !selectedR;
  startOverlay.hidden = false;
  resultOverlay.hidden = true;
  lapReadout.textContent = gameMode === 'endless' ? '0 m / 0' : '0 / 1';
  voltageReadout.textContent = '0.0 V';
  bossMeter.style.width = '100%';
  draw();
}

function moveLane(direction) {
  if (state.mode !== 'running') return;
  state.targetLane = Math.max(0, Math.min(2, state.targetLane + direction));
  playTone(520, .08);
}


window.addEventListener('keydown', (event) => {
  if (['ArrowLeft','ArrowRight','Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'ArrowLeft') moveLane(-1);
  if (event.code === 'ArrowRight') moveLane(1);
});

// Tap/click the game to cycle to the next rail.
canvas.addEventListener('pointerdown', () => {
  if (state.mode === 'running') { state.targetLane = (state.targetLane + 1) % 3; playTone(520, .08); }
});

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, .034);
  lastTime = time;
  if (state.mode === 'running') update(dt);
  draw();
  if (state.mode === 'running') animationId = requestAnimationFrame(loop);
}

// Every failure freezes the run for a short fault animation before the result overlay.
function fail(type) {
  state.failAnim = .001;
  state.failType = type;
  state.flash = 1;
  playTone(120, .4);
}

function update(dt) {
  if (state.failAnim > 0) {
    state.failAnim += dt;
    state.flash = Math.max(0, state.flash - dt * 2);
    if (state.failAnim > 1.4) gameMode === 'endless' ? finishEndless(state.failType) : finish(state.failType);
    return;
  }
  if (gameMode === 'endless') { updateEndless(dt); return; }
  const result = electricalResult(selectedR);
  const led = getLevel().type === 'led';
  // LED overcurrent: the current rushes ahead (no chase) and burns the LED on arrival.
  // Any other wrong answer (incl. LED undercurrent): the current crawls and the fault catches it.
  const overcurrent = led && result.ratio > 1;
  const speed = result.safe ? .105 : overcurrent ? .14 : led ? .06 : .09;
  state.progress += speed * dt;
  const bossSpeed = result.safe || overcurrent ? .092 : led ? .09 : .125;
  state.bossProgress += bossSpeed * dt;
  if (overcurrent && state.progress >= LED_PROGRESS) {
    state.progress = LED_PROGRESS;
    fail('fried'); // a burnt-out LED fails open: nothing moves past it
    return;
  }
  state.lane += (state.targetLane - state.lane) * Math.min(1, dt * 12);
  state.obstaclePhase += dt;
  state.flash = Math.max(0, state.flash - dt * 4);

  if (state.progress >= 1) {
    state.progress = 1;
    lapReadout.textContent = '1 / 1';
    if (result.safe) finish('win'); else fail('wrong');
    return;
  }

  const local = ((state.progress % 1) + 1) % 1;
  state.voltage = voltageAt(local);
  voltageReadout.textContent = `${state.voltage.toFixed(1)} V`;

  const distance = Math.max(0, Math.min(1, state.progress - state.bossProgress));
  bossMeter.style.width = `${distance * 100}%`;
  if (state.bossProgress >= state.progress - .018) fail('caught');

}

function updateEndless(dt) {
  const speed = .105 + Math.min(.12, state.gates * .006);
  state.progress += speed * dt;
  state.bossProgress += (.088 + Math.min(.105, state.gates * .0045)) * dt;
  state.lane += (state.targetLane - state.lane) * Math.min(1, dt * 12);
  state.flash = Math.max(0, state.flash - dt * 4);

  const distance = Math.floor(state.progress * 600);
  lapReadout.textContent = `${distance} m / ${state.score}`;
  currentReadout.textContent = `${state.pickups} ⚡`;
  voltageReadout.textContent = `${(5 + Math.min(19, state.gates)).toFixed(1)} V`;

  const cycle = state.progress % 1;
  if (cycle < .08) {
    state.gateResolved = false;
  }

  const pickupPhase = Math.floor(state.progress * 4);
  if (pickupPhase !== state.obstaclePhase) {
    state.obstaclePhase = pickupPhase;
    state.pickupLane = (pickupPhase * 7 + state.gates) % 3;
    if (Math.round(state.lane) === state.pickupLane) { state.pickups += 1; state.score += 25; state.bossProgress -= .008; }
  }

  if (!state.gateResolved && cycle >= .82) {
    state.gateResolved = true;
    const level = getLevel();
    const correctLane = level.choices.findIndex(choice => physics.nearlyEqual(choice.value, level.correctValue));
    if (Math.round(state.lane) === correctLane) {
      state.score += 100 + state.gates * 10;
      state.bossProgress -= .055;
      feedback.textContent = `Gate ${state.gates + 1}: correct — ${level.equation(level.correctValue, level.target)}`;
      liveEquation.dataset.status = 'safe';
      playTone(880);
    } else if (level.type === 'led' && level.calculate(level.choices[Math.round(state.lane)].value) > level.target) {
      fail('fried');
      feedback.textContent = `LED fried — too little resistance. Correct: ${level.choices[correctLane].label}.`;
      liveEquation.dataset.status = 'danger';
      return; // keep this gate's circuit on screen for the burn-out
    } else {
      state.bossProgress += .07;
      state.flash = 1;
      feedback.textContent = `${level.type === 'led' ? 'LED too dim — the fault gains. ' : 'Wrong lane. '}Correct: ${level.choices[correctLane].label}.`;
      liveEquation.dataset.status = 'danger';
      playTone(160, .25);
    }
    state.gates += 1;
    endlessMission = window.CircuitLevelFactory.createEndlessMission(endlessRng);
    refreshEndlessGate();
  }

  const lead = Math.max(0, Math.min(1, state.progress - state.bossProgress));
  bossMeter.style.width = `${lead * 100}%`;
  if (state.bossProgress >= state.progress - .018) fail('caught');
}

function refreshEndlessGate() {
  const level = getLevel();
  document.querySelector('#missionName').textContent = level.title;
  document.querySelector('#equationFormula').textContent = level.formula;
  hintText.textContent = level.prompt;
  liveEquation.textContent = level.prompt;
  level.specs.forEach(([label,value], index) => {
    document.querySelector(`#specLabel${index}`).textContent = label;
    document.querySelector(`#specValue${index}`).textContent = value;
  });
  choices.querySelectorAll('label').forEach((label, index) => {
    label.querySelector('input').value = level.choices[index].value;
    label.querySelector('b').textContent = level.choices[index].label;
    label.querySelector('small').textContent = `LANE ${index + 1}`;
  });
}

function finishEndless(reason) {
  state.mode = 'finished';
  document.querySelector('#resultLabel').textContent = reason === 'fried' ? 'LED BURNT OUT · RUN OVER' : 'RUN OVER';
  document.querySelector('#resultTitle').textContent = `${Math.floor(state.progress * 600)} metres survived`;
  document.querySelector('#resultMessage').textContent = `${state.gates} circuit gates cleared · ${state.pickups} charge pickups · score ${state.score}`;
  document.querySelector('#resultEquation').textContent = 'Every gate used the same deterministic formulas as mission mode.';
  retryButton.firstChild.textContent = 'Run again ';
  resultOverlay.hidden = false;
  choices.disabled = false;
}

function voltageAt(p) {
  const source = sourceVoltage(getLevel());
  if (p < .11) return source;
  if (p < .19) return source - ((p - .11) / .08) * (source * .72);
  if (p < .27) return source * .28;
  if (p < .32) return source * .28 - ((p - .27) / .05) * (source * .28);
  return 0;
}

function finish(type) {
  state.mode = 'finished';
  const label = document.querySelector('#resultLabel');
  const title = document.querySelector('#resultTitle');
  const message = document.querySelector('#resultMessage');
  const equation = document.querySelector('#resultEquation');
  const level = getLevel();
  const values = type === 'win'
    ? ['MISSION COMPLETE', levelIndex === levels.length - 1 ? 'Training grid mastered' : `${level.title} complete`, level.success, level.equation(selectedR, state.current)]
    : type === 'fried'
      ? ['LED BURNT OUT', 'Too much current fried the LED', 'A burnt-out LED fails open: the series loop is broken, so no current can flow past it. Choose a larger resistor.', level.equation(selectedR, state.current)]
    : type === 'caught'
      ? ['FAULT OVERRUN', 'The fault caught the current', 'Recheck the selected value, then run the loop again.', level.equation(selectedR, state.current)]
      : ['MISSION FAILED', 'Target missed', state.current > level.target ? 'The calculated result is above the required target.' : 'The calculated result is below the required target.', level.equation(selectedR, state.current)];
  [label.textContent, title.textContent, message.textContent, equation.textContent] = values;
  completedLevel = type === 'win';
  if (completedLevel && gameMode === 'campaign') {
    campaignProgress={nextLevel:(levelIndex+1)%levels.length,completed:Math.min(levels.length,Math.max(campaignProgress.completed || 0,levelIndex+1))};
    writeStored('circuitRunner.progress',campaignProgress);
  }
  playTone(completedLevel ? 660 : 180);
  retryButton.firstChild.textContent = completedLevel ? (levelIndex === levels.length - 1 ? 'Restart campaign ' : 'Next mission ') : 'Run again ';
  resultOverlay.hidden = false;
  choices.disabled = false;
}

function formatCurrent(value) {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function formatResult(value, level) {
  if (level.unit === 'Ω') return value >= 1000 ? `${Number((value/1000).toFixed(2))} kΩ` : `${Number(value.toFixed(2))} Ω`;
  if (level.unit === 'V') return `${Number(value.toFixed(2))} V`;
  if (level.unit === 'W') return `${Number(value.toFixed(2))} W`;
  if (value < 1) return `${formatCurrent(value * 1000)} mA`;
  return `${Number(value.toFixed(2))} A`;
}

function sourceVoltage(level) {
  const supply = level.specs.find(([label]) => label === 'SUPPLY' || label === 'VOLTAGE' || label === 'INPUT');
  const parsed = supply ? Number.parseFloat(supply[1]) : 12;
  return Number.isFinite(parsed) ? parsed : 12;
}

function trackPoint(progress, lane = 1) {
  let d = (((progress % 1) + 1) % 1) * perimeter;
  const horizontal = track.right - track.left;
  const vertical = track.bottom - track.top;
  const offset = laneOffsets[Math.round(lane)] || 0;
  if (d < horizontal) return { x: track.left + d, y: track.bottom + offset, angle: 0 };
  d -= horizontal;
  if (d < vertical) return { x: track.right + offset, y: track.bottom - d, angle: -Math.PI / 2 };
  d -= vertical;
  if (d < horizontal) return { x: track.right - d, y: track.top - offset, angle: Math.PI };
  d -= horizontal;
  return { x: track.left - offset, y: track.top + d, angle: Math.PI / 2 };
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawCircuit();
  drawComponents();
  if (gameMode === 'endless') drawEndlessFeatures();
  if (state.mode !== 'idle') {
    drawParticles();
    drawBoss();
    drawRunner();
    if (state.failAnim > 0 && state.failType !== 'fried') drawFault();
  }
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,70,55,${state.flash * .16})`;
    ctx.fillRect(0,0,W,H);
  }
}

function drawEndlessFeatures() {
  // Answer gate: the three rails are the three multiple-choice answers.
  const gateBase = trackPoint(.82, 1);
  const level = getLevel();
  level.choices.forEach((choice, lane) => {
    // Rails are only 20px apart, so spread the answer boxes 100px apart (outer rail leftmost).
    const p = trackPoint(.82, lane);
    const x = gateBase.x + 10 + (1 - lane) * 100;
    ctx.fillStyle = lane === Math.round(state.lane) ? 'rgba(64,224,255,.2)' : 'rgba(8,20,32,.88)';
    ctx.strokeStyle = lane === Math.round(state.lane) ? '#40e0ff' : '#5d7588';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, p.y - 9); ctx.stroke();
    ctx.fillRect(x - 46, p.y - 30, 92, 42); ctx.strokeRect(x - 46, p.y - 30, 92, 42);
    ctx.fillStyle = '#edf7ff'; ctx.font = '700 12px DM Mono'; ctx.textAlign = 'center'; ctx.fillText(choice.label, x, p.y - 5);
  });
  componentLabel(gateBase.x - 80, gateBase.y - 55, 'ANSWER GATE', `#${state.gates + 1}`);


  for (let quarter = .12; quarter < .8; quarter += .25) {
    const p = trackPoint(quarter, (Math.floor((state.progress + quarter) * 4) * 7 + state.gates) % 3);
    ctx.shadowBlur = 14; ctx.shadowColor = '#b9ff4a'; ctx.fillStyle = '#b9ff4a';
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
}

function drawBackground() {
  const gradient = ctx.createRadialGradient(W/2,H/2,20,W/2,H/2,520);
  gradient.addColorStop(0,'#10283b'); gradient.addColorStop(1,'#06101b');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = 'rgba(70,190,220,.06)'; ctx.lineWidth = 1;
  for (let x=20;x<W;x+=32) { ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke(); }
  for (let y=20;y<H;y+=32) { ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke(); }
  ctx.fillStyle = 'rgba(120,170,196,.5)'; ctx.font = '11px DM Mono';
  ctx.fillText(gameMode === 'endless' ? `ENDLESS GRID // GATE ${state.gates + 1} // SPEED ${Math.round((.105 + state.gates * .006) * 1000)}` : `${getLevel().type.toUpperCase()} CIRCUIT // CLOSED TRAINING LOOP`,28,34);
}

function roundedRectPath(x,y,w,h,r) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r);
}

function drawCircuit() {
  for (let i=0;i<3;i++) {
    const o = laneOffsets[i];
    roundedRectPath(track.left-o,track.top-o,(track.right-track.left)+o*2,(track.bottom-track.top)+o*2,track.radius+o);
    ctx.strokeStyle = i === Math.round(state.lane) && state.mode === 'running' ? 'rgba(64,224,255,.7)' : 'rgba(91,141,168,.19)';
    ctx.lineWidth = i === 1 ? 5 : 2; ctx.stroke();
  }
  ctx.setLineDash([4,11]);
  roundedRectPath(track.left,track.top,track.right-track.left,track.bottom-track.top,track.radius);
  ctx.strokeStyle='rgba(185,255,74,.25)';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);
}

function drawComponents() {
  const level = getLevel();
  const circuit = level.circuit;
  const components = circuit.components.map(component => component.value === '?' && selectedR
    ? { ...component, value:level.choices.find(choice => choice.value === selectedR)?.label || component.value }
    : component);
  ctx.strokeStyle='rgba(64,224,255,.48)'; ctx.lineWidth=4;
  if (circuit.source) drawSource(220,555,circuit.source);
  if (circuit.topology === 'parallel') drawParallelComponents(components, circuit.source ? 340 : 230, 790);
  else if (circuit.topology === 'mixed') drawMixedComponents(components, circuit.source ? 330 : 220, 805);
  else drawSeriesComponents(components, circuit.source ? 330 : 200, 820);

  ctx.textAlign='right';ctx.fillStyle='#b9ff4a';ctx.font='500 11px DM Mono';ctx.fillText(`${level.metric}: ${level.specs.find(([label]) => label === 'FIND')?.[1] || level.specs.at(-1)[1]}`,850,617);

  // Direction markers make the intended conventional-current path explicit.
  ctx.fillStyle='rgba(64,224,255,.65)';ctx.font='500 13px DM Mono';ctx.textAlign='center';
  ctx.fillText('CURRENT  →',585,545);

}

function drawSource(x,y,value) {
  ctx.strokeStyle='#b9ff4a';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x-18,y-25);ctx.lineTo(x-18,y+25);ctx.moveTo(x+2,y-15);ctx.lineTo(x+2,y+15);ctx.stroke();
  componentLabel(x-34,y+38,'SOURCE',value);
}

function drawSeriesComponents(components,left,right) {
  if (!components.length) return;
  const step=(right-left)/components.length;
  components.forEach((component,index)=>drawSchematicComponent(left+step*(index+.5),555,component));
}

function drawParallelComponents(components,left,right) {
  const top=components[0], bottom=components[1];
  ctx.beginPath();ctx.moveTo(left,555);ctx.lineTo(left+35,500);ctx.lineTo(right-35,500);ctx.lineTo(right,555);ctx.moveTo(left,555);ctx.lineTo(left+35,590);ctx.lineTo(right-35,590);ctx.lineTo(right,555);ctx.stroke();
  if (top) drawSchematicComponent((left+right)/2,500,top);
  if (bottom) drawSchematicComponent((left+right)/2,590,bottom);
  components.slice(2).forEach((component,index)=>drawSchematicComponent(left+80+index*120,555,component));
}

function drawMixedComponents(components,left,right) {
  if (components[0]) drawSchematicComponent(left+80,555,components[0]);
  drawParallelComponents(components.slice(1),left+180,right);
}

function drawSchematicComponent(x,y,component) {
  const width=92;
  ctx.save();ctx.fillStyle='#07111d';ctx.fillRect(x-width/2-8,y-22,width+16,44);
  ctx.strokeStyle=component.kind === 'meter' ? '#40e0ff' : '#b9ff4a';ctx.lineWidth=4;ctx.beginPath();
  if (component.kind === 'resistor') {
    ctx.moveTo(x-width/2,y);for(let i=0;i<6;i++)ctx.lineTo(x-width/2+15+i*13,y+(i%2?10:-10));ctx.lineTo(x+width/2,y);
  } else if (component.kind === 'capacitor') {
    ctx.moveTo(x-width/2,y);ctx.lineTo(x-7,y);ctx.moveTo(x-7,y-18);ctx.lineTo(x-7,y+18);ctx.moveTo(x+7,y-18);ctx.lineTo(x+7,y+18);ctx.moveTo(x+7,y);ctx.lineTo(x+width/2,y);
  } else {
    ctx.arc(x,y,18,0,Math.PI*2);
  }
  ctx.stroke();ctx.restore();
  if (component.kind === 'led' && state.mode !== 'idle') drawLedState(x,y);
  if (component.kind === 'capacitor' && state.mode !== 'idle') drawCapacitorCharge(x,y);
  componentLabel(x-width/2,y+32,component.label,component.value);
}

// One lap = 5τ, so the fill follows 1 − e^(−t/τ): 63% at 1τ, 86% at 2τ, 95% at 3τ… (discharge mirrors it).
function drawCapacitorCharge(x,y) {
  const n=(state.progress%1 || (state.progress >= 1 ? 1 : 0))*5;
  const charge=getLevel().id === 'discharging-voltage' ? Math.exp(-n) : 1-Math.exp(-n);
  ctx.fillStyle=`rgba(64,224,255,${.25+charge*.6})`;
  ctx.fillRect(x-5,y+18-36*charge,10,36*charge);
  ctx.fillStyle='#40e0ff';ctx.font='500 12px DM Mono';ctx.textAlign='center';
  ctx.fillText(`${Math.round(charge*100)}% · t = ${n.toFixed(1)}τ`,x,y-28);
}

// Lit once the current reaches it: brightness tracks the current ratio; overcurrent burns it out.
function drawLedState(x,y) {
  ctx.save();ctx.textAlign='center';ctx.font='500 12px DM Mono';
  if (state.failType === 'fried') {
    ctx.fillStyle='#1a0d0a';ctx.beginPath();ctx.arc(x,y,16,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#ff553d';ctx.lineWidth=3;ctx.beginPath();
    ctx.moveTo(x-10,y-10);ctx.lineTo(x+10,y+10);ctx.moveTo(x+10,y-10);ctx.lineTo(x-10,y+10);ctx.stroke();
    for (let i=0;i<3;i++) { // smoke puffs drifting up
      ctx.fillStyle=`rgba(160,160,160,${Math.max(0,.5-state.failAnim*.3)})`;
      ctx.beginPath();ctx.arc(x+(i-1)*9,y-24-state.failAnim*30-i*8,6+state.failAnim*4,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle='#ff553d';ctx.fillText('BURNT OUT · OPEN CIRCUIT',x,y-34);
  } else if (gameMode === 'campaign' && state.progress >= LED_PROGRESS) { // endless has no selectedR
    const ratio=Math.min(1,electricalResult(selectedR).ratio);
    ctx.shadowBlur=30*ratio;ctx.shadowColor='#b9ff4a';ctx.fillStyle=`rgba(185,255,74,${.15+.75*ratio})`;
    ctx.beginPath();ctx.arc(x,y,15,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#b9ff4a';ctx.fillText(ratio < 1 ? 'DIM · CURRENT TOO LOW' : 'LIT',x,y-30);
  }
  ctx.restore();
}

function componentLabel(x,y,label,value) {
  ctx.textAlign='left';ctx.fillStyle='rgba(143,166,185,.65)';ctx.font='10px DM Mono';ctx.fillText(label,x,y);
  ctx.fillStyle='#edf7ff';ctx.font='500 13px DM Mono';ctx.fillText(value,x,y+18);
}

function drawParticles() {
  for (let i=0;i<18;i++) {
    const p=trackPoint(state.progress-i*.047,1);
    ctx.fillStyle=`rgba(64,224,255,${.1+(i%3)*.1})`;ctx.beginPath();ctx.arc(p.x,p.y,2+i%2,0,Math.PI*2);ctx.fill();
  }
}

function drawRunner() {
  const p=trackPoint(state.progress,state.lane);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
  ctx.shadowBlur=24;ctx.shadowColor='#40e0ff';ctx.fillStyle='#eafcff';ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#40e0ff';ctx.beginPath();ctx.moveTo(-23,0);ctx.lineTo(-8,-7);ctx.lineTo(-8,7);ctx.closePath();ctx.fill();ctx.restore();ctx.shadowBlur=0;
}

// Generic fault burst at the current's position (the LED draws its own burn-out).
function drawFault() {
  const p=trackPoint(state.progress,state.lane), t=state.failAnim;
  ctx.save();ctx.strokeStyle='#ff553d';ctx.lineWidth=3;ctx.globalAlpha=Math.max(0,1-t/1.4);
  for (let i=0;i<10;i++) {
    const a=i*Math.PI/5, r=14+t*60;
    ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*r*.4,p.y+Math.sin(a)*r*.4);ctx.lineTo(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r);ctx.stroke();
  }
  ctx.globalAlpha=1;ctx.fillStyle='#ff553d';ctx.font='500 12px DM Mono';ctx.textAlign='center';
  ctx.fillText(state.failType === 'wrong' ? 'TARGET MISSED' : 'FAULT OVERRUN',p.x,p.y-34);
  ctx.restore();
}

function drawBoss() {
  const p=trackPoint(state.bossProgress,1);
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
  ctx.shadowBlur=28;ctx.shadowColor='#ff553d';ctx.fillStyle='#ff553d';
  ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(5,-15);ctx.lineTo(-14,-11);ctx.lineTo(-20,0);ctx.lineTo(-14,11);ctx.lineTo(5,15);ctx.closePath();ctx.fill();
  ctx.fillStyle='#130907';ctx.beginPath();ctx.arc(3,-5,3,0,Math.PI*2);ctx.arc(3,5,3,0,Math.PI*2);ctx.fill();ctx.restore();ctx.shadowBlur=0;
}

if (installedMode) { document.body.classList.add('installed-mode'); homeButton.hidden=false; }
renderLevel();
if (installedMode || location.hash === '#home') openEntry();
document.querySelector('.brand').addEventListener('click', (event) => { event.preventDefault(); openEntry(); });
