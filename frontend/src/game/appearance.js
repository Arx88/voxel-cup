// Opciones de personalización del jugador (creador de personaje)
import { DEFAULT_KIT_ID } from "./kits";

export const HAIR_COLORS = [
  "#4a2c17", // castaño oscuro
  "#2b1a0e", // negro
  "#a8511f", // pelirrojo
  "#e8bb2a", // rubio dorado
  "#191414", // ébano
  "#5a6066", // gris
  "#efe7d6", // platino / cano
  "#7a3b12", // caoba
  "#c96a2b", // cobrizo
  "#ff3b6b", // rosa fuerte
  "#2f74ff", // azul eléctrico
  "#20d47a", // verde neón
  "#c56bff", // violeta
  "#3df0ff", // celeste cyan
  "#ffd21c", // amarillo neón
  "#ff8a1f", // naranja fluor
  "#8a2be2", // púrpura vibrante
  "#00e5c7", // turquesa
  "#ff1493", // fucsia
  "#f2f4f8", // blanco puro
];

// Pieles: 6 humanas + 12 "raras". `glow` = ojos brillantes, `translucent` =
// cuerpo semi transparente (fantasma), `face` = cara sugerida al elegirla.
export const SKIN_PRESETS = [
  { id: "clara", label: "CLARA", color: "#f8d5ac" },
  { id: "trigo", label: "TRIGO", color: "#f2c391" },
  { id: "dorada", label: "DORADA", color: "#e8aa6a" },
  { id: "canela", label: "CANELA", color: "#c8814a" },
  { id: "cobre", label: "COBRE", color: "#8f5a34" },
  { id: "oscura", label: "OSCURA", color: "#5f3823" },
  { id: "zombie", label: "ZOMBIE", color: "#7fc47a", rare: true, glow: true, eye: "#2b5c18", face: "zombie" },
  { id: "monstruo", label: "MONSTRUO", color: "#a24bff", rare: true, glow: true, eye: "#ffe14d", face: "furia" },
  { id: "hielo", label: "AZUL HIELO", color: "#7fd8ff", rare: true, glow: true, eye: "#0a4a7a" },
  { id: "demonio", label: "DEMONIO", color: "#e0231f", rare: true, glow: true, eye: "#ffd21c", face: "furia" },
  { id: "dorado", label: "DORADO", color: "#e8b71f", rare: true, glow: true, eye: "#3a2500" },
  { id: "piedra", label: "PIEDRA", color: "#8a8a99", rare: true, eye: "#1b1b22", face: "serio" },
  { id: "esqueleto", label: "ESQUELETO", color: "#eae6d8", rare: true, eye: "#0a0a0f", face: "skull" },
  { id: "alien", label: "ALIEN LIMA", color: "#b6ff3b", rare: true, glow: true, eye: "#101018", face: "cyclops" },
  { id: "neon", label: "MORADO NEÓN", color: "#c56bff", rare: true, glow: true, eye: "#3df0ff" },
  { id: "chicle", label: "ROSA CHICLE", color: "#ff8ad0", rare: true, glow: true, eye: "#7a1050", face: "feliz" },
  { id: "sombra", label: "NEGRO SOMBRA", color: "#26262e", rare: true, glow: true, eye: "#ff3b3b" },
  { id: "fantasma", label: "FANTASMA", color: "#dfe8ff", rare: true, glow: true, translucent: true, eye: "#7fd8ff" },
];

export const SKIN_TONES = SKIN_PRESETS.map((s) => s.color);

export const getSkinPreset = (color) =>
  SKIN_PRESETS.find((s) => s.color === color) || SKIN_PRESETS[2];

export const EYE_COLORS = [
  "#141419",
  "#3a2410",
  "#1f6f3a",
  "#1f5fe0",
  "#3df0ff",
  "#ffd21c",
  "#ff3b3b",
  "#c56bff",
  "#20d47a",
  "#ff8ad0",
  "#ffffff",
  "#ff8a1f",
];

export const FACES = [
  { id: "normal", label: "NORMAL" },
  { id: "feliz", label: "FELIZ" },
  { id: "furia", label: "FURIA" },
  { id: "serio", label: "SERIO" },
  { id: "cyclops", label: "CÍCLOPE" },
  { id: "skull", label: "CALAVERA" },
  { id: "visor", label: "VISOR" },
  { id: "zombie", label: "ZOMBIE" },
];

export const ACCESSORIES = [
  { id: "none", label: "NINGUNO" },
  { id: "headband", label: "CINTA" },
  { id: "cap", label: "GORRA" },
  { id: "glasses", label: "ANTEOJOS" },
  { id: "mask", label: "ANTIFAZ" },
  { id: "horns", label: "CUERNOS" },
  { id: "crown", label: "CORONA" },
  { id: "halo", label: "AURA" },
];

export const ACC_COLORS = [
  "#ff2d3c",
  "#2f74ff",
  "#ffd21c",
  "#20d47a",
  "#c56bff",
  "#ffffff",
  "#101018",
  "#ff8a1f",
];

export const BODY_TYPES = [
  { id: "normal", label: "NORMAL" },
  { id: "slim", label: "FLACO" },
  { id: "tank", label: "TANQUE" },
  { id: "tall", label: "ALTO" },
  { id: "short", label: "BAJO" },
];

export const SHIRT_COLORS = [
  "#1f5fe0",
  "#d62330",
  "#0e7a3c",
  "#ffcc17",
  "#f4f4f4",
  "#5b2bb0",
  "#0a0a10",
  "#ff6bad",
  "#3df0ff",
];

// Set curado de dorsales clásicos (1-11 completos + históricos de crack)
export const NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, 24, 27, 30, 33,
  44, 69, 77, 99,
];

export const RANDOM_NAMES = [
  "ACIDO",
  "VOXI",
  "PIBE",
  "CRACK",
  "TOTO",
  "CUBO",
  "MESSI JR",
  "BLOQUE",
  "TIFON",
  "CHAPA",
  "NANO",
  "RAYO",
  "ZOMBIE",
  "MONSTRUO",
  "FANTASMA",
];

export const DEFAULT_PROFILE = {
  name: "",
  hairStyle: "bowl",
  hairColor: HAIR_COLORS[0],
  skin: SKIN_PRESETS[2].color,
  shirt: SHIRT_COLORS[0],
  kitId: DEFAULT_KIT_ID,
  number: 10,
  face: "normal",
  eyeColor: EYE_COLORS[0],
  accessory: "none",
  accColor: ACC_COLORS[0],
  body: "normal",
};

const KEY = "voxelcup.profile";
const FLAG = "voxelcup.onboarded";

export const loadProfile = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_PROFILE };
  }
};

export const saveProfile = (p) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    localStorage.setItem(FLAG, "1");
  } catch (e) {
    /* no-op */
  }
};

export const hasProfile = () => {
  try {
    return localStorage.getItem(FLAG) === "1" && !!localStorage.getItem(KEY);
  } catch (e) {
    return false;
  }
};

export const resetProfile = () => {
  try {
    localStorage.removeItem(FLAG);
  } catch (e) {
    /* no-op */
  }
};

export const randomName = (current) => {
  const pool = RANDOM_NAMES.filter((n) => n !== current);
  return pool[Math.floor(Math.random() * pool.length)];
};

// Traduce el perfil guardado a las opciones que consume createPlayerMesh
export const profileLook = (p) => {
  const preset = getSkinPreset(p.skin);
  return {
    skin: p.skin,
    hair: p.hairColor,
    hairStyle: p.hairStyle,
    face: p.face || preset.face || "normal",
    eye: p.eyeColor || DEFAULT_PROFILE.eyeColor,
    glow: !!preset.glow,
    translucent: !!preset.translucent,
    accessory: p.accessory || "none",
    accColor: p.accColor || ACC_COLORS[0],
    body: p.body || "normal",
  };
};
