export const FIELD = { L: 68, W: 44, GOAL_W: 10, GOAL_H: 4.2 };

export const TEAMS = {
  red: { shirt: "#ff1e33", shorts: "#ffffff", socks: "#ff1e33", label: "ROJO", dir: 1 },
  blue: { shirt: "#0f5cff", shorts: "#ffffff", socks: "#0f5cff", label: "AZUL", dir: -1 },
};

export const SKINS = ["#f4c69a", "#e8b083", "#c78855", "#8f5a34"];
export const HAIRS = ["#3a2410", "#26170d", "#5a381f", "#191012"];

// === Modos de juego (Plan v2.0) ===
// 2v2, 3v3, 4v4 — cada equipo recibe 1 arquero IA además de los jugadores de campo.
// NO HAY 6v6 (fuera de alcance: cancha y roles IA no lo soportan).
export const MODES = {
  "2v2": { fieldPlayers: 2, halfSeconds: 60, label: "2v2" },
  "3v3": { fieldPlayers: 3, halfSeconds: 90, label: "3v3" },
  "4v4": { fieldPlayers: 4, halfSeconds: 120, label: "4v4" },
};
export const DEFAULT_MODE = "3v3";

// Formaciones por modo. Coordenadas en marco propio (x negativo = arco propio).
// index 0 es siempre el arquero (GK).
export const FORMATIONS = {
  "2v2": [
    { x: -31, z:  0, role: "GK"  },
    { x: -20, z:  0, role: "DEF" },
    { x:  -9, z:  0, role: "FWD" },
  ],
  "3v3": [
    { x: -31, z:  0, role: "GK"  },
    { x: -20, z:  0, role: "DEF" },
    { x:  -9, z: -11, role: "MID" },
    { x:  -9, z:  11, role: "FWD" },
  ],
  "4v4": [
    { x: -31, z:  0, role: "GK"  },
    { x: -22, z: -8, role: "DEF" },
    { x: -22, z:  8, role: "DEF" },
    { x:  -6, z:  0, role: "MID" },
    { x:   8, z:  0, role: "FWD" },
  ],
};

// Alias temporal para no romper imports existentes.
// Engine.js debería migrar a FORMATIONS[modoActivo] y luego este alias puede borrarse.
export const FORMATION = FORMATIONS[DEFAULT_MODE];

// Zona de influencia por puesto (marco propio, x negativo = arco propio).
//  push   -> cuánto acompaña el avance del equipo
//  follow -> cuánto sigue el eje Z del balón (basculación)
export const ROLE_ZONES = {
  GK: { minX: -34, maxX: -24, push: 0.05, follow: 0.55 },
  DEF: { minX: -30, maxX: 4, push: 0.3, follow: 0.5 },
  MID: { minX: -24, maxX: 22, push: 0.7, follow: 0.4 },
  FWD: { minX: -14, maxX: 30, push: 1, follow: 0.3 },
};

// Atributos base de arquero: idénticos para ambos equipos, con variación
// mínima determinística para que no se sientan clones exactos.
export const KEEPER_BASE = { reflex: 0.8, positioning: 0.8, jump: 0.8 };
export const KEEPER_VARIATION = { red: 0.02, blue: -0.02 };

// Helper para obtener el modo activo desde localStorage.
export function getActiveMode() {
  try {
    const saved = localStorage.getItem("voxelcup.mode");
    if (saved && MODES[saved]) return saved;
  } catch (e) { /* no-op */ }
  return DEFAULT_MODE;
}
