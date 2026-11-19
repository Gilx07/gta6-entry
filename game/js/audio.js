// Synthesised WebAudio only: engine hum, two-tone siren, gunshots, chimes, jingles,
// and a simple ambient bass+pad loop. No audio files. Everything starts on user gesture.
export function createAudio() {
  let ctx = null, master = null;
  let engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null, sirenTimer = null;
  let musicTimer = null, musicOn = false, sirenOnFlag = false;
  const state = { enabled: false, music: true };

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      state.enabled = true;
      return true;
    } catch { return false; }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  return {
    state,
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); this.startEngine(); this.startMusic(); },
    startEngine() {
      if (!ctx || engineOsc) return;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    },
    setEngine(speed, driving) {
      if (!ctx || !engineOsc) return;
      const v = driving ? 0.05 + Math.min(0.09, Math.abs(speed) * 0.003) : 0.012;
      engineGain.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 4.5, ctx.currentTime, 0.1);
    },
    sirenOn() {
      if (!ctx || sirenOnFlag) return;
      sirenOnFlag = true;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      let hi = false;
      sirenTimer = setInterval(() => {
        if (!sirenOsc) return;
        hi = !hi;
        sirenOsc.frequency.setTargetAtTime(hi ? 880 : 660, ctx.currentTime, 0.05);
      }, 420);
    },
    sirenOff() {
      sirenOnFlag = false;
      if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
      if (sirenOsc) { try { sirenOsc.stop(); } catch {} sirenOsc = null; }
    },
    shot() { noiseBurst(0.14, 0.5, 1800); tone(180, 0.08, 'square', 0.12, 0, 60); },
    enemyShot() { noiseBurst(0.1, 0.18, 1200); },
    punch() { noiseBurst(0.08, 0.3, 700); },
    hit() { noiseBurst(0.12, 0.4, 500); },
    chime() { tone(880, 0.18, 'sine', 0.25); tone(1318, 0.3, 'sine', 0.22, 0.12); },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.13));
    },
    reload() { tone(1200, 0.05, 'square', 0.12); tone(900, 0.05, 'square', 0.12, 0.09); },
    startMusic() {
      if (!ctx || musicTimer || !state.music) return;
      const bassNotes = [55, 55, 65.4, 49];
      const padChords = [[220, 277, 330], [196, 247, 294], [174, 220, 262], [196, 247, 294]];
      let step = 0;
      musicTimer = setInterval(() => {
        if (!state.music || !ctx) return;
        const b = bassNotes[step % 4];
        tone(b, 0.5, 'sine', 0.10);
        const chord = padChords[step % 4];
        for (const f of chord) tone(f, 1.8, 'sine', 0.028);
        step++;
      }, 500);
    },
    stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
    toggleMusic() {
      state.music = !state.music;
      if (state.music) this.startMusic(); else this.stopMusic();
      return state.music;
    },
  };
}
