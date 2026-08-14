// SFX del flujo (splash / onboarding / creador). Sintetizados, sin archivos.
import { getAudio } from "./audio";

const noise = (a, t0, dur, hp, peak, sweep) => {
  const { ctx } = a;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(hp, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  f.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.master);
  src.start(t0);
};

const blip = (a, freq, t0, dur, type = "square", peak = 0.14, glide = 0) => {
  const { ctx } = a;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
};

export const uisfx = {
  whoosh() {
    const a = getAudio();
    if (!a) return;
    noise(a, a.ctx.currentTime, 0.5, 320, 0.22, 2600);
  },
  thud(v = 1) {
    const a = getAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const { ctx } = a;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(180 * v, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(a.master);
    o.start(t);
    o.stop(t + 0.2);
    noise(a, t, 0.08, 900, 0.06);
  },
  cheer() {
    const a = getAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    noise(a, t, 1.5, 700, 0.14, 1500);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      blip(a, f, t + i * 0.08, 0.4, "square", 0.1)
    );
  },
  swipe(dir = 1) {
    const a = getAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    noise(a, t, 0.22, dir > 0 ? 700 : 1800, 0.1, dir > 0 ? 2200 : 600);
  },
  click(kind = "ui") {
    const a = getAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const map = {
      ui: [660, 0.07, "square"],
      hair: [880, 0.09, "triangle"],
      haircolor: [740, 0.08, "sine"],
      skin: [560, 0.09, "sine"],
      shirt: [990, 0.08, "square"],
      number: [1240, 0.07, "triangle"],
    };
    const [f, d, type] = map[kind] || map.ui;
    blip(a, f, t, d, type, 0.12);
    blip(a, f * 1.5, t + 0.03, d * 0.7, type, 0.06);
  },
  dice() {
    const a = getAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      noise(a, t + i * 0.055, 0.05, 1400 + Math.random() * 1800, 0.09);
    }
    blip(a, 880, t + 0.42, 0.16, "square", 0.12, 1320);
  },
  pop() {
    const a = getAudio();
    if (!a) return;
    blip(a, 420, a.ctx.currentTime, 0.12, "sine", 0.14, 1180);
  },
};
