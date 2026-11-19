// Deterministic screenshot scenes behind ?shot=start|drive|chase|mission&seed=1.
// Each one plays the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { clamp } from './util.js';

const STEP = 1 / 60;

function stepWorld(G, n, input) {
  for (let i = 0; i < n; i++) G.update(STEP, input);
}

// Drive the player's car straight along a road: aim at a point 20m ahead on the
// nearest road centreline (lateral axis depends on the heading), steering toward it.
function driveAutopilot(G) {
  const car = G.player.inCar;
  const none = { f: false, b: false, l: false, r: false, run: false, jump: false, handbrake: false };
  if (!car) return none;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const alongZ = Math.abs(fz) >= Math.abs(fx);
  const lat = alongZ ? car.pos.x : car.pos.z;
  const line = Math.round(lat / 36) * 36;
  const ahead = 20;
  const tx = alongZ ? line : car.pos.x + fx * ahead;
  const tz = alongZ ? car.pos.z + fz * ahead : line;
  const desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
  let dh = desired - car.heading;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  return { f: true, b: false, l: dh > 0.04, r: dh < -0.04, run: false, jump: false, handbrake: false };
}

export function stageShot(G, name) {
  G.resetWorld(1);
  G.startGame();
  G.hud.hideOver();
  const P = G.player;

  if (name === 'start') {
    // Cinematic title view: high above the city looking east to the sea at sunset.
    G.shotCamera = { pos: [-40, 55, 150], look: [120, 8, 40] };
    stepWorld(G, 30, {});
    G.hud.showStart();
    G.hud.el.style.display = 'none'; // clean title cover: hide the HUD behind the panel
    return { screen: 'title' };
  }

  if (name === 'drive') {
    // Player in a car mid-city, traffic around, camera behind the car.
    const car = G.cars.find((c) => !c.isPolice && !c.parked && c.ai);
    P.pos.set(0, 0, -90);
    G.enterCarAt(car, P.pos);
    car.speed = 12;
    stepWorld(G, 90, driveAutopilot(G));
    // keep the autopilot running a few more steps so the car is mid-motion
    for (let i = 0; i < 60; i++) G.update(STEP, driveAutopilot(G));
    return { screen: 'play' };
  }

  if (name === 'chase') {
    // Two stars, two police cars right behind the player's car.
    const car = G.cars.find((c) => !c.isPolice && !c.parked && c.ai);
    P.pos.set(36, 0, 36);
    G.enterCarAt(car, P.pos);
    car.speed = 16;
    G.addCrime(2, 'Grand theft auto');
    stepWorld(G, 150, driveAutopilot(G));
    return { screen: 'play' };
  }

  // mission: on foot at the dock, marker + beacon + rivals in frame.
  P.pos.set(196, 0, 98);
  P.yaw = Math.PI / 2; // face east, into the dock
  G.camYaw = -Math.PI / 2; // camera behind the player, looking east at the dock
  G.startMissionDirect(3);
  G.missions.phase = 'fight';
  G.spawnAmbushForShot();
  stepWorld(G, 45, {});
  return { screen: 'play' };
}

export function shotCamera(G) {
  if (G.shotCamera) {
    G.camera.position.set(...G.shotCamera.pos);
    G.camera.lookAt(G.shotCamera.look[0], G.shotCamera.look[1], G.shotCamera.look[2]);
    return true;
  }
  return false;
}
