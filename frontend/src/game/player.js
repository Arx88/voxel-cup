import * as THREE from "three";
import { SKINS, HAIRS } from "./config";
import {
  shirtTextures,
  shortsTextures,
  faceTexture,
  skinTexture,
  hairTexture,
  sockTexture,
  bootTexture,
  flatTexture,
} from "./kit";

// ---------------------------------------------------------------------------
// Proporciones voxel (ver notas antiguas). Se mantienen intactas.
// ---------------------------------------------------------------------------
export const TOTAL = 2.5;
const U = TOTAL;
const Y = (rel) => (1 - rel) * U;

const R = {
  capTop: 0.0, capBot: 0.023, capMidBot: 0.047, brimBot: 0.157,
  headTop: 0.086, sideHairBot: 0.313, napeBot: 0.322,
  earTop: 0.2, earBot: 0.28, headBot: 0.345,
  neckTop: 0.322, neckBot: 0.372,
  torsoTop: 0.353, armTop: 0.357, sleeveBot: 0.47, cuffBot: 0.516,
  foreBot: 0.628, handBot: 0.655, torsoBot: 0.636,
  hipBot: 0.7, shortLegBot: 0.76, thighBot: 0.798,
  sockBandBot: 0.818, knee: 0.845, sockBot: 0.876, ankle: 0.884, footBot: 1.0,
};

const W = {
  head: 0.243, headD: 0.243,
  neck: 0.106, neckD: 0.1,
  torso: 0.274, torsoD: 0.171,
  arm: 0.082, armD: 0.09,
  short: 0.271, shortD: 0.178,
  thigh: 0.098, thighD: 0.104,
  sock: 0.1, sockD: 0.106,
  boot: 0.117, bootD: 0.178,
};

const cache = new Map();
const memo = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

const matOpts = (map, translucent) => {
  if (translucent) {
    return new THREE.MeshLambertMaterial({ map, transparent: true, opacity: 0.72, depthWrite: false });
  }
  return new THREE.MeshLambertMaterial({ map });
};
const mat = (map) => new THREE.MeshLambertMaterial({ map });
const solidMat = (color, translucent) =>
  translucent
    ? new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.85 })
    : new THREE.MeshLambertMaterial({ color });

const box = (w, h, d, material) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  return m;
};

const seg = (relTop, relBot, w, d, material, pivot = 0) => {
  const m = box(w * U, (relBot - relTop) * U, d * U, material);
  m.position.y = (Y(relTop) + Y(relBot)) / 2 - pivot;
  return m;
};

const whiteMat = () => mat(memo("flat-white", () => flatTexture("#f4f7fb")));

export const HEAD = { w: W.head * U, h: (R.headBot - R.headTop) * U, d: W.headD * U };

export const RIG = {
  headTop: Y(R.headTop),
  headBottom: Y(R.headBot),
  headCenter: (Y(R.headTop) + Y(R.headBot)) / 2,
  torsoTop: Y(R.torsoTop),
  torsoBottom: Y(R.torsoBot),
  shoulderY: Y(R.armTop),
  hipPivot: Y(R.hipBot),
  total: U,
};

// ---------------------------------------------------------------------------
// PEINADOS — sistema anclado al cráneo (fix pack).
// Espacio local del cubo de cabeza: x,y,z en [-0.5, 0.5]. y = +0.5 es la
// coronilla. TODA pieza debe solaparse con el cráneo o con otra pieza del
// mismo peinado: si su borde inferior queda por encima de +0.5 sin pieza que
// la conecte, el pelo "flota". El bug anterior venía de reutilizar offsets del
// espacio del cuerpo completo (capY ≈ 0.79), que caía fuera del cráneo.
// Formato de cubo: [w, h, d, x, y, z]  (w/h/d relativos a HEAD.w/h/d)
// ---------------------------------------------------------------------------

// Piezas base reutilizables (todas apoyadas sobre el cráneo)
const CAP = [1.06, 0.3, 1.06, 0, 0.36, 0]; // corona: y [0.21, 0.51]
const CAP_LOW = [1.1, 0.24, 1.1, 0, 0.16, 0]; // borde: y [0.04, 0.28]
const SIDE_L = [0.16, 0.46, 1.0, -0.5, -0.03, -0.02];
const SIDE_R = [0.16, 0.46, 1.0, 0.5, -0.03, -0.02];
const NAPE = [1.1, 0.5, 0.16, 0, -0.02, -0.5];
const BURN_L = [0.12, 0.3, 0.18, -0.47, -0.1, 0.44];
const BURN_R = [0.12, 0.3, 0.18, 0.47, -0.1, 0.44];
const TRIM_L = [0.1, 0.3, 0.8, -0.51, 0.1, -0.06]; // patilla rapada
const TRIM_R = [0.1, 0.3, 0.8, 0.51, 0.1, -0.06];
const HAIR_L = [0.06, 0.28, 0.7, -0.52, 0.08, -0.08]; // patilla mínima (fade)
const HAIR_R = [0.06, 0.28, 0.7, 0.52, 0.08, -0.08];
const NAPE_S = [1.06, 0.26, 0.12, 0, 0.06, -0.49];

const BASE = [CAP, CAP_LOW, SIDE_L, SIDE_R, BURN_L, BURN_R, NAPE];

const HAIR_PARTS = {
  bowl: BASE,

  buzz: [
    [1.04, 0.26, 1.04, 0, 0.37, 0],
    [1.06, 0.16, 1.06, 0, 0.19, 0],
    TRIM_L,
    TRIM_R,
    NAPE_S,
  ],

  spike: [
    ...BASE,
    [0.18, 0.26, 0.18, -0.3, 0.6, 0.16],
    [0.18, 0.34, 0.18, -0.02, 0.64, 0.06],
    [0.18, 0.26, 0.18, 0.3, 0.6, 0.14],
    [0.18, 0.22, 0.18, -0.16, 0.58, -0.24],
    [0.18, 0.22, 0.18, 0.18, 0.58, -0.26],
  ],

  curly: [
    ...BASE,
    [0.24, 0.24, 0.24, -0.42, 0.52, 0.3],
    [0.24, 0.24, 0.24, 0.04, 0.55, 0.32],
    [0.24, 0.24, 0.24, 0.42, 0.5, 0.2],
    [0.24, 0.24, 0.24, -0.44, 0.48, -0.3],
    [0.24, 0.24, 0.24, 0.4, 0.5, -0.32],
    [0.24, 0.24, 0.24, 0, 0.46, -0.44],
    [0.22, 0.22, 0.22, -0.56, 0.18, -0.18],
    [0.22, 0.22, 0.22, 0.56, 0.14, -0.22],
  ],

  long: [
    CAP,
    CAP_LOW,
    [0.2, 1.05, 0.92, -0.52, -0.32, -0.06],
    [0.2, 1.05, 0.92, 0.52, -0.32, -0.06],
    [1.16, 1.2, 0.2, 0, -0.38, -0.52],
  ],

  mohawk: [
    [1.02, 0.22, 1.02, 0, 0.38, 0],
    [1.04, 0.14, 1.04, 0, 0.21, 0],
    [0.24, 0.42, 1.0, 0, 0.62, -0.02],
    HAIR_L,
    HAIR_R,
    NAPE_S,
  ],

  afro: [
    [1.16, 0.44, 1.16, 0, 0.32, 0],
    [1.34, 0.36, 1.34, 0, 0.12, 0],
    [0.32, 0.32, 0.32, -0.52, 0.54, 0.22],
    [0.32, 0.32, 0.32, -0.06, 0.6, 0.3],
    [0.32, 0.32, 0.32, 0.44, 0.56, 0.24],
    [0.32, 0.32, 0.32, 0.6, 0.36, -0.2],
    [0.32, 0.32, 0.32, -0.6, 0.34, -0.26],
    [0.32, 0.32, 0.32, 0.12, 0.52, -0.44],
    [0.3, 0.3, 0.3, -0.4, 0.14, -0.4],
    [0.3, 0.3, 0.3, 0.4, 0.12, 0.36],
    [0.3, 0.3, 0.3, -0.44, 0.1, 0.38],
  ],

  shaved: [
    [1.02, 0.14, 1.02, 0, 0.44, 0],
    [1.03, 0.12, 1.03, 0, 0.32, 0],
    [1.02, 0.18, 0.1, 0, 0.14, -0.48],
  ],

  quiff: [
    [1.03, 0.26, 1.03, 0, 0.37, 0],
    [0.84, 0.4, 0.44, 0, 0.6, 0.34],
    [1.05, 0.14, 1.05, 0, 0.2, 0],
    TRIM_L,
    TRIM_R,
    NAPE_S,
  ],

  ponytail: [
    CAP,
    CAP_LOW,
    SIDE_L,
    SIDE_R,
    NAPE,
    [0.3, 0.3, 0.28, 0, 0.24, -0.62],
    [0.26, 0.56, 0.26, 0, -0.1, -0.72],
    [0.2, 0.28, 0.2, 0, -0.46, -0.76],
  ],

  bun: [
    [1.03, 0.28, 1.03, 0, 0.36, 0],
    [1.05, 0.16, 1.05, 0, 0.18, 0],
    [0.42, 0.4, 0.42, 0, 0.46, -0.42],
    TRIM_L,
    TRIM_R,
    NAPE_S,
  ],

  dreads: [
    [1.06, 0.3, 1.06, 0, 0.36, 0],
    [1.14, 0.22, 1.14, 0, 0.16, 0],
    [0.16, 0.95, 0.16, -0.54, -0.3, 0.4],
    [0.16, 1.05, 0.16, -0.58, -0.38, -0.14],
    [0.16, 0.88, 0.16, 0.54, -0.26, 0.42],
    [0.16, 1.08, 0.16, 0.58, -0.4, -0.16],
    [0.16, 0.82, 0.16, -0.22, -0.22, -0.56],
    [0.16, 0.92, 0.16, 0.22, -0.32, -0.58],
    [0.16, 0.72, 0.16, 0, -0.16, -0.58],
  ],

  fade: [
    [0.98, 0.34, 0.98, 0, 0.34, 0.02],
    [1.02, 0.16, 1.02, 0, 0.16, 0],
    HAIR_L,
    HAIR_R,
    NAPE_S,
  ],

  sidePart: [
    [1.03, 0.28, 1.03, 0, 0.36, 0],
    [0.6, 0.34, 1.04, -0.2, 0.5, 0.02],
    [1.14, 0.2, 1.12, 0.02, 0.17, 0.02],
    SIDE_L,
    SIDE_R,
    NAPE,
  ],

  fringe: [
    CAP,
    CAP_LOW,
    [1.18, 0.26, 1.18, 0, 0.1, 0],
    [0.72, 0.3, 0.14, -0.14, -0.06, 0.53],
    SIDE_L,
    SIDE_R,
    NAPE,
  ],

  braids: [
    CAP,
    CAP_LOW,
    SIDE_L,
    SIDE_R,
    NAPE,
    [0.2, 0.95, 0.2, -0.54, -0.34, 0.36],
    [0.2, 0.95, 0.2, 0.54, -0.34, 0.36],
  ],

  mullet: [
    [1.03, 0.26, 1.03, 0, 0.37, 0],
    [1.06, 0.16, 1.06, 0, 0.19, 0],
    [0.12, 0.36, 0.82, -0.52, 0.06, -0.08],
    [0.12, 0.36, 0.82, 0.52, 0.06, -0.08],
    [1.16, 1.2, 0.22, 0, -0.36, -0.52],
  ],

  undercut: [
    [0.94, 0.44, 1.0, 0, 0.3, 0],
    [0.98, 0.14, 1.0, 0, 0.12, 0],
    [0.05, 0.3, 0.68, -0.51, 0.06, -0.1],
    [0.05, 0.3, 0.68, 0.51, 0.06, -0.1],
  ],

  punk: [
    [1.0, 0.24, 1.0, 0, 0.38, 0],
    [0.2, 0.6, 1.0, 0, 0.72, 0],
    [0.14, 0.34, 0.14, 0, 1.1, 0.28],
    [0.14, 0.4, 0.14, 0, 1.16, 0],
    [0.14, 0.34, 0.14, 0, 1.08, -0.28],
    HAIR_L,
    HAIR_R,
  ],

  flow: [
    CAP,
    CAP_LOW,
    [0.22, 1.55, 0.94, -0.53, -0.58, -0.04],
    [0.22, 1.55, 0.94, 0.53, -0.58, -0.04],
    [1.2, 1.8, 0.22, 0, -0.68, -0.54],
  ],
};

export const HAIR_STYLES = [
  { id: "bowl", label: "CLÁSICO" },
  { id: "spike", label: "PÚAS" },
  { id: "curly", label: "RIZADO" },
  { id: "buzz", label: "CORTO" },
  { id: "long", label: "LARGO" },
  { id: "mohawk", label: "CRESTA" },
  { id: "afro", label: "AFRO" },
  { id: "shaved", label: "PELADO" },
  { id: "quiff", label: "JOPO" },
  { id: "ponytail", label: "COLITA" },
  { id: "bun", label: "RODETE" },
  { id: "dreads", label: "RASTAS" },
  { id: "fade", label: "DEGRADÉ" },
  { id: "sidePart", label: "RAYA AL COSTADO" },
  { id: "fringe", label: "FLEQUILLO" },
  { id: "braids", label: "TRENZAS" },
  { id: "mullet", label: "MULLET" },
  { id: "undercut", label: "UNDERCUT" },
  { id: "punk", label: "PUNK" },
  { id: "flow", label: "MELENA XL" },
];

// ---- Accesorios (piezas voxel encima de la cabeza) -------------------------
// Cada pieza describe un array de cubos [w,h,d,x,y,z,color?] en unidades
// normalizadas al cubo cabeza (y=+0.5 = coronilla).
const buildAccessory = (id, color) => {
  if (!id || id === "none") return null;
  const g = new THREE.Group();
  const push = (w, h, d, x, y, z, col) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w * HEAD.w, h * HEAD.h, d * HEAD.d),
      solidMat(col || color)
    );
    m.position.set(x * HEAD.w, y * HEAD.h, z * HEAD.d);
    m.castShadow = true;
    g.add(m);
  };
  if (id === "headband") {
    push(1.32, 0.14, 1.32, 0, 0.02, 0);
  } else if (id === "cap") {
    push(1.2, 0.22, 1.2, 0, 0.44, 0);
    push(1.28, 0.14, 1.28, 0, 0.32, 0);
    push(0.9, 0.06, 0.9, 0.05, 0.4, 0.55); // visera
  } else if (id === "glasses") {
    push(1.34, 0.16, 0.08, 0, 0.02, 0.6, "#0d0d12");
    push(0.36, 0.32, 0.14, -0.3, 0.04, 0.6, color);
    push(0.36, 0.32, 0.14, 0.3, 0.04, 0.6, color);
  } else if (id === "mask") {
    push(1.28, 0.32, 0.08, 0, 0.02, 0.6, color);
    push(0.24, 0.24, 0.12, -0.28, 0.02, 0.62, "#0d0d12");
    push(0.24, 0.24, 0.12, 0.28, 0.02, 0.62, "#0d0d12");
  } else if (id === "horns") {
    push(0.2, 0.36, 0.2, -0.36, 0.62, 0.05, color);
    push(0.16, 0.28, 0.16, -0.36, 0.9, 0.02, color);
    push(0.2, 0.36, 0.2, 0.36, 0.62, 0.05, color);
    push(0.16, 0.28, 0.16, 0.36, 0.9, 0.02, color);
  } else if (id === "crown") {
    push(1.26, 0.18, 1.26, 0, 0.5, 0, color);
    push(0.22, 0.34, 0.22, 0, 0.72, 0.5, color);
    push(0.22, 0.34, 0.22, -0.44, 0.72, 0.24, color);
    push(0.22, 0.34, 0.22, 0.44, 0.72, 0.24, color);
    push(0.22, 0.34, 0.22, -0.44, 0.72, -0.24, color);
    push(0.22, 0.34, 0.22, 0.44, 0.72, -0.24, color);
    push(0.22, 0.34, 0.22, 0, 0.72, -0.5, color);
  } else if (id === "halo") {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(HEAD.w * 0.7, HEAD.w * 0.06, 10, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = HEAD.h * 0.72;
    g.add(ring);
  }
  return g;
};

const buildHead = ({ skin, hair, hairStyle, face, eye, glow, translucent, accessory, accColor }) => {
  const skinTex = memo(`skin-${skin}`, () => skinTexture(skin));
  const hairTex = memo(`hair-${hair}`, () => hairTexture(hair));
  // La cara depende también de face/eye/glow, no sólo del tono de piel.
  const faceKey = `face-${skin}-${face || "normal"}-${eye || "#141419"}-${glow ? 1 : 0}`;
  const faceTex = memo(faceKey, () => faceTexture(skin, { face, eye, glow }));
  const skinMat = matOpts(skinTex, translucent);
  const hairMat = matOpts(hairTex, translucent);
  const faceMat = matOpts(faceTex, translucent);

  const head = new THREE.Mesh(new THREE.BoxGeometry(HEAD.w, HEAD.h, HEAD.d), [
    skinMat, skinMat, skinMat, skinMat, faceMat, skinMat,
  ]);
  head.castShadow = true;

  const parts = HAIR_PARTS[hairStyle] || HAIR_PARTS.bowl;
  parts.forEach(([w, h, d, x, y, z]) => {
    const m = box(w * HEAD.w, h * HEAD.h, d * HEAD.d, hairMat);
    m.position.set(x * HEAD.w, y * HEAD.h, z * HEAD.d);
    head.add(m);
  });

  const acc = buildAccessory(accessory, accColor || "#ffd21c");
  if (acc) head.add(acc);

  return { head, skinMat };
};

export function createHeadMesh(opts) {
  return buildHead({
    skin: opts.skin || SKINS[0],
    hair: opts.hair || HAIRS[0],
    hairStyle: opts.hairStyle || "bowl",
    face: opts.face || "normal",
    eye: opts.eye || "#141419",
    glow: !!opts.glow,
    translucent: !!opts.translucent,
    accessory: opts.accessory || "none",
    accColor: opts.accColor,
  }).head;
}

// Escalas por tipo de cuerpo. Aplicadas al Group raíz.
const BODY_SCALES = {
  normal: { x: 1, y: 1, z: 1 },
  slim:   { x: 0.88, y: 1.0, z: 0.9 },
  tank:   { x: 1.16, y: 0.96, z: 1.14 },
  tall:   { x: 0.96, y: 1.12, z: 0.96 },
  short:  { x: 1.04, y: 0.86, z: 1.04 },
};

export function createPlayerMesh({ shirt, shorts, socks, number, skin, hair, hairStyle, kit, look }) {
  const g = new THREE.Group();
  const skinCol = skin || SKINS[Math.floor(Math.random() * SKINS.length)];
  const hairCol = hair || HAIRS[Math.floor(Math.random() * HAIRS.length)];
  const shortsCol = shorts || "#f4f7fb";
  const socksCol = socks || (kit ? kit.socks : shirt) || "#ffffff";
  const design = kit || { shirt, alt: "#ffffff", pattern: "solid" };
  const designKey = `${design.shirt}-${design.alt}-${design.pattern}`;
  const bodyType = (look && look.body) || "normal";
  const translucent = !!(look && look.translucent);

  const shirtTex = memo(`shirt-${designKey}-${number}`, () => shirtTextures(design, number));
  const shortsTex = memo(`shorts-${shortsCol}-${design.shirt}`, () => shortsTextures(shortsCol, design.shirt));
  const bandFrac = (R.sockBandBot - R.thighBot) / (R.knee - R.thighBot);
  const sockTex = memo(`sock-${socksCol}`, () => sockTexture(socksCol, bandFrac));
  const sockLowTex = memo(`sockLow-${socksCol}`, () => sockTexture(socksCol, 0));
  const bootTex = memo("boot", () => bootTexture());

  const sockMat = mat(sockTex);
  const sockLowMat = mat(sockLowTex);
  const bootMat = mat(bootTex);
  const soleMat = mat(bootTex);
  soleMat.color.set("#06060a");
  const shirtSide = mat(shirtTex.side);
  const shirtShoulder = mat(shirtTex.shoulder);
  const sleeveMat = mat(shirtTex.sleeve);

  const { head: headMesh, skinMat } = buildHead({
    skin: skinCol,
    hair: hairCol,
    hairStyle: hairStyle || "bowl",
    face: (look && look.face) || "normal",
    eye: (look && look.eye) || "#141419",
    glow: !!(look && look.glow),
    translucent,
    accessory: (look && look.accessory) || "none",
    accColor: look && look.accColor,
  });

  // ---- TREN INFERIOR ------------------------------------------------------
  const shortSide = mat(shortsTex.side);
  const shortFaces = [
    shortSide, shortSide,
    mat(shortsTex.waist),
    mat(shortsTex.front),
    mat(shortsTex.front),
    mat(shortsTex.back),
  ];
  const hip = new THREE.Mesh(
    new THREE.BoxGeometry(W.short * U, (R.hipBot - R.torsoBot) * U, W.shortD * U),
    shortFaces
  );
  hip.castShadow = true;
  hip.position.y = (Y(R.torsoBot) + Y(R.hipBot)) / 2;

  const HIP_PIVOT = Y(R.hipBot);
  const KNEE_PIVOT = Y(R.knee);
  const ANKLE_PIVOT = Y(R.ankle);
  const legShortW = (W.short - 0.05) / 2;
  const shortLegFaces = (side) => {
    const outer = mat(shortsTex.side);
    const inner = mat(shortsTex.legSideIn);
    const plain = mat(shortsTex.leg);
    const top = mat(shortsTex.leg);
    return side < 0
      ? [inner, outer, top, plain, plain, plain]
      : [outer, inner, top, plain, plain, plain];
  };
  const makeLeg = (side) => {
    const grp = new THREE.Group();
    const shortLeg = new THREE.Mesh(
      new THREE.BoxGeometry(legShortW * U, (R.shortLegBot - R.hipBot) * U, W.shortD * U),
      shortLegFaces(side)
    );
    shortLeg.castShadow = true;
    shortLeg.position.y = (Y(R.hipBot) + Y(R.shortLegBot)) / 2 - HIP_PIVOT;

    const thigh = seg(R.shortLegBot, R.thighBot, W.thigh, W.thighD, skinMat, HIP_PIVOT);
    const sockUp = seg(R.thighBot, R.knee, W.sock, W.sockD, sockMat, HIP_PIVOT);

    const lower = new THREE.Group();
    lower.position.y = KNEE_PIVOT - HIP_PIVOT;
    const sockLow = seg(R.knee, R.ankle, W.sock * 0.97, W.sockD * 0.97, sockLowMat, KNEE_PIVOT);
    lower.add(sockLow);

    const foot = new THREE.Group();
    foot.position.y = ANKLE_PIVOT - KNEE_PIVOT;
    const boot = seg(R.sockBot, R.footBot, W.boot, W.bootD, bootMat, ANKLE_PIVOT);
    boot.position.z = 0.042 * U;
    const sole = box(W.boot * 1.05 * U, 0.018 * U, W.bootD * 1.03 * U, soleMat);
    sole.position.set(0, Y(0.993) - ANKLE_PIVOT, boot.position.z);
    foot.add(boot, sole);
    lower.add(foot);

    grp.add(shortLeg, thigh, sockUp, lower);
    grp.userData.lower = lower;
    grp.userData.foot = foot;
    return grp;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  const legX = (legShortW / 2 + 0.014) * U;
  legL.position.set(-legX, HIP_PIVOT, 0);
  legR.position.set(legX, HIP_PIVOT, 0);

  // ---- TREN SUPERIOR ------------------------------------------------------
  const upper = new THREE.Group();
  upper.position.y = Y(R.torsoBot);

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(W.torso * U, (R.torsoBot - R.torsoTop) * U, W.torsoD * U),
    [shirtSide, shirtSide, shirtShoulder, shirtShoulder, mat(shirtTex.front), mat(shirtTex.back)]
  );
  torso.castShadow = true;
  torso.position.y = (Y(R.torsoTop) + Y(R.torsoBot)) / 2 - upper.position.y;

  const neck = seg(R.neckTop, R.neckBot, W.neck, W.neckD, skinMat, upper.position.y);

  const head = new THREE.Group();
  head.position.y = Y(R.headBot) - upper.position.y;
  headMesh.position.y = RIG.headCenter - Y(R.headBot);
  head.add(headMesh);

  const SH = Y(R.armTop);
  const ELBOW = Y(R.cuffBot);
  const makeArm = (side) => {
    const grp = new THREE.Group();
    grp.position.set(side * (W.torso / 2 + W.arm / 2) * U, SH - upper.position.y, 0);
    const sleeve = seg(R.armTop, R.sleeveBot, W.arm, W.armD, sleeveMat, SH);
    const cuff = seg(R.sleeveBot, R.cuffBot, W.arm * 1.05, W.armD * 1.04, whiteMat(), SH);
    const fore = new THREE.Group();
    fore.position.y = ELBOW - SH;
    const forearm = seg(R.cuffBot, R.foreBot, W.arm * 0.92, W.armD * 0.92, skinMat, ELBOW);
    const hand = seg(R.foreBot, R.handBot, W.arm * 1.0, W.armD * 1.02, skinMat, ELBOW);
    fore.add(forearm, hand);
    grp.add(sleeve, cuff, fore);
    grp.userData.fore = fore;
    return grp;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  upper.add(torso, neck, armL, armR, head);

  g.add(legL, legR, hip, upper);

  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(0.2 * U, 24),
    new THREE.MeshBasicMaterial({
      color: "#04120a",
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.03;
  contact.renderOrder = 1;
  g.add(contact);

  const bs = BODY_SCALES[bodyType] || BODY_SCALES.normal;
  g.userData = {
    legL, legR, armL, armR, upper, torso, head, contact,
    shorts: [hip, legL.children[0], legR.children[0]],
    armRest: { l: -0.05, r: 0.05 },
    phase: Math.random() * 10,
    lean: 0, gait: 0, run: 0, cad: 0.8,
    bodyScale: bs,
  };
  return g;
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (cur, target, k, dt) => lerp(cur, target, 1 - Math.exp(-k * dt));
const pulse = (w, center, p = 1.4) => Math.max(0, Math.sin(w - center + Math.PI / 2)) ** p;

const cadenceFor = (speed) => clamp(0.72 + 0.098 * speed, 0.72, 2.42);

export function animatePlayer(mesh, speed, dt, sliding = false, opts = {}) {
  const u = mesh.userData;
  const { legL, legR, armL, armR, upper, head, contact } = u;
  const lookYaw = opts.lookYaw || 0;
  const squash = opts.squash || 0;
  const lowL = legL.userData.lower;
  const lowR = legR.userData.lower;
  const footL = legL.userData.foot;
  const footR = legR.userData.foot;
  const foreL = armL.userData.fore;
  const foreR = armR.userData.fore;

  const bs = u.bodyScale || { x: 1, y: 1, z: 1 };
  const sq = 1 - squash * 0.2;
  mesh.scale.set(bs.x * (1 + squash * 0.12), bs.y * sq, bs.z * (1 + squash * 0.12));

  if (contact) {
    contact.position.y = 0.03 - mesh.position.y;
    contact.material.opacity = 0.4 - Math.min(0.26, Math.max(0, mesh.position.y) * 0.6);
    contact.scale.setScalar(1 - Math.min(0.35, Math.max(0, mesh.position.y) * 0.7));
  }

  // ---- Intervenciones de arquero: estirada / palomita / blocaje ------------
  const dive = opts.dive;
  if (dive) {
    const side = opts.diveSide || 1;
    const pose =
      dive === "catch"
        ? { lean: -0.34, roll: 0, arm: 1.75, fore: -0.95, legA: -0.32, legB: -0.18, lift: 0.05 }
        : dive === "parry"
        ? { lean: -0.45, roll: side * 0.55, arm: 2.55, fore: -0.25, legA: -0.5, legB: 0.3, lift: 0.22 }
        : { lean: -0.6, roll: side * 1.15, arm: 2.95, fore: -0.1, legA: -0.75, legB: 0.55, lift: 0.4 };
    upper.rotation.x = damp(upper.rotation.x, pose.lean, 16, dt);
    upper.rotation.z = damp(upper.rotation.z, pose.roll, 16, dt);
    upper.rotation.y = damp(upper.rotation.y, -side * 0.2, 14, dt);
    armL.rotation.x = damp(armL.rotation.x, pose.arm, 18, dt);
    armR.rotation.x = damp(armR.rotation.x, pose.arm, 18, dt);
    armL.rotation.z = damp(armL.rotation.z, -0.3 + side * 0.2, 14, dt);
    armR.rotation.z = damp(armR.rotation.z, 0.3 + side * 0.2, 14, dt);
    foreL.rotation.x = damp(foreL.rotation.x, pose.fore, 16, dt);
    foreR.rotation.x = damp(foreR.rotation.x, pose.fore, 16, dt);
    legL.rotation.x = damp(legL.rotation.x, pose.legA, 16, dt);
    legR.rotation.x = damp(legR.rotation.x, pose.legB, 16, dt);
    legL.rotation.z = damp(legL.rotation.z, -side * 0.22, 16, dt);
    legR.rotation.z = damp(legR.rotation.z, -side * 0.22, 16, dt);
    lowL.rotation.x = damp(lowL.rotation.x, -0.5, 16, dt);
    lowR.rotation.x = damp(lowR.rotation.x, -0.2, 16, dt);
    footL.rotation.x = damp(footL.rotation.x, 0.3, 16, dt);
    footR.rotation.x = damp(footR.rotation.x, 0.3, 16, dt);
    head.rotation.y = damp(head.rotation.y, lookYaw * 0.6, 12, dt);
    head.rotation.x = damp(head.rotation.x, -0.2, 14, dt);
    mesh.position.y = damp(mesh.position.y, pose.lift * U, 14, dt);
    return;
  }

  if (sliding) {
    upper.rotation.x = damp(upper.rotation.x, -Math.PI * 0.4, 20, dt);
    upper.rotation.z = damp(upper.rotation.z, 0, 20, dt);
    upper.rotation.y = damp(upper.rotation.y, 0, 20, dt);
    legL.rotation.x = damp(legL.rotation.x, -1.25, 20, dt);
    legR.rotation.x = damp(legR.rotation.x, -0.45, 20, dt);
    legL.rotation.z = damp(legL.rotation.z, 0, 20, dt);
    legR.rotation.z = damp(legR.rotation.z, 0, 20, dt);
    lowL.rotation.x = damp(lowL.rotation.x, 0.15, 20, dt);
    lowR.rotation.x = damp(lowR.rotation.x, 1.05, 20, dt);
    footL.rotation.x = damp(footL.rotation.x, 0.2, 20, dt);
    footR.rotation.x = damp(footR.rotation.x, 0.3, 20, dt);
    armL.rotation.x = damp(armL.rotation.x, 1.15, 20, dt);
    armR.rotation.x = damp(armR.rotation.x, 1.4, 20, dt);
    foreL.rotation.x = damp(foreL.rotation.x, -0.5, 20, dt);
    foreR.rotation.x = damp(foreR.rotation.x, -0.7, 20, dt);
    head.rotation.y = damp(head.rotation.y, lookYaw * 0.5, 10, dt);
    head.rotation.x = damp(head.rotation.x, 0.28, 14, dt);
    mesh.position.y = damp(mesh.position.y, -0.1 * U, 18, dt);
    return;
  }

  const gaitT = clamp(speed / 2.4, 0, 1);
  const runT = clamp((speed - 4.6) / 7.4, 0, 1);
  const sprintT = clamp((speed - 12.5) / 5, 0, 1);
  u.gait = damp(u.gait, gaitT, 7, dt);
  u.run = damp(u.run, runT, 5, dt);
  const gait = u.gait;
  const run = u.run;
  const idle = 1 - gait;

  u.cad = damp(u.cad, cadenceFor(speed), 4.5, dt);
  u.phase += u.cad * Math.PI * 2 * dt;
  const w = u.phase;
  const s = Math.sin(w);

  const stanceL = pulse(w, Math.PI, 1.0);
  const stanceR = pulse(w, 0, 1.0);

  const hipAmp = 0.2 + 0.34 * gait + 0.36 * run + 0.12 * sprintT;
  const swing = (ph) => Math.sin(ph) + 0.14 * Math.sin(2 * ph);
  const hipBias = 0.06 * gait + 0.08 * run;
  const hipL = swing(w) * hipAmp + hipBias;
  const hipR = swing(w + Math.PI) * hipAmp + hipBias;

  const kneeSwing = 0.5 + 0.6 * gait + 0.95 * run + 0.35 * sprintT;
  const toeOffL = Math.PI * 1.5 + 0.55;
  const toeOffR = Math.PI * 0.5 + 0.55;
  const flightL = pulse(w, toeOffL, 1.7);
  const flightR = pulse(w, toeOffR, 1.7);
  const loadL = pulse(w, Math.PI * 0.72, 3) * (0.1 + 0.24 * run);
  const loadR = pulse(w, Math.PI * 1.72, 3) * (0.1 + 0.24 * run);
  const kneeL = -(kneeSwing * flightL + loadL) * gait;
  const kneeR = -(kneeSwing * flightR + loadR) * gait;

  legL.rotation.x = hipL * gait;
  legR.rotation.x = hipR * gait;
  legL.rotation.z = -0.02 * gait;
  legR.rotation.z = 0.02 * gait;
  lowL.rotation.x = kneeL;
  lowR.rotation.x = kneeR;

  const push = 0.26 + 0.34 * run;
  const ankleFor = (hipR2, knee, stance, toeOff, flight) =>
    -(hipR2 + knee) * stance + push * pulse(w, toeOff - 0.5, 2.2) - 0.16 * flight * gait;
  footL.rotation.x = ankleFor(legL.rotation.x, kneeL, stanceL, toeOffL, flightL);
  footR.rotation.x = ankleFor(legR.rotation.x, kneeR, stanceR, toeOffR, flightR);

  const armAmp = 0.16 + 0.22 * gait + 0.5 * run + 0.16 * sprintT;
  const elbow = -(0.06 + 0.4 * gait + 0.85 * run);
  const breathe = Math.sin(u.phase * 0.32) * 0.045 * idle;
  armL.rotation.x = -swing(w) * armAmp * gait + breathe;
  armR.rotation.x = -swing(w + Math.PI) * armAmp * gait - breathe;
  armL.rotation.z = damp(armL.rotation.z, u.armRest.l - 0.11 * run, 10, dt);
  armR.rotation.z = damp(armR.rotation.z, u.armRest.r + 0.11 * run, 10, dt);
  armL.rotation.y = 0.14 * run * Math.max(0, s);
  armR.rotation.y = -0.14 * run * Math.max(0, -s);
  foreL.rotation.x = elbow - Math.max(0, -s) * 0.35 * run;
  foreR.rotation.x = elbow - Math.max(0, s) * 0.35 * run;

  upper.rotation.x = damp(upper.rotation.x, 0.03 * gait + 0.17 * run + 0.05 * sprintT, 9, dt);
  upper.rotation.z = -s * (0.018 * gait + 0.04 * run);
  upper.rotation.y = -s * (0.05 * gait + 0.1 * run);
  head.rotation.y = damp(head.rotation.y, s * 0.03 * gait + lookYaw * 0.42, 11, dt);
  head.rotation.x = damp(head.rotation.x, -0.03 * gait - 0.14 * run, 11, dt);

  const bounce = (0.5 + 0.5 * Math.cos(2 * w)) * (0.012 * U * gait + 0.03 * U * run);
  mesh.position.y = damp(mesh.position.y, bounce, 22, dt);
}
