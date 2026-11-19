// Cars: traffic AI on block loops, parked cars, player driving, police pursuit cars.
// One shared mesh factory; arcade physics; no external assets.
import * as THREE from './three.module.min.js';
import { clamp, lerp, mulberry32, collideBuildings, dist2 } from './util.js';
import { ROAD_LINES, BLOCK_CENTERS } from './city.js';

const BODY_GEO = new THREE.BoxGeometry(1.9, 0.62, 4.3);
const CABIN_GEO = new THREE.BoxGeometry(1.7, 0.55, 2.1);
const WHEEL_GEO = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
const LIGHT_GEO = new THREE.BoxGeometry(0.5, 0.18, 0.06);
const CAR_COLORS = [0xc23b2e, 0x2e6bc2, 0xe0a52e, 0x3a9e5f, 0x8a8f99, 0x20242c, 0xdde2e8, 0x7a3a9e];

let bodyMats = null;
function mats() {
  if (bodyMats) return bodyMats;
  bodyMats = {
    body: CAR_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c })),
    glass: new THREE.MeshLambertMaterial({ color: 0x18242e }),
    wheel: new THREE.MeshLambertMaterial({ color: 0x14161a }),
    policeBody: new THREE.MeshLambertMaterial({ color: 0x14181e }),
    policeDoor: new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    blue: new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
    tail: new THREE.MeshBasicMaterial({ color: 0xcc2211 }),
  };
  return bodyMats;
}

export function createCarMesh(scene, isPolice, colorIdx) {
  const m = mats();
  const g = new THREE.Group();
  const body = new THREE.Mesh(BODY_GEO, isPolice ? m.policeBody : m.body[colorIdx % m.body.length]);
  body.position.y = 0.55;
  const cabin = new THREE.Mesh(CABIN_GEO, m.glass);
  cabin.position.set(0, 1.1, -0.25);
  g.add(body, cabin);
  if (isPolice) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.4, 1.6), m.policeDoor);
    door.position.set(0, 0.55, 0.2);
    const r = new THREE.Mesh(LIGHT_GEO, m.red); r.position.set(-0.45, 1.45, -0.25);
    const b = new THREE.Mesh(LIGHT_GEO, m.blue); b.position.set(0.45, 1.45, -0.25);
    g.add(door, r, b);
    g.userData.lightR = r; g.userData.lightB = b;
  }
  const hl = new THREE.Mesh(LIGHT_GEO, m.head); hl.position.set(-0.6, 0.55, 2.16);
  const hr = hl.clone(); hr.position.x = 0.6;
  const tl = new THREE.Mesh(LIGHT_GEO, m.tail); tl.position.set(-0.6, 0.55, -2.16);
  const tr = tl.clone(); tr.position.x = 0.6;
  g.add(hl, hr, tl, tr);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(WHEEL_GEO, m.wheel);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  scene.add(g);
  return g;
}

export function makeCar(G, x, z, heading, isPolice, colorIdx) {
  const mesh = createCarMesh(G.scene, isPolice, colorIdx);
  const car = {
    mesh, pos: new THREE.Vector3(x, 0, z), heading,
    speed: 0, maxSpeed: isPolice ? 24 : 13,
    ai: !isPolice, isPolice, driver: null, // driver: humanoid or null (parked/empty)
    route: null, routeIdx: 0, steer: 0,
    occupied: false, // player inside
    damage: 0, // 0..100; police ram raises it, at 100 the car stalls
    lightPhase: 0,
  };
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return car;
}

// A rectangular loop around one block, on the road centrelines.
function blockLoop(rng) {
  const [bx, bz] = BLOCK_CENTERS[Math.floor(rng() * BLOCK_CENTERS.length)];
  const pts = [
    [bx - 18, bz - 18], [bx + 18, bz - 18], [bx + 18, bz + 18], [bx - 18, bz + 18],
  ];
  if (rng() < 0.5) pts.reverse();
  return pts;
}

export function spawnTraffic(G, n) {
  const rng = mulberry32(G.seed + 77);
  for (let i = 0; i < n; i++) {
    const route = blockLoop(rng);
    const [x, z] = route[0];
    const car = makeCar(G, x, z, 0, false, Math.floor(rng() * CAR_COLORS.length));
    car.route = route; car.routeIdx = 1;
    car.speed = 8 + rng() * 4;
    car.driver = { fleeing: false };
    G.cars.push(car);
  }
  // parked cars along road edges
  for (let i = 0; i < 14; i++) {
    const line = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
    const along = -160 + rng() * 320;
    const horiz = rng() < 0.5;
    const x = horiz ? along : line + (rng() < 0.5 ? 4.6 : -4.6);
    const z = horiz ? line + (rng() < 0.5 ? 4.6 : -4.6) : along;
    if (x > 175 || Math.abs(z) > 175) continue;
    const car = makeCar(G, x, z, horiz ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2), false, Math.floor(rng() * CAR_COLORS.length));
    car.ai = false; car.speed = 0; car.parked = true;
    G.cars.push(car);
  }
}

function carAhead(G, car, range) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let best = Infinity;
  for (const o of G.cars) {
    if (o === car || o.parked) continue;
    const dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < range && d > 0.1) {
      const along = dx * fx + dz * fz;
      if (along > 0 && along < best) best = along;
    }
  }
  return best;
}

export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (car.occupied || car.parked || !car.ai) continue;
    const target = car.route[car.routeIdx];
    const dx = target[0] - car.pos.x, dz = target[1] - car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) { car.routeIdx = (car.routeIdx + 1) % car.route.length; continue; }
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    car.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
    // slow for the car ahead
    const ahead = carAhead(G, car, 14);
    const targetSpeed = ahead < 9 ? 2.5 : car.maxSpeed;
    car.speed = lerp(car.speed, targetSpeed, dt * 1.5);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
  }
}

// Arcade driving for the car the player sits in.
export function updateDriving(G, dt, input) {
  const car = G.player.inCar;
  if (!car) return;
  const maxF = 26, maxR = 10;
  if (input.f) car.speed += 14 * dt;
  if (input.b) car.speed -= car.speed > 0.5 ? 22 * dt : 10 * dt;
  if (!input.f && !input.b) car.speed -= Math.sign(car.speed) * 6 * dt;
  if (input.handbrake) car.speed -= Math.sign(car.speed) * 20 * dt;
  car.speed = clamp(car.speed, -maxR, maxF);
  if (Math.abs(car.speed) < 0.15 && !input.f && !input.b) car.speed = 0;
  const steerTarget = (input.l ? 1 : 0) - (input.r ? 1 : 0);
  car.steer = lerp(car.steer, steerTarget, dt * 6);
  const turnRate = car.steer * (car.speed >= 0 ? 1 : -1) * clamp(Math.abs(car.speed) / 8, 0, 1) * 1.9;
  car.heading += turnRate * dt * (input.handbrake ? 1.5 : 1);
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  const before = { x: car.pos.x, z: car.pos.z };
  car.pos.x = clamp(nx, -178, 640);
  car.pos.z = clamp(nz, -340, 340);
  if (collideBuildings(car.pos, 1.6, G.city.colliders)) {
    // hit a building: scrape speed off, but keep enough to slide along the wall
    car.speed *= 0.8;
    if (Math.abs(car.speed) > 6 && G.wanted < 5) { /* property damage is free here */ }
  }
  // running over a pedestrian is a crime
  for (const ped of G.peds) {
    if (ped.dead || ped.fleeing) continue;
    if (dist2(car.pos.x, car.pos.z, ped.pos.x, ped.pos.z) < 3.2 && Math.abs(car.speed) > 4) {
      ped.dead = true; ped.mesh.visible = false;
      G.addCrime(1, 'Pedestrian hit');
      G.audio.hit();
    }
  }
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
  G.player.pos.copy(car.pos);
  G.player.yaw = car.heading;
}

export function nearestCar(G, pos, range) {
  let best = null, bd = range * range;
  for (const car of G.cars) {
    const d = dist2(pos.x, pos.z, car.pos.x, car.pos.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
