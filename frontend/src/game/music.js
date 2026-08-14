// Popurrí chiptune para el splash / onboarding. Sin archivos externos.
import { getAudio } from "./audio";

const N = (name) => {
  const map = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) return 440;
  const semi = map[m[1]] + (parseInt(m[2], 10) + 1) * 12;
  return 440 * Math.pow(2, (semi - 69) / 12);
};

// Cada sección: [nota, tiempo(beats), duración(beats)]
const LEAD = [
  // A — fanfarria de entrada
  ["G4", 0, 0.5], ["C5", 0.5, 0.5], ["E5", 1, 0.5], ["G5", 1.5, 1],
  ["F5", 2.5, 0.5], ["E5", 3, 0.5], ["C5", 3.5, 0.5],
  ["D5", 4, 0.5], ["E5", 4.5, 0.5], ["F5", 5, 0.5], ["G5", 5.5, 1.5],
  // B — canción de tribuna (olé olé)
  ["E5", 8, 0.75], ["E5", 8.75, 0.75], ["D5", 9.5, 0.5], ["C5", 10, 1],
  ["D5", 11, 0.5], ["E5", 11.5, 0.5],
  ["G5", 12, 0.75], ["G5", 12.75, 0.75], ["F5", 13.5, 0.5], ["E5", 14, 1.5],
  // C — puente saltarín
  ["C5", 16, 0.25], ["D5", 16.25, 0.25], ["E5", 16.5, 0.25], ["G5", 16.75, 0.25],
  ["A5", 17, 0.5], ["G5", 17.5, 0.5], ["E5", 18, 0.5], ["D5", 18.5, 0.5],
  ["C5", 19, 0.25], ["E5", 19.25, 0.25], ["G5", 19.5, 0.5],
  ["A5", 20, 0.5], ["C6", 20.5, 1], ["B5", 21.5, 0.5],
  ["A5", 22, 0.5], ["G5", 22.5, 1.5],
  // D — remate épico
  ["C5", 24, 0.5], ["E5", 24.5, 0.5], ["G5", 25, 0.5], ["C6", 25.5, 1.5],
  ["B5", 27, 0.5], ["G5", 27.5, 0.5],
  ["A5", 28, 0.5], ["F5", 28.5, 0.5], ["G5", 29, 1], ["C6", 30, 2],
];

const BASS = [
  ["C3", 0, 1], ["C3", 1, 0.5], ["G2", 2, 1], ["G2", 3, 0.5],
  ["F2", 4, 1], ["F2", 5, 0.5], ["G2", 6, 1], ["G2", 7, 0.5],
  ["A2", 8, 1], ["A2", 9, 0.5], ["F2", 10, 1], ["F2", 11, 0.5],
  ["C3", 12, 1], ["C3", 13, 0.5], ["G2", 14, 1], ["G2", 15, 0.5],
  ["C3", 16, 0.5], ["C3", 16.5, 0.5], ["A2", 18, 0.5], ["A2", 18.5, 0.5],
  ["F2", 20, 0.5], ["F2", 20.5, 0.5], ["G2", 22, 0.5], ["G2", 22.5, 0.5],
  ["C3", 24, 1], ["E3", 25, 0.5], ["G2", 26, 1], ["G2", 27, 0.5],
  ["F2", 28, 1], ["G2", 29, 0.5], ["C3", 30, 2],
];

const BEATS = 32;
const BPM = 132;

let playing = false;
let timer = null;
let stopAt = 0;
let musicGain = null;
let enabled = true;
let volume = 0.55;

const tone = (a, freq, t0, dur, type, peak, cut = 3200) => {
  const { ctx } = a;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cut;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(peak * 0.55, t0 + dur * 0.55);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(lp).connect(g).connect(musicGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
};

const hat = (a, t0, peak) => {
  const { ctx } = a;
  const len = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.value = peak;
  src.connect(hp).connect(g).connect(musicGain);
  src.start(t0);
};

const kick = (a, t0) => {
  const { ctx } = a;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150, t0);
  o.frequency.exponentialRampToValueAtTime(48, t0 + 0.14);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.5, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
  o.connect(g).connect(musicGain);
  o.start(t0);
  o.stop(t0 + 0.25);
};

const scheduleLoop = (a, t0, spb) => {
  LEAD.forEach(([n, b, d]) => {
    tone(a, N(n), t0 + b * spb, d * spb * 0.92, "square", 0.1, 4200);
    tone(a, N(n) * 2, t0 + b * spb, d * spb * 0.5, "triangle", 0.035, 6000);
  });
  BASS.forEach(([n, b, d]) => tone(a, N(n), t0 + b * spb, d * spb * 0.9, "sawtooth", 0.11, 700));
  for (let b = 0; b < BEATS; b += 0.5) {
    hat(a, t0 + b * spb, b % 1 === 0 ? 0.045 : 0.075);
    if (b % 2 === 0) kick(a, t0 + b * spb);
  }
};

export const music = {
  get playing() {
    return playing;
  },
  get enabled() {
    return enabled;
  },
  start() {
    const a = getAudio();
    if (!a || playing || !enabled) return;
    if (!musicGain) {
      musicGain = a.ctx.createGain();
      musicGain.gain.value = volume;
      musicGain.connect(a.master);
    }
    musicGain.gain.setTargetAtTime(volume, a.ctx.currentTime, 0.2);
    playing = true;
    const spb = 60 / BPM;
    const loopLen = BEATS * spb;
    stopAt = a.ctx.currentTime + 0.15;
    const tick = () => {
      const cur = getAudio();
      if (!cur || !playing) return;
      while (stopAt < cur.ctx.currentTime + 1.5) {
        scheduleLoop(cur, stopAt, spb);
        stopAt += loopLen;
      }
      timer = setTimeout(tick, 500);
    };
    tick();
  },
  stop() {
    const a = getAudio();
    playing = false;
    if (timer) clearTimeout(timer);
    timer = null;
    if (a && musicGain) musicGain.gain.setTargetAtTime(0.0001, a.ctx.currentTime, 0.25);
  },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    const a = getAudio();
    if (a && musicGain && playing) musicGain.gain.setTargetAtTime(volume, a.ctx.currentTime, 0.15);
    return volume;
  },
  get volume() {
    return volume;
  },
  setEnabled(v) {
    enabled = v;
    if (!v) this.stop();
    else this.start();
    return enabled;
  },
  toggle() {
    return this.setEnabled(!enabled);
  },
};
