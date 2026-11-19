// VICE BAY — bootstrap, game loop, input, camera, combat, save/load, ?shot= and ?selftest=.
import * as THREE from './three.module.min.js';
import { buildCity } from './city.js';
import { createPlayer, createHumanoid, updatePlayerOnFoot } from './player.js';
import { spawnTraffic, updateTraffic, updateDriving, nearestCar, makeCar } from './vehicles.js';
import { addCrime, updateWanted, updatePolice, hurtPlayer, busted, wasted, respawn } from './police.js';
import { createMissions, startMission, updateMissions, updateEnemies, spawnAmbush } from './missions.js';
import { createHud, updateHud } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot, shotCamera } from './shots.js';
import { runSelfTest } from './selftest.js';
import { mulberry32, clamp } from './util.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SELFTEST = params.get('selftest') === '1';
const SEED = parseInt(params.get('seed') || '1', 10) || 1;

const G = {
  seed: SEED, time: 0, wanted: 0, lastCrimeTime: -100,
  cars: [], peds: [], policeCars: [], policeFoot: [],
  camYaw: Math.PI, camPitch: -0.32, started: false, over: null,
  shotMode: !!SHOT, shotCamera: null,
};

G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
G.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
G.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
G.renderer.setSize(innerWidth, innerHeight);
G.city = buildCity(G.scene, SEED);
G.hud = createHud();
G.audio = createAudio();
G.player = createPlayer(G.scene);
G.missions = createMissions(G);

// --- functions the modules call back through G ---
G.addCrime = (s, label) => addCrime(G, s, label);
G.hurtPlayer = (d, src) => hurtPlayer(G, d, src);
G.busted = (r) => busted(G, r);
G.wasted = (r) => wasted(G, r);
G.save = saveGame;
G.startMissionDirect = (i) => startMission(G, i);
G.spawnAmbushForShot = () => { G.missions.phase = 'fight'; spawnAmbush(G); };
G.enterCarAt = enterCarAt;
G.exitCar = exitCar;
G.tryShoot = tryShoot;
G.tryPunch = tryPunch;
G.spawnTestRival = spawnTestRival;
G.resetWorld = resetWorld;
G.startGame = startGame;
G.update = update;
G.render = () => G.renderer.render(G.scene, G.camera);

// --- world reset (also used by shots/selftest) ---
function clearDynamics() {
  for (const c of G.cars) G.scene.remove(c.mesh);
  for (const p of G.peds) G.scene.remove(p.mesh);
  G.cars = []; G.peds = []; G.policeCars = []; G.policeFoot = [];
}

function resetWorld(seed) {
  G.seed = seed || 1;
  clearDynamics();
  G.time = 0; G.wanted = 0; G.lastCrimeTime = -100; G.over = null;
  G.audio.sirenOff();
  const p = G.player;
  p.pos.set(0, 0, 54); p.yaw = Math.PI; p.vy = 0; p.onGround = true;
  p.health = 100; p.money = 250; p.ammo = 12; p.inCar = null;
  p.mesh.visible = true;
  p.mesh.position.copy(p.pos);
  G.camYaw = Math.PI; G.camPitch = -0.32;
  spawnTraffic(G, 12);
  spawnPedestrians(G, 22);
  G.missions = createMissions(G);
  startMission(G, 0);
  G.hud.hideOver();
  G.hud.setTimer(0);
  document.getElementById('story-complete').style.display = 'none';
}

function spawnPedestrians(G, n) {
  const rng = mulberry32(G.seed + 99);
  const shirts = [0xc23b2e, 0x2e6bc2, 0xe0a52e, 0x3a9e5f, 0x8a8f99, 0xdde2e8, 0x7a3a9e, 0xe07a3a];
  for (let i = 0; i < n; i++) {
    const line = (Math.floor(rng() * 11) - 5) * 36;
    const along = -162 + rng() * 324;
    const horiz = rng() < 0.5;
    const x = horiz ? along : line + (rng() < 0.5 ? 9 : -9);
    const z = horiz ? line + (rng() < 0.5 ? 9 : -9) : along;
    const h = createHumanoid(G.scene, shirts[i % shirts.length], 0x2a3550);
    h.mesh.position.set(x, 0, z);
    G.peds.push({
      mesh: h.mesh, humanoid: h, pos: new THREE.Vector3(x, 0, z),
      health: 30, maxHealth: 30, speed: 1.6 + rng() * 1.2,
      target: new THREE.Vector3(x, 0, z), hostile: false, dead: false,
      fleeing: false, phase: rng() * 6,
    });
  }
}

function updatePedestrians(G, dt) {
  for (const p of G.peds) {
    if (p.dead || p.isPolice || p.hostile) continue;
    const dPlayer = Math.hypot(p.pos.x - G.player.pos.x, p.pos.z - G.player.pos.z);
    // flee a nearby speeding car or a fresh crime
    const nearCar = G.cars.some((c) => Math.abs(c.speed) > 6 && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 8);
    if ((nearCar || (G.wanted > 0 && dPlayer < 10)) && !p.fleeing) p.fleeing = true;
    if (p.fleeing) {
      const dx = p.pos.x - G.player.pos.x, dz = p.pos.z - G.player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      p.pos.x += (dx / d) * 5 * dt; p.pos.z += (dz / d) * 5 * dt;
      p.mesh.rotation.y = Math.atan2(dx, dz);
      if (dPlayer > 40) p.fleeing = false;
    } else {
      const dx = p.target.x - p.pos.x, dz = p.target.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        // pick a new sidewalk target
        const line = (Math.floor(Math.random() * 11) - 5) * 36;
        const along = -162 + Math.random() * 324;
        if (Math.random() < 0.5) p.target.set(along, 0, line + (Math.random() < 0.5 ? 9 : -9));
        else p.target.set(line + (Math.random() < 0.5 ? 9 : -9), 0, along);
      } else {
        p.pos.x += (dx / d) * p.speed * dt;
        p.pos.z += (dz / d) * p.speed * dt;
        p.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
    p.phase += dt * 7;
    p.humanoid.legL.rotation.x = Math.sin(p.phase) * 0.6;
    p.humanoid.legR.rotation.x = -Math.sin(p.phase) * 0.6;
    p.mesh.position.copy(p.pos);
  }
}

// --- enter / exit car ---
function enterCarAt(car) {
  if (!car || G.player.inCar) return false;
  const p = G.player;
  if (car.driver && !car.isPolice) {
    // drag the driver out: he flees, and it is grand theft auto
    const h = createHumanoid(G.scene, 0x888888, 0x2a3550);
    const dx = car.pos.x + 3, dz = car.pos.z + 2;
    h.mesh.position.set(dx, 0, dz);
    const ped = { mesh: h.mesh, humanoid: h, pos: new THREE.Vector3(dx, 0, dz), health: 30, maxHealth: 30, speed: 5, target: new THREE.Vector3(dx, 0, dz), hostile: false, dead: false, fleeing: true, phase: 0 };
    G.peds.push(ped);
    car.driver = null;
    G.addCrime(1, 'Grand theft auto');
  } else if (car.isPolice) {
    G.addCrime(1, 'Stole a police car');
  }
  car.occupied = true;
  car.ai = false;
  p.inCar = car;
  p.mesh.visible = false;
  p.pos.copy(car.pos);
  G.audio.setEngine(car.speed, true);
  return true;
}

function exitCar() {
  const car = G.player.inCar;
  if (!car) return;
  car.occupied = false;
  car.ai = !car.isPolice;
  const p = G.player;
  p.inCar = null;
  p.pos.set(car.pos.x + 3, 0, car.pos.z + 2);
  p.mesh.visible = true;
  p.mesh.position.copy(p.pos);
  G.audio.setEngine(0, false);
}

// --- combat ---
const tracers = [];
function addTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 }));
  G.scene.add(line);
  tracers.push({ line, t: 0 });
}

function aimTarget(maxDist, maxAngle) {
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  const origin = G.camera.position.clone();
  let best = null, bestD = maxDist;
  const cands = [...G.missions.enemies, ...G.policeFoot, ...G.peds.filter((p) => !p.dead && !p.isPolice && !p.hostile)];
  for (const t of cands) {
    if (t.dead) continue;
    const to = new THREE.Vector3(t.pos.x, 1.0, t.pos.z).sub(origin);
    const d = to.length();
    if (d > bestD) continue;
    const ang = to.normalize().angleTo(dir);
    if (ang < maxAngle) { best = t; bestD = d; }
  }
  return { target: best, dist: bestD, dir, origin };
}

function tryShoot() {
  const p = G.player;
  if (p.reloadT > 0 || p.shootCd > 0 || p.inCar) return;
  if (p.ammo <= 0) { G.hud.message('Out of ammo — press R'); p.shootCd = 0.35; return; }
  p.ammo--; p.shootCd = 0.28;
  G.audio.shot();
  const { target, dist, dir, origin } = aimTarget(45, 0.12);
  const end = origin.clone().add(dir.clone().multiplyScalar(target ? dist : 45));
  addTracer(origin.clone().add(dir.clone().multiplyScalar(1.2)), end);
  if (target) {
    target.health -= 25;
    setHealthBarTarget(target);
    if (target.health <= 0) {
      target.dead = true;
      target.mesh.visible = false;
      if (target.isPolice) G.addCrime(2, 'Killed an officer');
      else if (target.hostile) G.hud.message('Rival down');
      else G.addCrime(1, 'Shot a pedestrian');
    }
  }
}

function setHealthBarTarget(t) {
  if (t.humanoid) {
    const h = t.humanoid;
    h.barBg.visible = true; h.barFg.visible = true;
    const f = clamp(t.health / t.maxHealth, 0, 1);
    h.barFg.scale.x = f;
    h.barFg.position.x = -0.35 * (1 - f);
  }
}

function tryPunch() {
  const p = G.player;
  if (p.punchCd > 0 || p.inCar) return;
  p.punchCd = 0.45;
  G.audio.punch();
  for (const t of [...G.missions.enemies, ...G.policeFoot, ...G.peds.filter((x) => !x.dead && !x.isPolice && !x.hostile)]) {
    if (t.dead) continue;
    if (Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) < 2.2) {
      t.health -= 20;
      setHealthBarTarget(t);
      if (t.health <= 0) {
        t.dead = true; t.mesh.visible = false;
        if (t.isPolice) G.addCrime(2, 'Killed an officer');
        else if (t.hostile) G.hud.message('Rival down');
        else G.addCrime(1, 'Beat a pedestrian');
      }
      break;
    }
  }
}

function spawnTestRival() {
  const h = createHumanoid(G.scene, 0x8a2a2a, 0x22242a);
  const x = G.player.pos.x + 6, z = G.player.pos.z;
  h.mesh.position.set(x, 0, z);
  const e = {
    mesh: h.mesh, humanoid: h, pos: new THREE.Vector3(x, 0, z),
    health: 50, maxHealth: 50, speed: 0, hostile: true, dead: false, shootCd: 99, phase: 0,
  };
  G.peds.push(e);
  G.missions.enemies.push(e);
  return e;
}

// --- camera ---
function updateCamera(dt) {
  if (G.shotCamera) return; // fixed shot camera
  const p = G.player;
  const anchor = p.inCar ? p.inCar.pos : p.pos;
  const headY = p.inCar ? 2.2 : 1.6;
  // while driving, the camera settles behind the car
  if (p.inCar) {
    let dh = p.inCar.heading - (G.camYaw + Math.PI);
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    G.camYaw += dh * Math.min(1, dt * 2.2);
  }
  const dist = p.inCar ? 9.5 : 7;
  const cx = anchor.x + Math.sin(G.camYaw) * Math.cos(G.camPitch) * dist;
  const cy = anchor.y + headY - Math.sin(G.camPitch) * dist;
  const cz = anchor.z + Math.cos(G.camYaw) * Math.cos(G.camPitch) * dist;
  G.camera.position.set(cx, Math.max(1.2, cy), cz);
  G.camera.lookAt(anchor.x, anchor.y + headY, anchor.z);
}

// --- input ---
const keys = {};
const input = { f: false, b: false, l: false, r: false, run: false, jump: false, handbrake: false };
function readInput() {
  input.f = keys['KeyW'] || keys['ArrowUp'];
  input.b = keys['KeyS'] || keys['ArrowDown'];
  input.l = keys['KeyA'] || keys['ArrowLeft'];
  input.r = keys['KeyD'] || keys['ArrowRight'];
  input.run = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
  input.jump = !!keys['Space'];
  input.handbrake = !!keys['Space'];
}
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (!G.started || G.over) return;
  if (e.code === 'KeyE') { if (G.player.inCar) exitCar(); else { const c = nearestCar(G, G.player.pos, 4.5); if (c) enterCarAt(c); } }
  if (e.code === 'KeyF') tryPunch();
  if (e.code === 'KeyG') tryShoot();
  if (e.code === 'KeyR' && G.player.ammo < G.player.ammoMax) {
    G.player.ammo = G.player.ammoMax; G.player.reloadT = 0.6; G.audio.reload();
    G.hud.message('Reloaded');
  }
  if (e.code === 'KeyM') { const on = G.audio.toggleMusic(); G.hud.message(on ? 'Music on' : 'Music off'); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('mousedown', (e) => {
  if (!G.started || G.over) return;
  if (e.button === 0) tryPunch();
  if (e.button === 2) tryShoot();
});
addEventListener('contextmenu', (e) => e.preventDefault());
const canvas = document.getElementById('game');
canvas.addEventListener('click', () => {
  if (G.started && !G.shotMode && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  G.camYaw -= e.movementX * 0.0028;
  G.camPitch = clamp(G.camPitch + e.movementY * 0.0022, -0.9, 0.55);
});
addEventListener('resize', () => {
  G.camera.aspect = innerWidth / innerHeight;
  G.camera.updateProjectionMatrix();
  G.renderer.setSize(innerWidth, innerHeight);
});

// --- save / load ---
function saveGame() {
  try {
    localStorage.setItem('vicebay-save', JSON.stringify({
      money: G.player.money,
      mission: G.missions.index,
      pos: [G.player.pos.x, G.player.pos.z],
      health: G.player.health,
    }));
  } catch {}
}
function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem('vicebay-save') || 'null');
    if (!s) return false;
    G.player.money = s.money ?? 250;
    G.player.health = s.health ?? 100;
    G.player.pos.set(s.pos?.[0] ?? 0, 0, s.pos?.[1] ?? 54);
    startMission(G, Math.min(s.mission ?? 0, 3));
    return true;
  } catch { return false; }
}
setInterval(() => { if (G.started && !G.over) saveGame(); }, 30000);

// --- start ---
function startGame() {
  G.started = true;
  G.hud.hideStart();
  G.hud.el.style.display = 'block';
  G.audio.unlock();
}

document.getElementById('btn-new').addEventListener('click', () => {
  try { localStorage.removeItem('vicebay-save'); } catch {}
  resetWorld(1);
  startGame();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  resetWorld(1);
  loadGame();
  startGame();
});
document.getElementById('btn-respawn').addEventListener('click', () => respawn(G));
document.getElementById('btn-story').addEventListener('click', () => {
  document.getElementById('story-complete').style.display = 'none';
});

// --- main update ---
function update(dt, inp) {
  const useInput = inp || input;
  G.time += dt;
  const p = G.player;
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  if (p.reloadT > 0) p.reloadT -= dt;
  if (p.inCar) updateDriving(G, dt, useInput);
  else updatePlayerOnFoot(G, dt, useInput);
  updateTraffic(G, dt);
  updatePedestrians(G, dt);
  updatePolice(G, dt);
  updateWanted(G, dt);
  updateMissions(G, dt);
  updateEnemies(G, dt);
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t += dt;
    tracers[i].line.material.opacity = Math.max(0, 0.95 - tracers[i].t * 12);
    if (tracers[i].t > 0.09) {
      G.scene.remove(tracers[i].line);
      tracers.splice(i, 1);
    }
  }
  G.audio.setEngine(p.inCar ? p.inCar.speed : 0, !!p.inCar);
  updateCamera(dt);
  updateHud(G);
}

// --- boot ---
// In shot/selftest mode the staging code resets the world itself; resetting here too
// would double every mission message in the feed.
if (!SHOT && !SELFTEST) resetWorld(SEED);
G.hud.el.style.display = 'none'; // hidden until New Game / Continue
if (document.getElementById('btn-continue')) {
  document.getElementById('btn-continue').style.display = localStorage.getItem('vicebay-save') ? 'inline-block' : 'none';
}

if (SHOT) {
  // Deterministic screenshot: stage, render once, stop.
  const info = stageShot(G, SHOT);
  if (SHOT === 'start') { shotCamera(G); }
  else { updateCamera(0.016); }
  updateHud(G);
  G.renderer.render(G.scene, G.camera);
  document.title = `SHOT READY ${SHOT}`;
  console.log(`SHOT READY ${SHOT}`);
} else if (SELFTEST) {
  G.renderer.render(G.scene, G.camera);
  setTimeout(() => {
    const ok = runSelfTest(G);
    G.renderer.render(G.scene, G.camera);
    console.log(ok ? 'SELFTEST DONE PASS' : 'SELFTEST DONE FAIL');
  }, 300);
} else {
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G.started && !G.over) { readInput(); update(dt, input); }
    else if (G.started && G.over) { updateCamera(dt); updateHud(G); }
    else { // title screen: slow orbit over the city
      G.camYaw += dt * 0.03;
      const cx = Math.sin(G.camYaw) * 120, cz = Math.cos(G.camYaw) * 120;
      G.camera.position.set(cx, 55, cz);
      G.camera.lookAt(60, 6, 0);
    }
    G.renderer.render(G.scene, G.camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
