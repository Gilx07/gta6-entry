// Shared helpers: seeded RNG, math, canvas textures, circle-vs-building collision.
// No Math.random anywhere in world generation: the same seed always builds the same city.
import * as THREE from './three.module.min.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// A building facade: base colour, window grid, some windows lit warm for sunset.
export function facadeTexture(rng, base, litRatio) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
    for (let y = 12; y < h - 8; y += 22) {
      for (let x = 10; x < w - 12; x += 22) {
        const lit = rng() < litRatio;
        ctx.fillStyle = lit ? '#ffd27a' : (rng() < 0.5 ? '#2c3444' : '#3a4a63');
        ctx.fillRect(x, y, 13, 14);
        if (lit) { ctx.fillStyle = 'rgba(255,210,122,0.25)'; ctx.fillRect(x - 2, y - 2, 17, 18); }
      }
    }
  });
}

// Ground: asphalt, sidewalk slabs per block, dashed centre lines, crosswalks.
export function groundTexture(blockCenters, roadLines) {
  const S = 380; // world span the texture covers (-190..190)
  const px = (v) => ((v + S / 2) / S) * 1024;
  return canvasTexture(1024, 1024, (ctx) => {
    ctx.fillStyle = '#26282e'; ctx.fillRect(0, 0, 1024, 1024);
    // subtle asphalt noise
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
    }
    // sidewalk slabs (light) per block
    for (const [bx, bz] of blockCenters) {
      ctx.fillStyle = '#7d828c';
      ctx.fillRect(px(bx - 12), px(bz - 12), px(24) - px(0), px(24) - px(0));
      ctx.fillStyle = '#868b95';
      ctx.fillRect(px(bx - 11), px(bz - 11), px(22) - px(0), px(22) - px(0));
    }
    // dashed yellow centre lines on every road
    ctx.fillStyle = '#d8b13a';
    for (const l of roadLines) {
      for (let d = -180; d < 180; d += 12) {
        ctx.fillRect(px(d), px(l - 0.5), px(6) - px(0), px(1) - px(0));
        ctx.fillRect(px(l - 0.5), px(d), px(1) - px(0), px(6) - px(0));
      }
    }
    // crosswalks at intersections
    ctx.fillStyle = 'rgba(240,240,235,0.85)';
    for (const lx of roadLines) for (const lz of roadLines) {
      for (let s = -5; s <= 5; s += 2.5) {
        ctx.fillRect(px(lx + s - 0.8), px(lz - 6.5), px(1.6) - px(0), px(3) - px(0));
        ctx.fillRect(px(lx - 6.5), px(lz + s - 0.8), px(3) - px(0), px(1.6) - px(0));
      }
    }
  });
}

// Sunset sky gradient with a low sun disc, used as scene.background.
export function skyTexture() {
  return canvasTexture(64, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#241b4d');
    g.addColorStop(0.42, '#6b3a6e');
    g.addColorStop(0.62, '#e2603f');
    g.addColorStop(0.78, '#ffb347');
    g.addColorStop(1, '#ffcf8a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.arc(w * 0.3, h * 0.74, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,243,196,0.35)';
    ctx.beginPath(); ctx.arc(w * 0.3, h * 0.74, 38, 0, TAU); ctx.fill();
  });
}

// Push a circle (x,z,r) out of every building AABB; returns true when it hit something.
export function collideBuildings(p, r, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    const cx = clamp(p.x, b.minX, b.maxX);
    const cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = p.x - b.minX, pr = b.maxX - p.x, pt = p.z - b.minZ, pb = b.maxZ - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = b.minX - r; else if (m === pr) p.x = b.maxX + r;
        else if (m === pt) p.z = b.minZ - r; else p.z = b.maxZ + r;
      }
    }
  }
  return hit;
}

export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
