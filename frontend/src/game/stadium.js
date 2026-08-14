import * as THREE from "three";
import { FIELD } from "./config";
import {
  bannerTextures,
  netTexture,
  sheenTexture,
  ledGridTexture,
  BANNER_ACCENTS,
} from "./textures";

const PPU = 26;

function pitchTexture() {
  const W = FIELD.L * PPU;
  const H = FIELD.W * PPU;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");

  // Wide mown bands like the reference (14 across the length)
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 === 0 ? "#5ce033" : "#2aab1d";
    g.fillRect((i * W) / bands, 0, W / bands + 1, H);
  }
  for (let i = 0; i < bands; i++) {
    const x0 = (i * W) / bands;
    const grd = g.createLinearGradient(x0, 0, x0 + W / bands, 0);
    grd.addColorStop(0, "rgba(255,255,255,0.05)");
    grd.addColorStop(0.5, "rgba(0,0,0,0.04)");
    grd.addColorStop(1, "rgba(255,255,255,0.05)");
    g.fillStyle = grd;
    g.fillRect(x0, 0, W / bands + 1, H);
  }
  for (let i = 0; i < 26000; i++) {
    const a = Math.random() * 0.045;
    g.fillStyle = Math.random() > 0.5 ? `rgba(190,255,150,${a})` : `rgba(0,40,0,${a * 0.7})`;
    g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
  }
  const rg = g.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.72);
  rg.addColorStop(0, "rgba(180,255,110,0.07)");
  rg.addColorStop(1, "rgba(0,32,0,0.09)");
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);

  const lw = 0.3 * PPU;
  g.strokeStyle = "#ffffff";
  g.lineWidth = lw;
  g.fillStyle = "#ffffff";
  const pad = 1.8 * PPU;
  g.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  g.beginPath();
  g.moveTo(W / 2, pad);
  g.lineTo(W / 2, H - pad);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 7.6 * PPU, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 0.5 * PPU, 0, Math.PI * 2);
  g.fill();

  [
    { d: 14 * PPU, h: 28 * PPU },
    { d: 5.5 * PPU, h: 15 * PPU },
  ].forEach(({ d, h }) => {
    g.strokeRect(pad, H / 2 - h / 2, d, h);
    g.strokeRect(W - pad - d, H / 2 - h / 2, d, h);
  });
  [pad + 9.5 * PPU, W - pad - 9.5 * PPU].forEach((x) => {
    g.beginPath();
    g.arc(x, H / 2, 0.5 * PPU, 0, Math.PI * 2);
    g.fill();
  });
  g.beginPath();
  g.arc(pad + 9.5 * PPU, H / 2, 6.8 * PPU, -Math.PI / 2.7, Math.PI / 2.7);
  g.stroke();
  g.beginPath();
  g.arc(W - pad - 9.5 * PPU, H / 2, 6.8 * PPU, Math.PI - Math.PI / 2.7, Math.PI + Math.PI / 2.7);
  g.stroke();
  [
    [pad, pad, 0, Math.PI / 2],
    [W - pad, pad, Math.PI / 2, Math.PI],
    [W - pad, H - pad, Math.PI, Math.PI * 1.5],
    [pad, H - pad, Math.PI * 1.5, Math.PI * 2],
  ].forEach(([x, y, a1, a2]) => {
    g.beginPath();
    g.arc(x, y, 1.2 * PPU, a1, a2);
    g.stroke();
  });

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Sólo las marcas, en un canvas transparente: se suma sobre el césped para que
// las líneas tengan un leve emisivo sin lavar el color del pasto.
function lineGlowTexture() {
  const W = FIELD.L * PPU;
  const H = FIELD.W * PPU;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.clearRect(0, 0, W, H);
  g.strokeStyle = "rgba(210,240,255,0.85)";
  g.fillStyle = "rgba(210,240,255,0.85)";
  g.lineWidth = 0.26 * PPU;
  g.shadowColor = "rgba(180,225,255,0.9)";
  g.shadowBlur = 0.5 * PPU;
  const pad = 1.8 * PPU;
  g.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
  g.beginPath();
  g.moveTo(W / 2, pad);
  g.lineTo(W / 2, H - pad);
  g.stroke();
  g.beginPath();
  g.arc(W / 2, H / 2, 7.6 * PPU, 0, Math.PI * 2);
  g.stroke();
  [
    { d: 14 * PPU, h: 28 * PPU },
    { d: 5.5 * PPU, h: 15 * PPU },
  ].forEach(({ d, h }) => {
    g.strokeRect(pad, H / 2 - h / 2, d, h);
    g.strokeRect(W - pad - d, H / 2 - h / 2, d, h);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}


// Quad from 4 corners (a=bottom-left, b=bottom-right, c=top-right, d=top-left)
function quad(a, b, c, d) {
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([
    a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z,
    a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z,
  ]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  geo.setAttribute("position", new THREE.BufferAttribute(v, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

// Broadcast-quality white goal: rounded frame, braced back and a real diamond net
function createGoal(dir) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
  const braceMat = new THREE.MeshLambertMaterial({ color: "#eef4ff" });
  const half = FIELD.GOAL_W / 2;
  const h = FIELD.GOAL_H;
  const depth = 2.9;
  const backH = h * 0.72;
  const r = 0.13;
  const bx = -dir * depth; // back plane x

  const tube = (radius, len, axis, x, y, z, mtl = frameMat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 14), mtl);
    if (axis === "z") m.rotation.x = Math.PI / 2;
    if (axis === "x") m.rotation.z = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  // front frame
  tube(r, h, "y", 0, h / 2, -half);
  tube(r, h, "y", 0, h / 2, half);
  tube(r, FIELD.GOAL_W + r * 2, "z", 0, h, 0);
  // rounded post caps
  [-half, half].forEach((z) => {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), frameMat);
    cap.position.set(0, h, z);
    g.add(cap);
  });
  // back frame + braces
  tube(r * 0.75, backH, "y", bx, backH / 2, -half);
  tube(r * 0.75, backH, "y", bx, backH / 2, half);
  tube(r * 0.7, FIELD.GOAL_W, "z", bx, backH, 0, braceMat);
  tube(r * 0.7, FIELD.GOAL_W, "z", bx, 0.06, 0, braceMat);
  [-half, half].forEach((z) => {
    const len = Math.hypot(depth, h - backH);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.65, r * 0.65, len, 10), braceMat);
    bar.position.set(bx / 2, (h + backH) / 2, z);
    bar.rotation.z = Math.PI / 2;
    bar.rotation.y = Math.atan2(h - backH, depth) * (dir > 0 ? 1 : -1);
    g.add(bar);
  });

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const netMat = (uRepeat, vRepeat, opacity = 0.92) => {
    const t = netTexture();
    t.repeat.set(uRepeat, vRepeat);
    return new THREE.MeshLambertMaterial({
      map: t,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      alphaTest: 0.04,
    });
  };
  const CELL = 0.26;
  const nets = [];
  const panel = (a, b, c, d, w, hh, op) => {
    const m = new THREE.Mesh(quad(a, b, c, d), netMat(w / CELL / 16, hh / CELL / 16, op));
    m.renderOrder = 2;
    g.add(m);
    nets.push(m);
    return m;
  };

  // back net (slight outward sag at the bottom)
  const sag = -dir * 0.35;
  panel(
    V(bx + sag, 0.02, -half),
    V(bx + sag, 0.02, half),
    V(bx, backH, half),
    V(bx, backH, -half),
    FIELD.GOAL_W,
    backH
  );
  // upper back panel from the back bar up to the crossbar line
  panel(
    V(bx, backH, -half),
    V(bx, backH, half),
    V(0, h, half),
    V(0, h, -half),
    FIELD.GOAL_W,
    Math.hypot(depth, h - backH)
  );
  // side nets (trapezoids)
  [-half, half].forEach((z) => {
    panel(
      V(bx + sag, 0.02, z),
      V(0, 0.02, z),
      V(0, h, z),
      V(bx, backH, z),
      depth,
      h,
      0.85
    );
  });
  // floor net so the ball settles inside the goal
  panel(
    V(bx + sag, 0.02, -half),
    V(0, 0.03, -half),
    V(0, 0.03, half),
    V(bx + sag, 0.02, half),
    depth,
    FIELD.GOAL_W,
    0.7
  );

  g.userData = {
    nets,
    dir,
    base: nets.map((m) => m.position.clone()),
    ripple: 0,
    rippleT: 0,
  };
  return g;
}

// La red guarda un resorte amortiguado: al recibir el gol se hincha y vibra
export function rippleNet(scene, side, power = 1) {
  const goals = scene.userData.goals || [];
  const g = goals.find((it) => Math.sign(it.position.x) === Math.sign(side)) || goals[0];
  if (!g) return;
  g.userData.ripple = Math.min(1.4, (g.userData.ripple || 0) + power);
  g.userData.rippleT = 0;
}

export function updateNets(scene, dt) {
  (scene.userData.goals || []).forEach((g) => {
    const u = g.userData;
    if (!u.nets) return;
    if (!(u.ripple > 0)) {
      if (u.settled) return;
      u.nets.forEach((m, i) => m.position.set(u.base[i].x, u.base[i].y, u.base[i].z));
      u.settled = true;
      return;
    }
    u.settled = false;
    u.rippleT += dt;
    u.ripple = Math.max(0, u.ripple - dt * 1.6);
    const s = Math.sin(u.rippleT * 26) * u.ripple;
    u.nets.forEach((m, i) => {
      const b = u.base[i];
      const ph = Math.sin(u.rippleT * 26 + i * 1.3) * u.ripple;
      m.position.set(b.x + u.dir * -0.42 * ph, b.y + 0.1 * s * (i % 2 ? 1 : -1), b.z + 0.08 * ph);
    });
  });
}

function ledBoards(scene) {
  const boards = [];
  const H = 2.6;

  const make = (w, x, z, ry, rep, phase, startIdx) => {
    const layers = bannerTextures(rep);
    const dark = () => new THREE.MeshBasicMaterial({ color: "#03071a" });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(w, H, 0.35), [
      dark(), dark(), dark(), dark(), dark(), dark(),
    ]);
    shell.position.set(x, H / 2, z);
    shell.rotation.y = ry;
    scene.add(shell);

    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const faceGeo = new THREE.PlaneGeometry(w, H);
    const idx = startIdx % layers.length;
    const next = (idx + 1) % layers.length;
    const matA = new THREE.MeshBasicMaterial({ map: layers[idx], toneMapped: false });
    const matB = new THREE.MeshBasicMaterial({
      map: layers[next],
      toneMapped: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    // LED scanline grid + travelling sheen sit on top of the artwork
    const gridTex = ledGridTexture();
    gridTex.repeat.set(1, H * 9);
    const matGrid = new THREE.MeshBasicMaterial({
      map: gridTex,
      toneMapped: false,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const sheenTex = sheenTexture();
    const matSheen = new THREE.MeshBasicMaterial({
      map: sheenTex,
      toneMapped: false,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    [matA, matB, matGrid, matSheen].forEach((m, i) => {
      const f = new THREE.Mesh(faceGeo, m);
      f.renderOrder = 3 + i;
      f.rotation.y = ry;
      f.position.set(x, H / 2, z).addScaledVector(n, 0.181 + i * 0.01);
      scene.add(f);
    });

    // coloured light spill on the grass in front of the board
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 4),
      new THREE.MeshBasicMaterial({
        color: BANNER_ACCENTS[idx],
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.rotation.z = -ry;
    glow.position.set(x, 0.03, z).addScaledVector(n, 2.2);
    scene.add(glow);

    boards.push({
      layers,
      matA,
      matB,
      matSheen,
      glow,
      idx,
      next,
      fade: 0,
      timer: 5 + phase,
      phase,
      speed: 0.8 + Math.random() * 0.5,
      sheenPos: Math.random(),
      flash: 0,
    });
  };

  const L = FIELD.L + 11;
  const W = FIELD.W + 11;
  make(L, 0, -W / 2, 0, 2, 0, 1);
  make(L, 0, W / 2, Math.PI, 2, 1.1, 3);
  make(W, -L / 2, 0, -Math.PI / 2, 1.3, 2.2, 0);
  make(W, L / 2, 0, Math.PI / 2, 1.3, 3.3, 4);

  scene.userData.leds = boards;
}

// Celebration burst: every board blows out to white then settles back
export function flashLedBoards(scene, strength = 1) {
  (scene.userData.leds || []).forEach((b) => {
    b.flash = strength;
    b.sheenPos = 0;
  });
}

const _accent = new THREE.Color();

// Scrolls the LED content, sweeps a sheen highlight, pulses the brightness and
// cross-fades between the five banner designs.
export function updateLedBoards(scene, time, dt) {
  const boards = scene.userData.leds;
  if (!boards) return;
  boards.forEach((b) => {
    const off = -time * 0.06 * b.speed;
    b.matA.map.offset.x = off;
    b.matB.map.offset.x = off;

    // travelling highlight
    b.sheenPos = (b.sheenPos + dt * (0.34 + b.flash * 1.6)) % 1;
    b.matSheen.map.offset.x = -b.sheenPos;
    b.matSheen.opacity = 0.24 + b.flash * 0.7;

    if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 1.6);

    const pulse = 0.9 + Math.sin(time * 3 + b.phase) * 0.1 + b.flash * 0.9;
    b.matA.color.setScalar(pulse);
    b.matB.color.setScalar(pulse);

    // glow colour follows the banner currently on screen
    _accent.set(BANNER_ACCENTS[b.idx]);
    if (b.fade > 0) _accent.lerp(new THREE.Color(BANNER_ACCENTS[b.next]), b.fade);
    b.glow.material.color.lerp(_accent, 1 - Math.exp(-4 * dt));
    b.glow.material.opacity = 0.16 + Math.sin(time * 3 + b.phase) * 0.06 + b.flash * 0.4;

    if (b.fade === 0) {
      b.timer -= dt;
      if (b.timer <= 0) {
        b.fade = 0.001;
        b.sheenPos = 0.15;
      }
    } else {
      b.fade = Math.min(1, b.fade + dt / 0.55);
      b.matB.opacity = b.fade * b.fade;
      if (b.fade >= 1) {
        b.idx = b.next;
        b.next = (b.idx + 1) % b.layers.length;
        b.matA.map = b.layers[b.idx];
        b.matB.map = b.layers[b.next];
        b.matA.needsUpdate = true;
        b.matB.needsUpdate = true;
        b.matB.opacity = 0;
        b.fade = 0;
        b.timer = 5.5 + Math.random() * 2.5;
      }
    }
  });
}

function crowd(scene) {
  const L = FIELD.L + 11;
  const W = FIELD.W + 11;
  const steps = 8;
  const stepH = 1.45;
  const stepD = 2.5;
  const standMat = new THREE.MeshLambertMaterial({ color: "#1a2ea8" });
  const wallMat = new THREE.MeshLambertMaterial({ color: "#0b1560" });

  const positions = [];
  const sides = [
    { len: L, axis: "z", sign: -1 },
    { len: L, axis: "z", sign: 1 },
    { len: W, axis: "x", sign: -1 },
    { len: W, axis: "x", sign: 1 },
  ];

  sides.forEach(({ len, axis, sign }) => {
    const base = axis === "z" ? W / 2 : L / 2;
    for (let s = 0; s < steps; s++) {
      const dist = base + 1.5 + s * stepD;
      const y = s * stepH;
      const step = new THREE.Mesh(new THREE.BoxGeometry(len + 14, stepH + y, stepD), standMat);
      step.receiveShadow = true;
      if (axis === "z") step.position.set(0, (stepH + y) / 2 - 0.2, sign * dist);
      else step.position.set(sign * dist, (stepH + y) / 2 - 0.2, 0);
      if (axis === "x") step.rotation.y = Math.PI / 2;
      scene.add(step);

      const count = Math.floor((len + 10) / 1.4);
      for (let i = 0; i < count; i++) {
        const p = -(len + 10) / 2 + i * 1.4 + 0.7;
        if (Math.random() < 0.1) continue;
        const px = axis === "z" ? p : sign * dist;
        const pz = axis === "z" ? sign * dist : p;
        positions.push({ x: px, y: y + stepH - 0.2, z: pz, axis, sign });
      }
    }
  });

  const N = positions.length;
  const torsoGeo = new THREE.BoxGeometry(0.68, 0.8, 0.52);
  const headGeo = new THREE.BoxGeometry(0.52, 0.48, 0.48);
  const mat = new THREE.MeshLambertMaterial();
  const torsos = new THREE.InstancedMesh(torsoGeo, mat, N);
  const heads = new THREE.InstancedMesh(headGeo, mat.clone(), N);
  const palette = ["#ff1030", "#0d5cff", "#ffffff", "#ffd400", "#ff6a00", "#9b2dff", "#00d45e", "#ff2e86"];
  const skins = ["#f6cfa6", "#e8b184", "#c98a5c", "#8d5a34"];
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  positions.forEach((p, i) => {
    const rotY = p.axis === "z" ? (p.sign < 0 ? 0 : Math.PI) : p.sign < 0 ? Math.PI / 2 : -Math.PI / 2;
    dummy.position.set(p.x, p.y + 0.4, p.z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    torsos.setMatrixAt(i, dummy.matrix);
    col.set(palette[Math.floor(Math.random() * palette.length)]);
    torsos.setColorAt(i, col);
    dummy.position.y = p.y + 1.05;
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    col.set(skins[Math.floor(Math.random() * skins.length)]);
    heads.setColorAt(i, col);
  });
  scene.add(torsos, heads);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(L + 46, 16, 1), wallMat);
  wall.position.set(0, 8, -(W / 2 + steps * stepD + 2));
  scene.add(wall);
  const wall2 = wall.clone();
  wall2.position.z = W / 2 + steps * stepD + 2;
  scene.add(wall2);

  return { torsos, heads, positions };
}

function floodlights(scene) {
  const L = FIELD.L + 11;
  const W = FIELD.W + 11;
  const group = new THREE.Group();
  [
    [-L / 2 - 6, -W / 2 - 16],
    [L / 2 + 6, -W / 2 - 16],
    [-L / 2 - 6, W / 2 + 16],
    [L / 2 + 6, W / 2 + 16],
  ].forEach(([x, z]) => {
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 32, 0.9),
      new THREE.MeshLambertMaterial({ color: "#243358" })
    );
    pole.position.set(x, 16, z);
    group.add(pole);
    const rig = new THREE.Mesh(
      new THREE.BoxGeometry(9.4, 0.6, 0.6),
      new THREE.MeshLambertMaterial({ color: "#243358" })
    );
    rig.position.set(x, 29.4, z);
    group.add(rig);
    for (let i = 0; i < 4; i++) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2, 1.5, 0.5),
        new THREE.MeshBasicMaterial({ color: "#fffff0" })
      );
      panel.position.set(x - 3 + i * 2, 30.6, z + Math.sign(z) * -0.6);
      group.add(panel);
      const halo = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 3.6),
        new THREE.MeshBasicMaterial({ color: "#fff8c0", transparent: true, opacity: 0.16, depthWrite: false })
      );
      halo.position.set(x - 3 + i * 2, 30.6, z + Math.sign(z) * -1);
      halo.lookAt(0, 10, 0);
      group.add(halo);
    }
    const spot = new THREE.SpotLight("#fff4d6", 0.5, 140, Math.PI / 5, 0.6, 1);
    spot.position.set(x, 30, z);
    spot.target.position.set(x * 0.2, 0, z * 0.2);
    scene.add(spot.target);
    group.add(spot);
  });
  scene.add(group);
}

export function buildStadium(scene) {
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.L, FIELD.W),
    new THREE.MeshLambertMaterial({ map: pitchTexture() })
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  const surround = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.L + 13, FIELD.W + 13),
    new THREE.MeshLambertMaterial({ color: "#1f9414" })
  );
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  scene.add(surround);

  const gA = createGoal(1);
  gA.position.x = -FIELD.L / 2 + 1.6;
  const gB = createGoal(-1);
  gB.position.x = FIELD.L / 2 - 1.6;
  scene.add(gA, gB);
  scene.userData.goals = [gA, gB];

  // Líneas con leve emisivo: capa aditiva con sólo las marcas, apenas visible
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD.L, FIELD.W),
    new THREE.MeshBasicMaterial({
      map: lineGlowTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.3,
      depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.012;
  glow.renderOrder = 1;
  scene.add(glow);

  const cornerFlags = [];
  [
    [-FIELD.L / 2 + 1.8, -FIELD.W / 2 + 1.8],
    [FIELD.L / 2 - 1.8, -FIELD.W / 2 + 1.8],
    [-FIELD.L / 2 + 1.8, FIELD.W / 2 - 1.8],
    [FIELD.L / 2 - 1.8, FIELD.W / 2 - 1.8],
  ].forEach(([x, z]) => {
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 2.6, 0.12),
      new THREE.MeshLambertMaterial({ color: "#f6fdf6" })
    );
    pole.position.set(x, 1.3, z);
    const flagGroup = new THREE.Group();
    flagGroup.position.set(x, 2.3, z);
    // Triangular pennant built from two tapered slabs
    const flagMat = new THREE.MeshLambertMaterial({ color: "#ffc21c" });
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46 - i * 0.1, 0.05), flagMat);
      seg.position.set(0.12 + i * 0.18, 0, 0);
      flagGroup.add(seg);
    }
    scene.add(pole, flagGroup);
    cornerFlags.push(flagGroup);
  });
  scene.userData.cornerFlags = cornerFlags;

  ledBoards(scene);
  const stands = crowd(scene);
  floodlights(scene);
  return { stands };
}
