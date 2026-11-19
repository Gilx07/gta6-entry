# gta6-entry

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Gilx07/gta6-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Gilx07/gta6-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

VICE BAY — an open-world crime game in a fictional coastal city at sunset, built by
an AI agent for make.fun's "Make GTA 6" bounty, $1,666 in USDC. Play it in a desktop
browser from static files, no network needed.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` through any static server. Node 22 only for the tooling;
the game itself is plain HTML + ES modules, with three.js vendored under `game/js/`.

## The game

You wash up in Vice Bay with $250 and a name nobody knows. A fixer named Marlowe
has a job: pick up a package, lose the heat, drop it across town, and settle things
with the dock crew. Four chained missions, one city, no backup.

- **The city**: a 10x10 block grid with marked roads, procedural buildings with lit
  windows, palm trees, street lamps, a beach and the sea to the east, and a wooden
  dock. Sunset light, fog, no shadow maps, capped at 60fps.
- **On foot**: third-person camera, WASD to move, Shift to run, Space to jump.
- **Cars**: traffic follows loops around the blocks and slows for the car ahead;
  parked cars wait at the kerb. Press E near a car to get in — if it has a driver,
  he runs and the law notices. Arcade driving: WASD, Space handbrake, E to get out.
- **Wanted 0–5 stars**: stealing a car, hitting a pedestrian, shooting, or killing
  an officer raises it. Police cars spawn at the city edge and ram you; foot officers
  appear from 2 stars. Lose them for 20 seconds and the heat drops. Get caught with
  low health and you are BUSTED; hit zero health and you are WASTED. Either way you
  wake up at the hospital, lighter by a fine.
- **Combat**: F or left click to punch, right click or G to fire the pistol (12
  rounds, R reloads), with tracer lines and hit reactions. Rivals have health bars.
- **Missions**: The Pickup, Lose the Heat, The Drop (90 seconds), The Ambush — five
  rivals on the dock, then run clear. Each pays out; finishing all four shows the
  Story Complete screen.
- **HUD**: health, money, wanted stars, mission objective and timer, speed, a live
  2D minimap with the mission marker, police blips and traffic, crosshair, and a
  message feed.
- **Sound**: fully synthesised WebAudio — engine hum that follows speed, a two-tone
  siren, gunshots, pickup chimes, mission jingles, and a bass-and-pad ambient loop
  (M toggles the music). No audio files.
- **Save**: progress, money and position save to localStorage on every completed
  mission and every 30 seconds; Continue resumes where you left off.

## Deterministic scenes and self-test

- `?shot=start|drive|chase|mission&seed=1` stages one fixed scene from a fresh
  world and renders a single frame — the four screenshots in `screenshots/`.
- `?selftest=1` runs a 20-second scripted pass through the real rules (walk, enter
  a car, drive, trigger wanted, police response, pick up the M1 package, shoot a
  rival, save) and writes PASS/FAIL to the console and to `document.title`.

## License

MIT. See LICENSE.

---

<sub>Entered on [make.fun](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
