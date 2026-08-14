// Simple Web-Audio synth for SFX + crowd ambience. No external files.
let ctx = null;
let master = null;
let crowdNode = null;
let crowdGain = null;
let crowdLevel = 0.06;

const ensure = () => {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
  } catch (e) {
    ctx = null;
  }
  return ctx;
};

const resume = () => {
  const c = ensure();
  if (c && c.state === "suspended") c.resume();
};

// Unlock audio on first user interaction
if (typeof window !== "undefined") {
  const unlock = () => {
    resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

const MASTER_LEVEL = 0.6;
let sfxVolume = 1;
let muted = false;
try {
  muted = localStorage.getItem("voxelcup.muted") === "1";
} catch (e) {
  muted = false;
}

// Handle para música / SFX del flujo: {ctx, master}
export const getAudio = () => {
  const c = ensure();
  if (!c) return null;
  if (c.state === "suspended") c.resume();
  if (master) master.gain.value = muted ? 0 : MASTER_LEVEL * sfxVolume;
  return { ctx: c, master };
};

export const setSfxVolume = (v) => {
  sfxVolume = Math.max(0, Math.min(1, v));
  const c = ensure();
  if (c && master) master.gain.value = muted ? 0 : MASTER_LEVEL * sfxVolume;
  return sfxVolume;
};

export const getSfxVolume = () => sfxVolume;

export const isMuted = () => muted;

export const setMuted = (v) => {
  muted = !!v;
  try {
    localStorage.setItem("voxelcup.muted", muted ? "1" : "0");
  } catch (e) {
    /* no-op */
  }
  const c = ensure();
  if (c && master) master.gain.value = muted ? 0 : MASTER_LEVEL * sfxVolume;
  return muted;
};

const env = (g, t0, a, s, r, peak = 1) => {
  g.gain.cancelScheduledValues(t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.6), t0 + a + s);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + s + r);
};

export const sfx = {
  kick(power = 1) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(220 + 60 * power, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    env(g, t, 0.003, 0.03, 0.12, 0.4 + 0.3 * power);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.2);
    // Click
    const n = c.createBufferSource();
    const buf = c.createBuffer(1, 1024, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = buf;
    const ng = c.createGain();
    ng.gain.value = 0.3 * power;
    n.connect(ng).connect(master);
    n.start(t);
  },
  pass() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(280, t + 0.09);
    env(g, t, 0.004, 0.02, 0.1, 0.35);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.15);
  },
  tackle() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    // Whoosh + thud
    const n = c.createBufferSource();
    const buf = c.createBuffer(1, c.sampleRate * 0.25, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    n.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    const ng = c.createGain();
    ng.gain.value = 0.35;
    n.connect(bp).connect(ng).connect(master);
    n.start(t);
    // Low thud
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.22);
    env(g, t + 0.05, 0.006, 0.04, 0.16, 0.5);
    o.connect(g).connect(master);
    o.start(t + 0.05);
    o.stop(t + 0.3);
  },
  steal() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    // Arpegio ascendente celebratorio
    [660, 990, 1320].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "square";
      o.frequency.value = f;
      env(g, t + i * 0.03, 0.003, 0.02, 0.09, 0.28);
      o.connect(g).connect(master);
      o.start(t + i * 0.03);
      o.stop(t + i * 0.03 + 0.14);
    });
    // Clic seco del contacto
    const n = c.createBufferSource();
    const buf = c.createBuffer(1, 512, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    n.buffer = buf;
    const ng = c.createGain();
    ng.gain.value = 0.28;
    n.connect(ng).connect(master);
    n.start(t);
  },
  // Impacto de éxito al recuperar la pelota con la barrida
  recovery() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    // Chirp ascendente + campana
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(1600, t + 0.18);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2800;
    env(g, t, 0.003, 0.04, 0.18, 0.32);
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.28);
    // Campana clara arriba
    const bell = c.createOscillator();
    const bg = c.createGain();
    bell.type = "sine";
    bell.frequency.value = 1760;
    env(bg, t + 0.02, 0.002, 0.06, 0.22, 0.18);
    bell.connect(bg).connect(master);
    bell.start(t + 0.02);
    bell.stop(t + 0.35);
  },
  whistle() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(2400, t);
    // LFO trill
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 12;
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(o.frequency);
    env(g, t, 0.01, 0.4, 0.15, 0.35);
    o.connect(g).connect(master);
    o.start(t); lfo.start(t);
    o.stop(t + 0.6); lfo.stop(t + 0.6);
  },
  crowdRoar() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const dur = 3.2;
    const bufSize = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const k = i / bufSize;
      // Attack fast, sustained roar, slow decay
      const env2 = Math.min(1, k * 6) * Math.pow(1 - k, 0.5);
      d[i] = (Math.random() * 2 - 1) * env2;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 180;
    const g = c.createGain();
    g.gain.value = 0.55;
    src.connect(hp).connect(lp).connect(g).connect(master);
    src.start(t);
  },
  goalHorn() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    // Stadium horn: two notes
    [[220, 0], [330, 0.35], [220, 0.7], [440, 1.05]].forEach(([f, dt]) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.value = f;
      const dur = 0.32;
      env(g, t + dt, 0.02, 0.15, 0.18, 0.28);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      o.connect(lp).connect(g).connect(master);
      o.start(t + dt);
      o.stop(t + dt + dur + 0.1);
    });
  },
  goalFanfare() {
    // Little melodic fanfare
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      env(g, t + i * 0.12, 0.005, 0.08, 0.12, 0.3);
      o.connect(g).connect(master);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.25);
    });
  },
  wallHit() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    env(g, t, 0.003, 0.02, 0.14, 0.25);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.2);
  },
  emote(i) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const freqs = [660, 220, 880];
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = i === 1 ? "square" : "triangle";
    o.frequency.value = freqs[i] || 500;
    env(g, t, 0.005, 0.05, 0.15, 0.22);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.22);
  },
  // Quick sidestep / regate: airy upward whoosh
  dash() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const n = c.createBufferSource();
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.4);
    n.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.26);
    const g = c.createGain();
    g.gain.value = 0.3;
    n.connect(bp).connect(g).connect(master);
    n.start(t);
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.2);
    env(og, t, 0.005, 0.04, 0.14, 0.2);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 0.3);
  },
  // A powerup appeared on the pitch
  powerupSpawn() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      env(g, t + i * 0.1, 0.004, 0.05, 0.12, 0.16);
      o.connect(g).connect(master);
      o.start(t + i * 0.1);
      o.stop(t + i * 0.1 + 0.24);
    });
  },
  powerupGrab(good = true) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const notes = good ? [523, 659, 880, 1175] : [440, 392, 330];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "square";
      o.frequency.value = f;
      env(g, t + i * 0.07, 0.003, 0.03, 0.1, 0.17);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      o.connect(lp).connect(g).connect(master);
      o.start(t + i * 0.07);
      o.stop(t + i * 0.07 + 0.2);
    });
  },
  freeze() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1800, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.6);
    env(g, t, 0.01, 0.2, 0.4, 0.25);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.8);
  },
  shieldHit() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
    env(g, t, 0.003, 0.05, 0.2, 0.4);
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = "square";
    o2.frequency.value = 1400;
    env(g2, t, 0.002, 0.02, 0.1, 0.12);
    o.connect(g).connect(master);
    o2.connect(g2).connect(master);
    o.start(t); o2.start(t);
    o.stop(t + 0.35); o2.stop(t + 0.2);
  },
  // Ability off cooldown
  ready() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1100, t);
    o.frequency.linearRampToValueAtTime(1500, t + 0.07);
    env(g, t, 0.003, 0.02, 0.07, 0.1);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.14);
  },
  // Cuenta regresiva: beep grave que sube con cada número (3-2-1)
  countdownBeep(n = 3) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const base = n === 3 ? 440 : n === 2 ? 554 : 659;
    [1, 2].forEach((mult, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = i === 0 ? "square" : "sine";
      o.frequency.setValueAtTime(base * mult, t);
      env(g, t, 0.004, 0.06, 0.2, i === 0 ? 0.16 : 0.09);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.32);
    });
  },
  // "¡YA!" — impacto grave + acorde brillante + ruido de shockwave
  countdownGo() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const sub = c.createOscillator();
    const sg = c.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(190, t);
    sub.frequency.exponentialRampToValueAtTime(48, t + 0.34);
    env(sg, t, 0.004, 0.06, 0.4, 0.5);
    sub.connect(sg).connect(master);
    sub.start(t);
    sub.stop(t + 0.55);
    [880, 1320, 1760].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, t + i * 0.012);
      env(g, t + i * 0.012, 0.004, 0.05, 0.3, 0.12);
      o.connect(g).connect(master);
      o.start(t + i * 0.012);
      o.stop(t + 0.45);
    });
    const n = c.createBufferSource();
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.3), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    n.buffer = buf;
    const ng = c.createGain();
    ng.gain.value = 0.22;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2200;
    n.connect(bp).connect(ng).connect(master);
    n.start(t);
  },
  ui() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = 620;
    env(g, t, 0.002, 0.01, 0.05, 0.09);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.09);
  },
  post() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(760, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.4);
    env(g, t, 0.002, 0.05, 0.35, 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.5);
  },
  superReady() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    [660, 990, 1320].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      env(g, t + i * 0.08, 0.004, 0.05, 0.18, 0.14);
      o.connect(lp).connect(g).connect(master);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.3);
    });
  },
  // Aire cortado en disparos fuertes: ruido filtrado que barre hacia arriba
  whoosh(power = 1) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const n = c.createBufferSource();
    const len = Math.floor(c.sampleRate * 0.3);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(1800 + power * 2200, t + 0.22);
    const g = c.createGain();
    env(g, t, 0.01, 0.06, 0.22, 0.1 + power * 0.22);
    n.connect(bp).connect(g).connect(master);
    n.start(t);
  },
  // Golpe dulce: campanita brillante + click, lee al instante
  sweetSpot() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    [1568, 2093, 2637].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      env(g, t + i * 0.012, 0.001, 0.03, 0.3, 0.16);
      o.connect(g).connect(master);
      o.start(t + i * 0.012);
      o.stop(t + i * 0.012 + 0.4);
    });
  },
  perfectTackle() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.1);
    env(g, t, 0.002, 0.03, 0.16, 0.22);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.25);
    this.sweetSpot();
  },
  // Red al recibir el gol: golpe sordo + textil
  netHit() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const n = c.createBufferSource();
    const len = Math.floor(c.sampleRate * 0.25);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    n.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1200;
    const g = c.createGain();
    env(g, t, 0.004, 0.05, 0.2, 0.25);
    n.connect(lp).connect(g).connect(master);
    n.start(t);
  },
  save() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(420, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.28);
    env(g, t, 0.003, 0.06, 0.28, 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.4);
    this.netHit();
  },
};

// Rising tone while charging a shot
let chargeOsc = null;
let chargeGain = null;
export const chargeTone = {
  start() {
    const c = ensure();
    if (!c || chargeOsc) return;
    chargeOsc = c.createOscillator();
    chargeGain = c.createGain();
    chargeOsc.type = "sawtooth";
    chargeOsc.frequency.value = 140;
    chargeGain.gain.value = 0.0001;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    chargeOsc.connect(lp).connect(chargeGain).connect(master);
    chargeOsc.start();
    chargeGain.gain.linearRampToValueAtTime(0.09, c.currentTime + 0.08);
  },
  update(v) {
    const c = ensure();
    if (!c || !chargeOsc) return;
    chargeOsc.frequency.setTargetAtTime(140 + v * 460, c.currentTime, 0.05);
  },
  stop() {
    const c = ensure();
    if (!c || !chargeOsc) return;
    const t = c.currentTime;
    chargeGain.gain.cancelScheduledValues(t);
    chargeGain.gain.setValueAtTime(chargeGain.gain.value, t);
    chargeGain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    chargeOsc.stop(t + 0.12);
    chargeOsc = null;
    chargeGain = null;
  },
};

// Ambient crowd loop (soft noise)
export const crowd = {
  start() {
    const c = ensure();
    if (!c || crowdNode) return;
    const bufSize = c.sampleRate * 4;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 220;
    const g = c.createGain();
    g.gain.value = crowdLevel;
    src.connect(hp).connect(lp).connect(g).connect(master);
    src.start(0);
    crowdNode = src;
    crowdGain = g;
  },
  // Tensión: el murmullo sube y se sostiene mientras hay peligro en el área
  tension(on) {
    const c = ensure();
    if (!c || !crowdGain) return;
    const t = c.currentTime;
    const target = on ? crowdLevel * 2.1 : crowdLevel;
    crowdGain.gain.setTargetAtTime(target, t, 0.6);
  },
  // Corta la ambientación: se usa al salir del partido para no dejar el loop
  // de público colgado sobre el splash / creador.
  stop() {
    if (crowdNode) {
      try {
        crowdNode.stop();
      } catch (e) {
        /* no-op */
      }
      try {
        crowdNode.disconnect();
      } catch (e) {
        /* no-op */
      }
    }
    crowdNode = null;
    crowdGain = null;
  },
  hype(peak = 0.18, dur = 1.6) {
    const c = ensure();
    if (!c || !crowdGain) return;
    const t = c.currentTime;
    crowdGain.gain.cancelScheduledValues(t);
    crowdGain.gain.setValueAtTime(crowdGain.gain.value, t);
    crowdGain.gain.linearRampToValueAtTime(peak, t + 0.15);
    crowdGain.gain.linearRampToValueAtTime(crowdLevel, t + dur);
  },
};
