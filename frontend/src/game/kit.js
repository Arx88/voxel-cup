import * as THREE from "three";

const cv = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const tex = (c, repeatWrap = false) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 16;
  if (repeatWrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

// Sube saturación para look 4K vibrante
const saturate = (hex, boost = 0.28) => {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s + boost), hsl.l);
  return `#${c.getHexString()}`;
};

// Tela voxel plana: color sólido + micro sombreado vertical mínimo.
const cloth = (g, W, H, color) => {
  const base = saturate(color, 0.16);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "rgba(255,255,255,0.06)");
  gr.addColorStop(0.6, "rgba(255,255,255,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.08)");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
};

const shade = (g, W, H) => {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "rgba(255,255,255,0.05)");
  gr.addColorStop(0.62, "rgba(255,255,255,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.1)");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
};

// Dibuja el diseño de la equipación sobre una cara de tela
const pattern = (g, W, H, kit, kind = "body") => {
  cloth(g, W, H, kit.shirt);
  const alt = saturate(kit.alt || kit.shirt, 0.18);
  const p = kit.pattern || "solid";
  g.fillStyle = alt;
  if (p === "stripesV") {
    const n = kind === "body" ? 7 : 3;
    const sw = W / n;
    for (let i = 1; i < n; i += 2) g.fillRect(i * sw, 0, sw, H);
  } else if (p === "hoops") {
    const n = kind === "body" ? 7 : 4;
    const sh = H / n;
    for (let i = 1; i < n; i += 2) g.fillRect(0, i * sh, W, sh);
  } else if (p === "bandH") {
    g.fillRect(0, H * 0.42, W, H * 0.18);
  } else if (p === "sash") {
    if (kind === "body") {
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate(-0.62);
      g.fillRect(-W, -H * 0.085, W * 2, H * 0.17);
      g.restore();
    } else {
      g.fillRect(0, 0, W, H);
    }
  }
  shade(g, W, H);
};

const num = (g, W, value, size, cy, color, outline) => {
  g.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  if (outline) {
    g.strokeStyle = outline;
    g.lineWidth = size * 0.1;
    g.strokeText(String(value), W / 2, cy);
  }
  g.fillStyle = color;
  g.fillText(String(value), W / 2, cy);
};

// Contraste del dorsal según el color dominante de la camiseta
const numberInk = (kit) => {
  const c = new THREE.Color(kit.shirt);
  const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  return lum > 0.62
    ? { fill: "rgba(20,20,28,0.94)", stroke: "rgba(255,255,255,0.35)" }
    : { fill: "rgba(255,255,255,0.95)", stroke: "rgba(0,0,0,0.28)" };
};

// ---- Camiseta con diseño de equipación
export function shirtTextures(kit, number) {
  const W = 384;
  const H = 420;
  const ink = numberInk(kit);

  const front = cv(W, H);
  pattern(front.getContext("2d"), W, H, kit, "body");

  const back = cv(W, H);
  {
    const g = back.getContext("2d");
    pattern(g, W, H, kit, "body");
    num(g, W, number, 150, H * 0.46, ink.fill, ink.stroke);
  }

  const side = cv(96, 420);
  pattern(side.getContext("2d"), 96, 420, kit, "side");

  const shoulder = cv(96, 96);
  pattern(shoulder.getContext("2d"), 96, 96, kit, "side");

  const sleeve = cv(64, 96);
  pattern(sleeve.getContext("2d"), 64, 96, kit, "sleeve");

  return {
    front: tex(front),
    back: tex(back),
    side: tex(side),
    shoulder: tex(shoulder),
    sleeve: tex(sleeve),
  };
}

// Textura plana reutilizable (para vivos blancos: puños, banda de short/medias)
export function flatTexture(color) {
  const c = cv(32, 32);
  const g = c.getContext("2d");
  cloth(g, 32, 32, color);
  return tex(c);
}

// ---- Short con franja del equipo en los costados
export function shortsTextures(base, accent) {
  const W = 256;
  const H = 144;
  const accentSat = saturate(accent, 0.2);

  const drawFace = (g) => {
    cloth(g, W, H, base);
    g.fillStyle = accentSat;
    g.fillRect(0, 0, 15, H);
    g.fillRect(W - 15, 0, 15, H);
  };

  const front = cv(W, H);
  drawFace(front.getContext("2d"));
  const back = cv(W, H);
  drawFace(back.getContext("2d"));

  const side = cv(128, 144);
  {
    const g = side.getContext("2d");
    cloth(g, 128, 144, base);
    g.fillStyle = accentSat;
    g.fillRect(48, 0, 32, 144);
    g.fillRect(0, 0, 128, 9);
  }

  const waist = cv(128, 128);
  {
    const g = waist.getContext("2d");
    cloth(g, 128, 128, base);
    g.fillStyle = accentSat;
    g.fillRect(0, 0, 128, 128);
  }

  const leg = cv(128, 96);
  cloth(leg.getContext("2d"), 128, 96, base);
  const legSideIn = cv(96, 96);
  cloth(legSideIn.getContext("2d"), 96, 96, base);

  return {
    front: tex(front),
    back: tex(back),
    side: tex(side),
    waist: tex(waist),
    leg: tex(leg),
    legSideIn: tex(legSideIn),
  };
}

// ---- Cara: variantes voxel con color de ojos y brillo opcional
export function faceTexture(skin, opts = {}) {
  const S = 256;
  const face = opts.face || "normal";
  const eyeCol = opts.eye || "#141419";
  const glow = !!opts.glow;
  const c = cv(S, S);
  const g = c.getContext("2d");
  const skinSat = saturate(skin, 0.1);
  g.fillStyle = skinSat;
  g.fillRect(0, 0, S, S);
  const gr = g.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, "rgba(0,0,0,0.09)");
  gr.addColorStop(0.42, "rgba(0,0,0,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.06)");
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);

  const ew = Math.round(0.123 * S);
  const eh = Math.round(0.321 * S);
  const ey = Math.round(0.447 * S);
  const r = 5;
  const roundRect = (x, y, w, h, rad) => {
    g.beginPath();
    g.moveTo(x + rad, y);
    g.arcTo(x + w, y, x + w, y + h, rad);
    g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad);
    g.arcTo(x, y, x + w, y, rad);
    g.closePath();
    g.fill();
  };
  const withGlow = (draw) => {
    if (glow) {
      g.save();
      g.shadowColor = eyeCol;
      g.shadowBlur = 26;
      draw();
      draw();
      g.restore();
    }
    draw();
  };
  const eye = (cx, w = ew, h = eh, y = ey) =>
    withGlow(() => roundRect(cx - w / 2, y, w, h, r));

  g.fillStyle = eyeCol;
  const lx = S / 2 - 0.198 * S;
  const rx = S / 2 + 0.198 * S;

  if (face === "cyclops") {
    eye(S / 2, ew * 2.1, eh * 0.95, ey);
    g.fillStyle = "rgba(255,255,255,0.85)";
    roundRect(S / 2 - ew * 0.5, ey + eh * 0.16, ew * 0.5, eh * 0.28, 4);
  } else if (face === "visor") {
    g.fillStyle = "#101018";
    roundRect(S * 0.16, ey - 8, S * 0.68, eh * 0.86, 10);
    g.fillStyle = eyeCol;
    withGlow(() => roundRect(S * 0.19, ey + 6, S * 0.62, eh * 0.24, 6));
  } else if (face === "skull") {
    g.fillStyle = "#0d0d12";
    roundRect(lx - ew * 0.85, ey - 6, ew * 1.7, eh * 0.9, 8);
    roundRect(rx - ew * 0.85, ey - 6, ew * 1.7, eh * 0.9, 8);
    g.fillStyle = eyeCol;
    if (glow) {
      g.save();
      g.shadowColor = eyeCol;
      g.shadowBlur = 22;
      roundRect(lx - ew * 0.3, ey + eh * 0.2, ew * 0.6, eh * 0.3, 4);
      roundRect(rx - ew * 0.3, ey + eh * 0.2, ew * 0.6, eh * 0.3, 4);
      g.restore();
    }
    // dientes
    g.fillStyle = "#0d0d12";
    for (let i = 0; i < 6; i++) g.fillRect(S * 0.33 + i * S * 0.058, S * 0.82, S * 0.03, S * 0.07);
    g.fillRect(S * 0.3, S * 0.8, S * 0.4, S * 0.03);
  } else if (face === "zombie") {
    eye(lx, ew * 1.25, eh * 0.72, ey + 6);
    eye(rx, ew * 0.85, eh, ey - 6);
    g.fillStyle = "rgba(20,20,25,0.85)";
    g.fillRect(S * 0.32, S * 0.82, S * 0.36, S * 0.035);
    for (let i = 0; i < 5; i++) {
      g.fillRect(S * 0.34 + i * S * 0.07, S * 0.79, S * 0.014, S * 0.1);
    }
  } else if (face === "feliz") {
    eye(lx, ew, eh * 0.7, ey + 10);
    eye(rx, ew, eh * 0.7, ey + 10);
    g.strokeStyle = "rgba(20,20,25,0.8)";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(S / 2, S * 0.72, S * 0.16, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  } else if (face === "furia") {
    eye(lx, ew, eh * 0.62, ey + 24);
    eye(rx, ew, eh * 0.62, ey + 24);
    g.fillStyle = "rgba(20,20,25,0.9)";
    g.save();
    g.translate(lx, ey + 8);
    g.rotate(0.32);
    g.fillRect(-ew * 0.85, -8, ew * 1.7, 14);
    g.restore();
    g.save();
    g.translate(rx, ey + 8);
    g.rotate(-0.32);
    g.fillRect(-ew * 0.85, -8, ew * 1.7, 14);
    g.restore();
  } else if (face === "serio") {
    eye(lx, ew * 1.05, eh * 0.5, ey + 26);
    eye(rx, ew * 1.05, eh * 0.5, ey + 26);
    g.fillStyle = "rgba(20,20,25,0.75)";
    g.fillRect(S * 0.36, S * 0.8, S * 0.28, 10);
  } else {
    eye(lx);
    eye(rx);
  }
  return tex(c);
}

export function skinTexture(skin) {
  const c = cv(64, 64);
  const g = c.getContext("2d");
  const sat = saturate(skin, 0.1);
  g.fillStyle = sat;
  g.fillRect(0, 0, 64, 64);
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, "rgba(255,255,255,0.04)");
  gr.addColorStop(1, "rgba(0,0,0,0.06)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}

export function hairTexture(hair) {
  const c = cv(64, 64);
  const g = c.getContext("2d");
  g.fillStyle = hair;
  g.fillRect(0, 0, 64, 64);
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, "rgba(255,255,255,0.05)");
  gr.addColorStop(1, "rgba(0,0,0,0.07)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return tex(c);
}

export function sockTexture(color, band = true) {
  const c = cv(64, 128);
  const g = c.getContext("2d");
  cloth(g, 64, 128, color);
  if (band) {
    g.fillStyle = "#f4f7fb";
    g.fillRect(0, 0, 64, 85);
    g.fillStyle = "rgba(0,0,0,0.07)";
    g.fillRect(0, 85, 64, 3);
  }
  return tex(c);
}

export function bootTexture() {
  const c = cv(64, 32);
  const g = c.getContext("2d");
  g.fillStyle = "#101016";
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = "rgba(255,255,255,0.09)";
  g.fillRect(0, 0, 64, 5);
  return tex(c);
}
