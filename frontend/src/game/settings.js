// Ajustes persistentes: audio, duración del partido, cámara y control.
import { setSfxVolume } from "./audio";
import { music } from "./music";

const KEY = "voxelcup.settings";

const DEFAULTS = {
  sfx: 0.7,
  musicVol: 0.55,
  musicOn: true,
  halfLen: 90, // duración de cada tiempo en segundos (2 x 90s)
  autoSwitch: false, // cambio automático al jugador más cercano
  povSens: 0.65, // sensibilidad de la cámara POV (más baja por defecto — control AAA)
  invertY: false,
  aiLevel: "normal", // easy | normal | hard
};

let state = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
} catch (e) {
  state = { ...DEFAULTS };
}

const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* no-op */
  }
};

export const getSettings = () => ({ ...state });

export const applySettings = () => {
  setSfxVolume(state.sfx);
  music.setVolume(state.musicVol);
  music.setEnabled(state.musicOn);
};

export const setSetting = (key, value) => {
  state[key] = value;
  persist();
  if (key === "sfx") setSfxVolume(value);
  if (key === "musicVol") music.setVolume(value);
  if (key === "musicOn") music.setEnabled(value);
  return { ...state };
};

// Aplica el volumen guardado sin arrancar la música todavía
setSfxVolume(state.sfx);
music.setVolume(state.musicVol);
