// The story: 4 chained missions with a yellow marker, a 3D beacon and a HUD objective.
// M1 The Pickup, M2 Lose the Heat, M3 The Drop (90s), M4 The Ambush at the dock.
import * as THREE from './three.module.min.js';
import { createHumanoid, setHealthBar } from './player.js';
import { mulberry32 } from './util.js';

export const MISSIONS = [
  { name: 'The Pickup', reward: 500, text: 'Pick up the package at the yellow marker' },
  { name: 'Lose the Heat', reward: 400, text: 'Get to 2 stars, then lose the cops' },
  { name: 'The Drop', reward: 800, text: 'Deliver the package across town — 90 seconds' },
  { name: 'The Ambush', reward: 1200, text: 'Clear the dock: take out 5 rivals, then run' },
];

export function createMissions(G) {
  const geo = new THREE.CylinderGeometry(2.2, 2.2, 0.25, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.75 });
  const marker = new THREE.Mesh(geo, mat);
  marker.position.y = 0.15;
  G.scene.add(marker);
  const beamGeo = new THREE.CylinderGeometry(0.5, 0.9, 30, 10, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 15;
  G.scene.add(beam);
  return {
    index: 0, phase: 'go', timer: 0, marker, beam,
    markerPos: new THREE.Vector3(0, 0, 0),
    m2SawHeat: false, enemies: [], enemiesLeft: 0,
    done: false,
  };
}

function missionTarget(G) {
  const i = G.missions.index;
  if (i === 0) return new THREE.Vector3(120, 0, -90);      // pickup, east side
  if (i === 1) return null;                                  // no fixed point: heat
  if (i === 2) return new THREE.Vector3(-140, 0, 130);       // drop, far south-west
  return G.city.dockPos.clone();                             // dock
}

function placeMarker(G) {
  const t = missionTarget(G);
  if (t) {
    G.missions.markerPos.copy(t);
    G.missions.marker.visible = true;
    G.missions.beam.visible = true;
    G.missions.marker.position.set(t.x, 0.15, t.z);
    G.missions.beam.position.set(t.x, 15, t.z);
  } else {
    G.missions.marker.visible = false;
    G.missions.beam.visible = false;
  }
}

export function startMission(G, i) {
  G.missions.index = i;
  G.missions.phase = 'go';
  G.missions.timer = i === 2 ? 90 : 0;
  G.missions.m2SawHeat = false;
  placeMarker(G);
  G.hud.setObjective(`${MISSIONS[i].name}: ${MISSIONS[i].text}`);
  G.hud.message(`Mission: ${MISSIONS[i].name}`);
}

export function completeMission(G) {
  const m = MISSIONS[G.missions.index];
  G.player.money += m.reward;
  G.audio.jingle();
  G.hud.message(`Mission complete +$${m.reward}`);
  G.save();
  if (G.missions.index >= MISSIONS.length - 1) {
    G.missions.done = true;
    G.hud.setObjective('Story complete — Vice Bay is yours');
    G.hud.showStoryComplete();
    return;
  }
  startMission(G, G.missions.index + 1);
}

export function spawnAmbush(G) {
  const rng = mulberry32(G.seed + 4242);
  G.missions.enemies = [];
  const shirts = [0x8a2a2a, 0x2a2a8a, 0x8a6a2a, 0x4a2a6b, 0x2a6b4a];
  for (let i = 0; i < 5; i++) {
    const x = 200 + rng() * 55, z = 82 + rng() * 30;
    const h = createHumanoid(G.scene, shirts[i], 0x22242a);
    h.mesh.position.set(x, 0, z);
    const e = {
      mesh: h.mesh, humanoid: h, pos: new THREE.Vector3(x, 0, z),
      health: 50, maxHealth: 50, speed: 3.4, hostile: true, dead: false,
      shootCd: 1 + rng() * 2, phase: rng() * 6,
    };
    setHealthBar(h, 50, 50);
    G.peds.push(e);
    G.missions.enemies.push(e);
  }
  G.missions.enemiesLeft = 5;
}

export function updateMissions(G, dt) {
  const M = G.missions;
  if (M.done || G.over) return;
  const p = G.player.pos;
  // beacon pulse
  const s = 1 + Math.sin(G.time * 4) * 0.12;
  M.marker.scale.set(s, 1, s);
  M.beam.material.opacity = 0.16 + Math.sin(G.time * 4) * 0.07;

  if (M.index === 0) {
    if (p.distanceTo(M.markerPos) < 4) {
      G.audio.chime();
      G.hud.message('Package picked up');
      completeMission(G);
    }
  } else if (M.index === 1) {
    if (G.wanted >= 2) M.m2SawHeat = true;
    if (M.m2SawHeat && G.wanted === 0) {
      G.hud.message('Heat lost. Clean.');
      completeMission(G);
    }
  } else if (M.index === 2) {
    M.timer -= dt;
    G.hud.setTimer(Math.max(0, M.timer));
    if (p.distanceTo(M.markerPos) < 4) {
      G.hud.setTimer(0);
      completeMission(G);
    } else if (M.timer <= 0) {
      G.hud.message('Too slow — try the drop again');
      startMission(G, 2);
    }
  } else if (M.index === 3) {
    if (M.phase === 'go') {
      if (p.distanceTo(M.markerPos) < 12) {
        M.phase = 'fight';
        spawnAmbush(G);
        G.hud.setObjective('The Ambush: take out 5 rivals');
        G.hud.message('Ambush! 5 rivals on the dock');
        G.addCrime(1, 'Gunfire at the dock');
      }
    } else if (M.phase === 'fight') {
      const left = M.enemies.filter((e) => !e.dead).length;
      M.enemiesLeft = left;
      G.hud.setObjective(`The Ambush: ${left} rivals left`);
      if (left === 0) {
        M.phase = 'flee';
        M.markerPos.set(-160, 0, -160);
        M.marker.position.set(-160, 0.15, -160);
        M.beam.position.set(-160, 15, -160);
        M.marker.visible = true; M.beam.visible = true;
        G.hud.setObjective('The Ambush: get clear — reach the north-west corner');
        G.hud.message('Dock clear. Run!');
      }
    } else if (M.phase === 'flee') {
      if (p.distanceTo(M.markerPos) < 5) completeMission(G);
    }
  }
}

// Enemies (ambush rivals) shoot at the player when in range.
export function updateEnemies(G, dt) {
  for (const e of G.missions.enemies) {
    if (e.dead) continue;
    const dx = G.player.pos.x - e.pos.x, dz = G.player.pos.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    e.shootCd -= dt;
    if (dist < 26 && dist > 4) {
      // strafe toward the player slowly
      e.pos.x += (dx / dist) * e.speed * dt * 0.5;
      e.pos.z += (dz / dist) * e.speed * dt * 0.5;
      if (e.shootCd <= 0) {
        e.shootCd = 1.6 + Math.random() * 1.2;
        G.hurtPlayer(6, 'enemy');
        G.audio.enemyShot(e.pos);
        G.hud.message('Taking fire!');
      }
    }
    e.mesh.position.copy(e.pos);
    e.mesh.rotation.y = Math.atan2(dx, dz);
    e.phase += dt * 8;
    e.humanoid.legL.rotation.x = Math.sin(e.phase) * 0.5;
    e.humanoid.legR.rotation.x = -Math.sin(e.phase) * 0.5;
    // face the camera for the health bar
    e.humanoid.barBg.lookAt(G.camera.position);
    e.humanoid.barFg.lookAt(G.camera.position);
  }
}
