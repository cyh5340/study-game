# Circuit Runner — Task Plan

## Product goal

Build a browser game that turns introductory DC circuit analysis into a closed-loop runner. The player configures a circuit, predicts its behavior, then becomes the moving charge and completes the loop while a fault boss gives chase.

## Learning goals

- Apply Ohm's law: `V = IR`.
- Calculate a current-limiting resistor for an LED.
- Connect voltage rise and voltage drop around a closed loop.
- Distinguish safe operating current from undercurrent and overcurrent.
- Later: reduce series/parallel networks, follow branch current, use voltage dividers, and calculate power.

## Milestones

### 1. Playable vertical slice

- [x] Responsive browser shell and circuit-themed visual identity.
- [x] Mission briefing with an explicit target.
- [x] Resistor selection based on a real calculation.
- [x] Closed circuit represented as the runner's track.
- [x] Keyboard and touch controls.
- [x] Fault boss chase, hazards, pickups, and multiple laps.
- [x] Live voltage/current telemetry and component reactions.
- [x] Win, retry, pause, and explanatory feedback.

### 2. Stronger learning loop

- [ ] Add pre-run prediction questions.
- [ ] Generate multiple values for the LED mission.
- [ ] Diagnose mistakes by type: equation, arithmetic, or units.
- [ ] Add a post-run worked solution and near-transfer problem.
- [ ] Save mastery and best scores locally.

### 3. Circuit curriculum

- [x] Fifteen-mission campaign.
- [x] Series resistance, current, and voltage-drop levels.
- [x] Parallel equivalent resistance and branch-current levels.
- [x] Mixed-network reduction and section-voltage levels.
- [x] Power and thermal-limit levels.
- [x] Current-protection boss level.

### 4. Polish and validation

- [ ] Add sound and reduced-motion controls.
- [ ] Play-test difficulty and input timing.
- [ ] Validate equations against generated test cases.
- [ ] Test on desktop and mobile browsers.

## Vertical-slice acceptance criteria

The player can calculate or infer the correct resistor, see why each choice is safe or unsafe, complete a closed loop under pursuit, and finish the level with a worked equation connecting the game state to typical homework notation.
