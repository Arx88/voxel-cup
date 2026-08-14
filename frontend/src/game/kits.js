// Equipaciones del juego. Colores/patrones genéricos inspirados en camisetas
// emblemáticas — sin escudos ni marcas registradas.
// `pattern`: solid | stripesV | bandH | sash | hoops
export const KITS = [
  {
    id: "clasico-rojo",
    label: "ROJO CLÁSICO",
    short: "ROJO",
    pattern: "solid",
    shirt: "#ff1e33",
    alt: "#ffffff",
    shorts: "#ffffff",
    socks: "#ff1e33",
  },
  {
    id: "clasico-azul",
    label: "AZUL CLÁSICO",
    short: "AZUL",
    pattern: "solid",
    shirt: "#0f5cff",
    alt: "#ffffff",
    shorts: "#ffffff",
    socks: "#0f5cff",
  },
  // Azul y oro
  {
    id: "xeneize",
    label: "AZUL Y ORO",
    short: "AZUL/ORO",
    pattern: "bandH",
    shirt: "#0b3372",
    alt: "#f2b902",
    shorts: "#0b3372",
    socks: "#0b3372",
  },
  // Blanco con banda roja diagonal
  {
    id: "millonario",
    label: "BANDA ROJA",
    short: "BANDA",
    pattern: "sash",
    shirt: "#f2f4f8",
    alt: "#e5122e",
    shorts: "#12121a",
    socks: "#f2f4f8",
  },
  // Blaugrana a rayas
  {
    id: "blaugrana",
    label: "BLAUGRANA",
    short: "BLAU",
    pattern: "stripesV",
    shirt: "#14356e",
    alt: "#9c1035",
    shorts: "#14356e",
    socks: "#14356e",
  },
  // Blanco total con detalles dorados
  {
    id: "merengue",
    label: "BLANCO Y ORO",
    short: "ORO",
    pattern: "solid",
    shirt: "#f7f7fa",
    alt: "#d4af37",
    shorts: "#f7f7fa",
    socks: "#f7f7fa",
  },
  // Celeste y blanco a rayas
  {
    id: "academia",
    label: "CELESTE Y BLANCO",
    short: "CELESTE",
    pattern: "stripesV",
    shirt: "#f2f4f8",
    alt: "#6fc0f2",
    shorts: "#12121a",
    socks: "#6fc0f2",
  },
  {
    id: "blanco-total",
    label: "BLANCO TOTAL",
    short: "BLANCO",
    pattern: "solid",
    shirt: "#ffffff",
    alt: "#e3e9f2",
    shorts: "#ffffff",
    socks: "#ffffff",
  },
  {
    id: "negro-total",
    label: "NEGRO TOTAL",
    short: "NEGRO",
    pattern: "solid",
    shirt: "#0a0a10",
    alt: "#1f1f28",
    shorts: "#0a0a10",
    socks: "#0a0a10",
  },
  {
    id: "verde-selva",
    label: "VERDE SELVA",
    short: "SELVA",
    pattern: "hoops",
    shirt: "#0e7a3c",
    alt: "#f2f4f8",
    shorts: "#f2f4f8",
    socks: "#0e7a3c",
  },
  {
    id: "naranja-fuego",
    label: "NARANJA FUEGO",
    short: "FUEGO",
    pattern: "solid",
    shirt: "#ff6a1f",
    alt: "#12121a",
    shorts: "#12121a",
    socks: "#ff6a1f",
  },
  {
    id: "violeta-neon",
    label: "VIOLETA NEÓN",
    short: "NEÓN",
    pattern: "sash",
    shirt: "#5b2bb0",
    alt: "#3df0ff",
    shorts: "#2a1160",
    socks: "#3df0ff",
  },
];

export const DEFAULT_KIT_ID = "clasico-rojo";

export const getKit = (id) => KITS.find((k) => k.id === id) || KITS[0];

const rgb = (hex) => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

// Distancia perceptual simple entre dos colores (0 = idéntico)
export const colorDistance = (a, b) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 * 0.3 + (g1 - g2) ** 2 * 0.59 + (b1 - b2) ** 2 * 0.11);
};

// ¿Choque de colores? Se comparan los dos colores dominantes de cada kit.
export const kitsClash = (a, b) => {
  const pairs = [
    [a.shirt, b.shirt],
    [a.shirt, b.alt],
    [a.alt, b.shirt],
  ];
  return pairs.some(([x, y]) => colorDistance(x, y) < 60);
};

// Equipación alterna del rival: la más contrastante que no choque.
export const pickRivalKit = (kit) => {
  const options = KITS.filter((k) => k.id !== kit.id && !kitsClash(kit, k));
  const pool = options.length ? options : KITS.filter((k) => k.id !== kit.id);
  return pool.reduce(
    (best, k) =>
      colorDistance(k.shirt, kit.shirt) > colorDistance(best.shirt, kit.shirt) ? k : best,
    pool[0]
  );
};

// Compat: el rival nunca usa la misma equipación
export const rivalKit = (kit) => pickRivalKit(kit);
