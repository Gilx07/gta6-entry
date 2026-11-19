// DOM HUD: health, money, wanted stars, objective, timer, speed, minimap, feed,
// crosshair, start screen and WASTED/BUSTED/story-complete overlays.
import { BLOCK_CENTERS } from './city.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const hud = {
    el: $('hud'),
    healthFill: $('health-fill'), healthText: $('health-text'),
    moneyEl: $('money'), starsEl: $('stars'),
    objectiveEl: $('objective'), timerEl: $('timer'),
    speedEl: $('speed'), feedEl: $('feed'),
    crosshair: $('crosshair'), helpEl: $('help'),
    minimap: $('minimap'), mmCtx: $('minimap').getContext('2d'),
    overEl: $('over'), overTitle: $('over-title'), overText: $('over-text'),
    startEl: $('start-screen'), storyEl: $('story-complete'),
    msgCount: 0,
    message(text) {
      const d = document.createElement('div');
      d.className = 'feed-msg';
      d.textContent = text;
      this.feedEl.prepend(d);
      while (this.feedEl.children.length > 5) this.feedEl.removeChild(this.feedEl.lastChild);
      setTimeout(() => { d.style.opacity = '0'; }, 4200);
      setTimeout(() => { d.remove(); }, 5000);
    },
    setObjective(text) { this.objectiveEl.textContent = text; },
    setTimer(t) {
      if (t > 0) { this.timerEl.textContent = `⏱ ${Math.ceil(t)}s`; this.timerEl.style.display = 'block'; }
      else this.timerEl.style.display = 'none';
    },
    showOver(title, text) {
      this.overTitle.textContent = title;
      this.overText.textContent = text;
      this.overEl.style.display = 'flex';
    },
    hideOver() { this.overEl.style.display = 'none'; },
    showStoryComplete() { this.storyEl.style.display = 'flex'; },
    hideStart() { this.startEl.style.display = 'none'; },
    showStart() { this.startEl.style.display = 'flex'; },
  };
  return hud;
}

export function updateHud(G) {
  const p = G.player;
  const hp = Math.max(0, Math.round(p.health));
  const h = G.hud;
  h.healthFill.style.width = `${hp}%`;
    h.healthFill.style.background = hp > 50 ? '#37c24a' : hp > 25 ? '#e0a52e' : '#d23b2e';
    h.healthText.textContent = `${hp}`;
    h.moneyEl.textContent = `$${p.money}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
    h.starsEl.textContent = stars;
    h.starsEl.style.color = G.wanted > 0 ? '#ffd23a' : '#888';
    h.speedEl.textContent = p.inCar ? `${Math.round(Math.abs(p.inCar.speed) * 3.6)} km/h` : '';
    h.speedEl.style.display = p.inCar ? 'block' : 'none';
    h.crosshair.style.display = G.started && !G.over ? 'block' : 'none';
    h.helpEl.textContent = p.inCar
      ? 'WASD drive · Space handbrake · E exit car'
      : 'WASD move · Shift run · Space jump · E enter car · F punch · Right-click/G shoot · R reload';
  drawMinimap(G);
}

function drawMinimap(G) {
  const ctx = G.hud.mmCtx;
  const S = 160, W = 400; // world -200..200 maps to the canvas
  const px = (v) => ((v + W / 2) / W) * S;
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, S, S);
  // sea + sand
  ctx.fillStyle = '#1e5f8a';
  ctx.fillRect(px(180), 0, S - px(180), S);
  ctx.fillStyle = '#d9c08a';
  ctx.fillRect(px(178), 0, px(182) - px(178), S);
  // roads
  ctx.fillStyle = '#3a3d44';
  for (let k = -5; k <= 5; k++) {
    ctx.fillRect(0, px(k * 36 - 6), S, px(12) - px(0));
    ctx.fillRect(px(k * 36 - 6), 0, px(12) - px(0), S);
  }
  // blocks
  ctx.fillStyle = '#565b66';
  for (const [bx, bz] of BLOCK_CENTERS) {
    ctx.fillRect(px(bx - 11), px(bz - 11), px(22) - px(0), px(22) - px(0));
  }
  // mission marker
  const M = G.missions;
  if (M && M.marker.visible) {
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath(); ctx.arc(px(M.markerPos.x), px(M.markerPos.z), 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(M.markerPos.x), px(M.markerPos.z), 8, 0, Math.PI * 2); ctx.stroke();
  }
  // cars (grey dots), police (blue)
  for (const c of G.cars) {
    ctx.fillStyle = c.isPolice ? '#4a8cff' : '#c8ccd4';
    ctx.fillRect(px(c.pos.x) - 1.5, px(c.pos.z) - 1.5, 3, 3);
  }
  // foot police (red)
  for (const p of G.policeFoot) {
    if (p.dead) continue;
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(px(p.pos.x), px(p.pos.z), 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // player arrow
  const p = G.player;
  ctx.save();
  ctx.translate(px(p.pos.x), px(p.pos.z));
  ctx.rotate(Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw)) + Math.PI);
  ctx.fillStyle = '#37e05a';
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
