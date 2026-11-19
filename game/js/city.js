// Vice Bay: a 10x10 block coastal city at sunset. Grid pitch 36, blocks 24 wide, roads
// 12 wide centred on multiples of 36. Beach + sea to the east, a wooden dock for M4.
import * as THREE from './three.module.min.js';
import { facadeTexture, groundTexture, skyTexture, mulberry32 } from './util.js';

export const PITCH = 36, BLOCK = 24, HALF = 180;
export const ROAD_LINES = [];
for (let k = -5; k <= 5; k++) ROAD_LINES.push(k * 36);
export const BLOCK_CENTERS = [];
for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) BLOCK_CENTERS.push([(i - 4.5) * 36, (j - 4.5) * 36]);

const PALETTE = ['#5a6b8a', '#7a5a6b', '#4a6b5a', '#8a6a4a', '#6b5a8a', '#3a4a6b', '#8a4a4a', '#5a7a8a'];

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xc97a4e, 140, 620);
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x33262e, 0.95);
  const sun = new THREE.DirectionalLight(0xffb36b, 1.6);
  sun.position.set(-220, 90, 60);
  scene.add(hemi, sun);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(380, 380),
    new THREE.MeshLambertMaterial({ map: groundTexture(BLOCK_CENTERS, ROAD_LINES) }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // sand + sea (east of x=180)
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 460),
    new THREE.MeshLambertMaterial({ color: 0xd9c08a }),
  );
  sand.rotation.x = -Math.PI / 2; sand.position.set(210, 0.02, 0);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 700),
    new THREE.MeshLambertMaterial({ color: 0x1e5f8a }),
  );
  sea.rotation.x = -Math.PI / 2; sea.position.set(450, 0.0, 0);
  group.add(sand, sea);

  // buildings: 1-3 per block on a 2x2 lot split, shared unit box geometry
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const facades = PALETTE.slice(0, 4).map((c) => facadeTexture(rng, c, 0.35));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  for (const [bx, bz] of BLOCK_CENTERS) {
    // the dock block stays open (east edge, z ~ 90)
    if (bx > 150 && bz > 60 && bz < 130) continue;
    const lots = [[-6, -6], [6, -6], [-6, 6], [6, 6]];
    for (const [ox, oz] of lots) {
      if (rng() < 0.35) continue; // empty lot: plaza / parking
      const w = 8 + rng() * 3.5, d = 8 + rng() * 3.5;
      const h = 8 + Math.pow(rng(), 1.6) * 34; // taller near the centre
      const mat = new THREE.MeshLambertMaterial({ map: facades[Math.floor(rng() * facades.length)] });
      const b = new THREE.Mesh(unitBox, mat);
      b.scale.set(w, h, d);
      b.position.set(bx + ox, h / 2, bz + oz);
      group.add(b);
      const roof = new THREE.Mesh(unitBox, roofMat);
      roof.scale.set(w + 0.3, 0.5, d + 0.3);
      roof.position.set(bx + ox, h + 0.25, bz + oz);
      group.add(roof);
      colliders.push({ minX: bx + ox - w / 2, maxX: bx + ox + w / 2, minZ: bz + oz - d / 2, maxZ: bz + oz + d / 2 });
    }
  }

  // palm trees along sidewalks
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5.5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const crownGeo = new THREE.IcosahedronGeometry(2.1, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
  for (let i = 0; i < 46; i++) {
    const bx = BLOCK_CENTERS[Math.floor(rng() * BLOCK_CENTERS.length)];
    const px = bx[0] + (rng() < 0.5 ? -11 : 11) + (rng() - 0.5) * 3;
    const pz = bx[1] + (rng() - 0.5) * 20;
    if (px > 178) continue;
    const t = new THREE.Mesh(trunkGeo, trunkMat);
    t.position.set(px, 2.75, pz);
    const c = new THREE.Mesh(crownGeo, crownMat);
    c.scale.set(1, 0.55, 1);
    c.position.set(px, 6.1, pz);
    group.add(t, c);
  }

  // street lamps
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const bulbGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (const l of ROAD_LINES) {
    if (l === 180 || l === -180) continue;
    for (let d = -144; d <= 144; d += 72) {
      const p = new THREE.Mesh(poleGeo, poleMat);
      p.position.set(l + 5.5, 3, d);
      const b = new THREE.Mesh(bulbGeo, bulbMat);
      b.position.set(l + 5.5, 6.1, d);
      group.add(p, b);
    }
  }

  // wooden dock at the east beach (M4 ambush site), planks + posts + crates
  const dock = new THREE.Group();
  const plankMatA = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
  const plankMatB = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  let pi = 0;
  for (let x = 182; x < 262; x += 4) {
    for (let z = 78; z < 118; z += 4) {
      const p = new THREE.Mesh(unitBox, (pi++ % 2 === 0) ? plankMatA : plankMatB);
      p.scale.set(3.8, 0.4, 3.8);
      p.position.set(x, 0.6, z);
      dock.add(p);
    }
  }
  // crates and barrels for cover on the dock
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a3a });
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0x3a5a7a });
  for (const [x, z, s] of [[205, 84, 2.2], [212, 88, 1.6], [235, 110, 2.6], [245, 86, 1.8], [220, 112, 2.0]]) {
    const crate = new THREE.Mesh(unitBox, crateMat);
    crate.scale.set(s, s, s);
    crate.position.set(x, 0.8 + s / 2, z);
    crate.rotation.y = 0.4;
    dock.add(crate);
  }
  const barrelGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.8, 10);
  for (const [x, z] of [[208, 108], [250, 104], [228, 82]]) {
    const b = new THREE.Mesh(barrelGeo, barrelMat);
    b.position.set(x, 1.5, z);
    dock.add(b);
  }
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.2, 6);
  for (const [x, z] of [[186, 80], [186, 116], [258, 80], [258, 116], [222, 80], [222, 116]]) {
    const post = new THREE.Mesh(postGeo, trunkMat);
    post.position.set(x, 0.4, z);
    dock.add(post);
  }
  group.add(dock);

  // hospital (respawn) and police HQ markers: simple distinct blocks
  const hosp = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xdde4ea }));
  hosp.scale.set(14, 12, 10); hosp.position.set(-150, 6, -150);
  group.add(hosp);
  colliders.push({ minX: -157, maxX: -143, minZ: -155, maxZ: -145 });

  return {
    colliders,
    dockPos: new THREE.Vector3(240, 0, 98),
    hospitalPos: new THREE.Vector3(-138, 0, -138),
    beachX: 180,
  };
}
