import * as THREE from "three";
import banner1 from "../assets/banners/banner1.png";
import banner2 from "../assets/banners/banner2.png";
import banner3 from "../assets/banners/banner3.png";
import banner4 from "../assets/banners/banner4.png";
import banner5 from "../assets/banners/banner5.png";

const cv = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export function ballTexture() {
  const c = cv(512, 512);
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(240, 210, 30, 256, 256, 280);
  rg.addColorStop(0, "#ffffff");
  rg.addColorStop(0.72, "#f2f2f2");
  rg.addColorStop(1, "#d2d2d2");
  g.fillStyle = rg;
  g.fillRect(0, 0, 512, 512);

  const drawPent = (x, y, r, rot = 0) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + rot;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
    g.fill();
  };
  g.fillStyle = "#101319";
  drawPent(256, 256, 58);
  [
    [96, 104, 44, 0.2], [402, 96, 46, -0.3],
    [136, 384, 44, 0.4], [404, 402, 46, -0.2],
    [72, 246, 40, 0.1], [438, 250, 40, -0.1],
    [232, 52, 34, 0.3], [278, 462, 36, -0.2],
  ].forEach(([x, y, r, rot]) => drawPent(x, y, r, rot));

  g.strokeStyle = "rgba(0,0,0,0.3)";
  g.lineWidth = 3;
  const link = (a, b) => {
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  };
  link([256, 256], [96, 104]);
  link([256, 256], [402, 96]);
  link([256, 256], [136, 384]);
  link([256, 256], [404, 402]);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function numberTexture(shirt, number) {
  const c = cv(160, 160);
  const g = c.getContext("2d");
  g.fillStyle = shirt;
  g.fillRect(0, 0, 160, 160);
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.font = "bold 118px 'Arial Black', Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(number), 80, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft comet-shaped trail so fast balls read like the reference streak
export function trailTexture() {
  const c = cv(256, 64);
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 256, 0);
  gr.addColorStop(0, "rgba(255,255,255,0)");
  gr.addColorStop(0.55, "rgba(255,255,255,0.35)");
  gr.addColorStop(1, "rgba(255,255,255,0.95)");
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(0, 32);
  g.quadraticCurveTo(140, 2, 256, 8);
  g.lineTo(256, 56);
  g.quadraticCurveTo(140, 62, 0, 32);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Flat 2D down-pointing triangle used as a billboard over the active player
export function arrowTexture() {
  const c = cv(128, 128);
  const g = c.getContext("2d");
  g.beginPath();
  g.moveTo(12, 20);
  g.lineTo(116, 20);
  g.lineTo(64, 112);
  g.closePath();
  g.fillStyle = "#e01323";
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = "#7d0410";
  g.stroke();
  g.beginPath();
  g.moveTo(26, 30);
  g.lineTo(64, 30);
  g.lineTo(45, 62);
  g.closePath();
  g.fillStyle = "rgba(255,255,255,0.28)";
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------------------------------------------------------------------
   LED BANNERS - real artwork cropped from the reference design sheet
--------------------------------------------------------------------------- */

const BANNER_SRC = [banner1, banner2, banner3, banner4, banner5];

// One texture per reference design. Repeats horizontally along the boards.
export function bannerTextures(repeatX = 1) {
  const loader = new THREE.TextureLoader();
  return BANNER_SRC.map((src) => {
    const t = loader.load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(repeatX, 1);
    t.anisotropy = 8;
    return t;
  });
}

export function bannerTexture() {
  return bannerTextures()[0];
}

// Dominant colour of each banner design, used for the light spill on the grass
export const BANNER_ACCENTS = ["#ff2436", "#1a6cff", "#ff2436", "#2f7bff", "#22c93a"];

// Bright highlight that sweeps along the LED boards like a real stadium screen
export function sheenTexture() {
  const c = cv(512, 16);
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 512, 0);
  gr.addColorStop(0, "rgba(255,255,255,0)");
  gr.addColorStop(0.34, "rgba(255,255,255,0)");
  gr.addColorStop(0.44, "rgba(255,255,255,0.35)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.85)");
  gr.addColorStop(0.56, "rgba(255,255,255,0.35)");
  gr.addColorStop(0.66, "rgba(255,255,255,0)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Fine horizontal LED scanlines layered over the artwork for panel texture
export function ledGridTexture() {
  const c = cv(8, 64);
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0)";
  g.fillRect(0, 0, 8, 64);
  g.fillStyle = "rgba(0,0,0,0.5)";
  for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 8, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Diamond (rhombus) mesh like a real goal net, with knots at the crossings
export function netTexture(step = 32) {
  const S = 512;
  const c = cv(S, S);
  const g = c.getContext("2d");
  g.clearRect(0, 0, S, S);
  g.lineCap = "round";

  const strand = (x1, y1, x2, y2) => {
    g.strokeStyle = "rgba(0,0,0,0.28)";
    g.lineWidth = 5.5;
    g.beginPath();
    g.moveTo(x1 + 1.5, y1 + 1.5);
    g.lineTo(x2 + 1.5, y2 + 1.5);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.98)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };

  for (let i = -S; i <= S * 2; i += step) {
    strand(i, 0, i + S, S);
    strand(i, 0, i - S, S);
  }
  // knots
  g.fillStyle = "rgba(255,255,255,1)";
  for (let y = 0; y <= S; y += step) {
    for (let x = (y / step) % 2 === 0 ? 0 : step / 2; x <= S; x += step) {
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
