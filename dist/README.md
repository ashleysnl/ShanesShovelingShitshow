# SHANE'S SHOVELING SHITSHOW

Retro arcade snow-shoveling survival game built for mobile-first web play, with iPhone Safari portrait UX as the primary target.

## Gameplay Summary
You are Shane, sprinting across a driveway to shovel snow before it becomes impassable. The city plow keeps blasting by and re-burying your hard work. Stay alive, chain combos, and chase absurdly large scores.

## Core Loop
- Move around the driveway.
- Shovel snow continuously to keep lanes open.
- React to dramatic plow warnings and passing plow hazards.
- Grab timed upgrades:
`The Scoop` (big blue shovel, faster/bigger shoveling), `THE HONDA` (red snowblower-style rapid cone clearing), and `HIGDON IS HERE TO HELP` (temporary CPU helper that roams and clears snow).
- Exploit risk/reward by shoveling near the street during danger windows.
- Survive longer waves as snow and plow pressure ramp up.

## Controls
### iPhone / Touch
- Virtual joystick (left): movement.
- `SHOVEL` button (right): hold for rapid shoveling.
- `Pause` button: pause/resume.
- `Mute` + `Volume`: audio control.
- Tap `Start Run` once to unlock audio on iOS (required by Safari user-gesture policy).

### Desktop
- `WASD` or arrow keys: movement.
- `Space`: shovel.
- `P` or `Esc`: pause/resume.
- Optional mouse support: click/drag on canvas to steer.

## Scoring System
- Base points: based on snow depth removed.
- Combo multiplier: grows quickly per successful shovel chain.
- Risk bonus: extra multiplier for shoveling near incoming/active plow.
- Frenzy bonus: extra multiplier when top rows are heavily buried.
- Combo rank tiers escalate from `WARMING UP` to `BLIZZARD GOD`.

## Tech Stack
- Plain HTML/CSS/JavaScript (ES modules).
- Static-host friendly (no backend).
- Procedural WebAudio chiptune music + SFX (no external paid assets).

## Project Structure
- `index.html`: app shell and overlays.
- `styles.css`: mobile-first layout, safe-area handling, controls.
- `src/main.js`: composition/wiring.
- `src/game.js`: core game loop and systems.
- `src/input.js`: touch, keyboard, optional mouse controls.
- `src/audio.js`: iOS-safe audio unlock + procedural music/SFX.
- `src/pixelAssets.js`: runtime pixel sprite generation.
- `src/scoring.js`: score and difficulty helpers.
- `assets/`: generated pixel art assets.
- `assets/source/pixel-art-notes.md`: asset generation notes.
- `test/scoring.test.js`: lightweight logic tests.

## Local Run
Run from project root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Build
```bash
./scripts/build.sh
```

This writes a static deployment bundle to `dist/` using only shell utilities.

## GitHub Pages Deployment
1. Build production files:
```bash
./scripts/build.sh
```
2. Commit the repository.
3. Push `dist/` to your Pages branch (common options):
- Option A: set Pages source to `/ (root)` and serve project root directly.
- Option B: set Pages source to `gh-pages` branch and publish `dist/` contents.
4. In GitHub repo settings, enable Pages and select the chosen branch/folder.
5. Confirm the live URL loads and audio unlock works after tapping `Start Run`.

## iOS Compatibility Notes
- Uses `viewport-fit=cover` and safe-area CSS insets for notch/home-indicator layouts.
- `touch-action: none` and prevented touch scrolling on control/canvas regions to avoid accidental page movement.
- Audio starts only after explicit user gesture (`Start Run`) to satisfy iOS Safari autoplay restrictions.
- Portrait-first canvas scaling with responsive layout adjustments for larger screens.

## Quality + Testing
### Automated tests
```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/test/scoring-browser-test.html` and verify all tests show `PASS`.

### Manual test checklist
- Title screen shows **SHANE'S SHOVELING SHITSHOW** prominently.
- iPhone Safari portrait: no accidental scroll/zoom while controlling.
- Joystick movement feels responsive and continuous.
- SHOVEL button rapidly clears nearby snow.
- Plow repeatedly passes and re-buries driveway.
- Score can grow into very large values with combo/risk play.
- Pause/resume works via button and keyboard.
- Game over and restart loop are stable.
- High score persists between runs (localStorage).
- Mute and volume controls work.
- Audio starts only after user interaction on iOS.
- Tab hide/restore pauses safely without simulation spikes.
- Desktop keyboard controls and optional mouse steering work.

## Design Notes
See `DESIGN_NOTES.md` for scoring, difficulty, and game-feel rationale.
