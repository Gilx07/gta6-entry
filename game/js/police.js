// Wanted stars 0-5 and the police response: pursuit cars that ram and block, foot
// officers from wanted 2, BUSTED / WASTED outcomes, and the 20-second cooldown.
import * as THREE from './three.module.min.js';
import { clamp, lerp, mulberry32, dist2 } from './util.js';
import { makeCar, nearestCar } from './vehicles.js';
import { createHumanoid, setHealthBar } from './player.js';

export function addCrime(G, stars, label) {
  G.wanted = clamp(G.wanted + stars, 0, 5);
  G.lastCrimeTime = G.time;
  G.hud.message(`${label} — Wanted ${G.wanted}★`);
  if (G.wanted >= 1) G.audio.sirenOn();
}

export function updateWanted(G, dt) {
  if (G.wanted === 0) return;
  const nearPolice = G.policeCars.some((c) => dist2(c.pos.x, c.pos.z, G.player.pos.x, G.player.pos.z) < 60 * 60)
    || G.policeFoot.some((p) => !p.dead && dist2(p.pos.x, p.pos.z, G.player.pos.x, G.player.pos.z) < 40 * 40);
  if (G.time - G.lastCrimeTime > 20 && !nearPolice) {
    G.wanted = 0;
    G.hud.message('You lost the heat.');
    G.audio.sirenOff();
    clearPolice(G);
  }
}

function clearPolice(G) {
  for (const c of G.policeCars) { G.scene.remove(c.mesh); G.cars.splice(G.cars.indexOf(c), 1); }
  for (const p of G.policeFoot) { G.scene.remove(p.mesh); G.peds.splice(G.peds.indexOf(p), 1); }
  G.policeCars = []; G.policeFoot = [];
}

function spawnPoliceCar(G) {
  const rng = mulberry32((G.time * 1000) | 0 + G.policeCars.length * 31 + 7);
  const edge = [
    [-170, -170], [170, -170], [-170, 170], [170, 170], [0, -175], [0, 175],
  ][Math.floor(rng() * 6)];
  const car = makeCar(G, edge[0], edge[1], 0, true, 0);
  car.ai = false;
  G.cars.push(car);
  G.policeCars.push(car);
  return car;
}

function spawnFootOfficer(G) {
  const a = Math.random() * Math.PI * 2;
  const x = G.player.pos.x + Math.cos(a) * 14, z = G.player.pos.z + Math.sin(a) * 14;
  const h = createHumanoid(G.scene, 0x1a2a4a, 0x1a2a4a);
  h.mesh.position.set(x, 0, z);
  const ped = {
    mesh: h.mesh, humanoid: h, pos: new THREE.Vector3(x, 0, z),
    health: 60, maxHealth: 60, speed: 5.2, isPolice: true, hostile: true,
    dead: false, phase: 0, damageCd: 0,
  };
  G.peds.push(ped);
  G.policeFoot.push(ped);
  return ped;
}

export function updatePolice(G, dt) {
  const wantCars = Math.min(G.wanted, 3);
  while (G.policeCars.length < wantCars) spawnPoliceCar(G);
  while (G.policeCars.length > wantCars && G.policeCars.length > 0) {
    const c = G.policeCars.pop();
    G.scene.remove(c.mesh);
    const i = G.cars.indexOf(c); if (i >= 0) G.cars.splice(i, 1);
  }
  const wantFoot = G.wanted >= 2 ? Math.min(G.wanted - 1, 3) : 0;
  while (G.policeFoot.length < wantFoot) spawnFootOfficer(G);

  // pursuit cars: steer at the player, ram, and try to block
  for (const car of G.policeCars) {
    const dx = G.player.pos.x - car.pos.x, dz = G.player.pos.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    car.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
    const targetSpeed = dist > 30 ? 25 : 19;
    car.speed = lerp(car.speed, targetSpeed, dt);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    car.lightPhase += dt * 6;
    const on = Math.sin(car.lightPhase) > 0;
    if (car.mesh.userData.lightR) {
      car.mesh.userData.lightR.visible = on;
      car.mesh.userData.lightB.visible = !on;
    }
    // ram the player's car or the player on foot
    if (dist < 3.4) {
      if (G.player.inCar) {
        const pc = G.player.inCar;
        pc.speed *= 0.85;
        pc.damage += 12 * dt;
        if (pc.damage >= 100) { pc.speed = 0; pc.damage = 100; }
        G.player.pos.copy(pc.pos);
      } else {
        G.hurtPlayer(18 * dt, 'police');
      }
      // slow surround -> BUSTED when the player is nearly stopped on foot
      if (!G.player.inCar && G.player.health < 30) G.busted('Surrounded by police');
    }
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
  }

  // foot officers run at the player and hit on contact
  for (const p of [...G.policeFoot]) {
    if (p.dead) continue;
    const dx = G.player.pos.x - p.pos.x, dz = G.player.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    const sp = p.speed * dt;
    if (dist > 0.1) { p.pos.x += (dx / dist) * sp; p.pos.z += (dz / dist) * sp; }
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = Math.atan2(dx, dz);
    p.phase += dt * 10;
    p.humanoid.legL.rotation.x = Math.sin(p.phase) * 0.8;
    p.humanoid.legR.rotation.x = -Math.sin(p.phase) * 0.8;
    if (dist < 1.3) {
      p.damageCd -= dt;
      if (p.damageCd <= 0) { G.hurtPlayer(9, 'police'); p.damageCd = 0.9; }
      if (G.player.health < 30) G.busted('Caught by the police');
    }
  }
}

export function hurtPlayer(G, dmg, src) {
  if (G.player.health <= 0) return;
  G.player.health = Math.max(0, G.player.health - dmg);
  if (G.player.health <= 0) G.wasted('WASTED');
}

export function busted(G, reason) {
  if (G.over) return;
  G.over = 'busted';
  G.hud.showOver('BUSTED', reason);
  G.audio.sirenOff();
}

export function wasted(G, reason) {
  if (G.over) return;
  G.over = 'wasted';
  G.hud.showOver('WASTED', reason);
  G.audio.sirenOff();
}

// Respawn after BUSTED/WASTED: hospital, fine, wanted cleared, health restored.
export function respawn(G) {
  const fine = Math.min(G.player.money, 150);
  G.player.money -= fine;
  G.player.health = 100;
  G.wanted = 0;
  G.over = null;
  G.audio.sirenOff();
  clearPolice(G);
  if (G.player.inCar) { G.player.inCar.occupied = false; G.player.inCar = null; }
  G.player.pos.copy(G.city.hospitalPos);
  G.player.pos.x += 4; G.player.pos.z += 4;
  G.player.mesh.position.copy(G.player.pos);
  G.hud.message(`Released. Fine paid: $${fine}.`);
  G.hud.hideOver();
}
