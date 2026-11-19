// The player on foot: low-poly humanoid, WASD relative to camera, run, jump, punch/shoot.
import * as THREE from './three.module.min.js';
import { clamp, collideBuildings } from './util.js';

const SKIN = 0xd9a066, SHIRT = 0x2e8a6b, PANTS = 0x2a3550;

export function createPlayer(scene) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), mat(PANTS));
  const legR = legL.clone();
  legL.position.set(-0.14, 0.28, 0); legR.position.set(0.14, 0.28, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.34), mat(SHIRT));
  torso.position.y = 0.86;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), mat(SKIN));
  head.position.y = 1.35;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), mat(SHIRT));
  const armR = armL.clone();
  armL.position.set(-0.4, 0.86, 0); armR.position.set(0.4, 0.86, 0);
  g.add(legL, legR, torso, head, armL, armR);
  scene.add(g);
  return {
    mesh: g, legL, legR, armL, armR,
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0, vy: 0, onGround: true,
    health: 100, money: 250, ammo: 12, ammoMax: 12,
    inCar: null, speed: 0, walkPhase: 0,
    punchCd: 0, shootCd: 0, reloadT: 0,
  };
}

// Humanoid factory shared by pedestrians, police and enemies (different colours).
export function createHumanoid(scene, shirt, pants) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.22), mat(pants));
  const legR = legL.clone();
  legL.position.set(-0.13, 0.25, 0); legR.position.set(0.13, 0.25, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.32), mat(shirt));
  torso.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.3), mat(SKIN));
  head.position.y = 1.26;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.16), mat(shirt));
  const armR = armL.clone();
  armL.position.set(-0.37, 0.8, 0); armR.position.set(0.37, 0.8, 0);
  g.add(legL, legR, torso, head, armL, armR);
  // health bar: red back + green front, billboarded in the update loop
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.09, 0.02), new THREE.MeshBasicMaterial({ color: 0x881111 }));
  const barFg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.09, 0.02), new THREE.MeshBasicMaterial({ color: 0x33dd44 }));
  barBg.position.y = 1.65; barFg.position.y = 1.65; barFg.position.z = 0.012;
  barBg.visible = false; barFg.visible = false;
  g.add(barBg, barFg);
  scene.add(g);
  return { mesh: g, legL, legR, armL, armR, barBg, barFg, phase: Math.random() * 6 };
}

export function setHealthBar(h, hp, max) {
  const show = hp < max && hp > 0;
  h.barBg.visible = show; h.barFg.visible = show;
  if (show) {
    const f = clamp(hp / max, 0, 1);
    h.barFg.scale.x = f;
    h.barFg.position.x = -0.35 * (1 - f);
  }
}

// On-foot movement. `input` = {f,b,l,r,run,jump}, camYaw = camera orbit yaw.
export function updatePlayerOnFoot(G, dt, input) {
  const p = G.player;
  const walk = input.run ? 8.5 : 4.6;
  let mx = 0, mz = 0;
  if (input.f) { mx -= Math.sin(G.camYaw); mz -= Math.cos(G.camYaw); }
  if (input.b) { mx += Math.sin(G.camYaw); mz += Math.cos(G.camYaw); }
  if (input.l) { mx -= Math.cos(G.camYaw); mz += Math.sin(G.camYaw); }
  if (input.r) { mx += Math.cos(G.camYaw); mz -= Math.sin(G.camYaw); }
  const len = Math.hypot(mx, mz);
  if (len > 0.01) {
    mx /= len; mz /= len;
    p.pos.x += mx * walk * dt;
    p.pos.z += mz * walk * dt;
    p.yaw = Math.atan2(mx, mz);
    p.speed = walk;
    p.walkPhase += dt * (input.run ? 13 : 9);
  } else {
    p.speed = 0;
  }
  // keep inside the world
  p.pos.x = clamp(p.pos.x, -178, 640);
  p.pos.z = clamp(p.pos.z, -340, 340);
  collideBuildings(p.pos, 0.5, G.city.colliders);
  // gravity / jump
  if (input.jump && p.onGround) { p.vy = 6.5; p.onGround = false; }
  if (!p.onGround) {
    p.vy -= 18 * dt;
    p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.onGround = true; }
  }
  // animate limbs
  const s = Math.sin(p.walkPhase);
  p.legL.rotation.x = s * 0.7 * (p.speed > 0 ? 1 : 0);
  p.legR.rotation.x = -s * 0.7 * (p.speed > 0 ? 1 : 0);
  p.armL.rotation.x = -s * 0.5 * (p.speed > 0 ? 1 : 0);
  p.armR.rotation.x = s * 0.5 * (p.speed > 0 ? 1 : 0);
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.yaw;
}
