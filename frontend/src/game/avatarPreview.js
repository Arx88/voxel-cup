import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { createPlayerMesh, animatePlayer, createHeadMesh, HAIR_STYLES, TOTAL } from "./player";
import { getKit } from "./kits";
import { profileLook } from "./appearance";

/* ---------------- helpers ---------------- */

const isMobile = () =>
  typeof window !== "undefined" &&
  (window.innerWidth < 820 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""));

const radialTexture = (stops, size = 256) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d");
  const g = c.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const buildContactShadow = () => {
  const tex = radialTexture([
    [0, "rgba(0,0,0,0.90)"],
    [0.42, "rgba(0,0,0,0.45)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.005;
  return m;
};

/* ---------------- confetti (celebrate) ---------------- */

const buildConfetti = () => {
  const g = new THREE.Group();
  const palette = ["#2f74ff", "#ff2d3c", "#ffd21c", "#ffffff"];
  for (let i = 0; i < 34; i++) {
    const s = 0.1 + Math.random() * 0.12;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshBasicMaterial({ color: palette[i % palette.length] })
    );
    const side = i % 2 ? 1 : -1;
    const r = 0.9 + Math.random() * 1.6;
    m.position.set(side * r, 0.5 + Math.random() * 3.2, -0.4 - Math.random() * 1.8);
    m.userData = { spin: 0.4 + Math.random() * 1.4, off: Math.random() * 6, amp: 0.12 + Math.random() * 0.25 };
    g.add(m);
  }
  return g;
};

/* ---------------- preview ---------------- */

const FOCUS_Y = 0.90;
const FIT_R = 2.55;

export class AvatarPreview {
  constructor(container) {
    this.container = container;
    this.quality = isMobile() ? "low" : "high";
    const low = this.quality === "low";

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = low ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    // limpiar cualquier canvas previo (StrictMode double-mount, hot reload)
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = null;

    // luces: replican la imagen (dos focos superiores azulados + top key + rim frío)
    this.scene.add(new THREE.HemisphereLight("#a8cbff", "#03060f", 0.55));
    this.scene.add(new THREE.AmbientLight("#ffffff", 0.22));

    const topKey = new THREE.DirectionalLight("#ffffff", 1.7);
    topKey.position.set(0, 6, 2.2);
    topKey.castShadow = true;
    topKey.shadow.mapSize.set(low ? 512 : 1024, low ? 512 : 1024);
    topKey.shadow.camera.left = -1.8;
    topKey.shadow.camera.right = 1.8;
    topKey.shadow.camera.top = 3.2;
    topKey.shadow.camera.bottom = -0.6;
    topKey.shadow.camera.near = 0.5;
    topKey.shadow.camera.far = 12;
    topKey.shadow.bias = -0.0012;
    topKey.shadow.radius = 3;
    this.scene.add(topKey);

    const leftSpot = new THREE.DirectionalLight("#dbeaff", 1.35);
    leftSpot.position.set(-3.2, 4.6, 3.0);
    this.scene.add(leftSpot);

    const rightSpot = new THREE.DirectionalLight("#dbeaff", 1.35);
    rightSpot.position.set(3.2, 4.6, 3.0);
    this.scene.add(rightSpot);

    const rimBack = new THREE.DirectionalLight("#4f8cff", 1.0);
    rimBack.position.set(0, 2.4, -3.6);
    this.scene.add(rimBack);

    const fill = new THREE.DirectionalLight("#ffe7bf", 0.32);
    fill.position.set(0.6, 1.2, 4.4);
    this.scene.add(fill);

    // el personaje (rig) y sombra de contacto
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.contactShadow = buildContactShadow();
    this.rig.add(this.contactShadow);

    this.confetti = buildConfetti();
    this.confetti.visible = false;
    this.scene.add(this.confetti);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.zoom = 1;
    this.camDist = 8;
    this.spin = -0.42;
    this.spinSpeed = 0.25;
    this.pop = 0;
    this.showoff = 0;
    this.yaw = -0.42;
    this.yawVel = 0;
    this.parallax = new THREE.Vector2(0, 0);
    this.parallaxTarget = new THREE.Vector2(0, 0);

    // post proceso: bloom sutil para que el personaje brille bajo los focos de la imagen
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.useBloom = !low;
    if (this.useBloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.5, 0.88);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());

    this._bindPointer();

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    this._resize = this._resize.bind(this);
    window.addEventListener("resize", this._resize);
    window.addEventListener("orientationchange", this._resize);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(container);
    this._fpsT = 0;
    this._fpsN = 0;
    this._resize();
    this.raf = requestAnimationFrame(this._loop);
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    el.style.cursor = "grab";
    el.style.touchAction = "pan-y";
    this._down = (e) => {
      this.dragging = true;
      this.yawVel = 0;
      this._lastX = e.clientX;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
    };
    this._move = (e) => {
      const r = el.getBoundingClientRect();
      this.parallaxTarget.set(
        ((e.clientX - r.left) / r.width - 0.5) * 2,
        ((e.clientY - r.top) / r.height - 0.5) * 2
      );
      if (!this.dragging) return;
      const dx = e.clientX - this._lastX;
      this._lastX = e.clientX;
      this.yaw += dx * 0.011;
      this.yawVel = dx * 0.22;
      this.manualUntil = this.clock.elapsedTime + 2.6;
    };
    this._up = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.manualUntil = this.clock.elapsedTime + 3.4;
      el.style.cursor = "grab";
    };
    // Zoom desactivado por diseño — no hay wheel/pinch listeners.
    this._wheel = null;
    el.addEventListener("pointerdown", this._down);
    el.addEventListener("pointermove", this._move);
    el.addEventListener("pointerup", this._up);
    el.addEventListener("pointercancel", this._up);
    el.addEventListener("pointerleave", this._up);
  }

  setProfile(p) {
    if (this.mesh) {
      this.rig.remove(this.mesh);
      this.mesh.traverse((o) => o.geometry && o.geometry.dispose());
      this.mesh = null;
    }
    const kit = getKit(p.kitId);
    const look = profileLook(p);
    this.mesh = createPlayerMesh({
      shirt: kit.shirt,
      shorts: kit.shorts,
      socks: kit.socks,
      number: p.number,
      skin: p.skin,
      hair: p.hairColor,
      hairStyle: p.hairStyle,
      kit,
      look,
    });
    this.mesh.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.rig.add(this.mesh);
    this.baseScale = this.mesh.scale.clone();
    this.pop = 1;
  }

  // Zoom desactivado (rotación libre en Y únicamente). No-op mantenido por compatibilidad.
  setZoom(_dir, _stepSize) {
    /* no-op */
  }

  celebrate() {
    this.showoff = 1;
    this.spin = this.yaw;
    this.spinSpeed = 2.6;
    this.confetti.visible = true;
  }

  _resize() {
    const w = Math.max(1, this.container.clientWidth || 480);
    const h = Math.max(1, this.container.clientHeight || 620);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom?.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const fitR = FIT_R * (aspect < 0.85 ? 1.02 : 1);
    this.fitDist = Math.max(fitR / tan, fitR / (tan * aspect)) * 1.06;
  }

  _loop() {
    this.raf = requestAnimationFrame(this._loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    // presupuesto de performance: si el fps cae, apagamos bloom
    this._fpsN++;
    this._fpsT += dt;
    if (this._fpsT > 2.5) {
      const fps = this._fpsN / this._fpsT;
      if (fps < 34 && this.useBloom && this.bloom) {
        this.composer.removePass(this.bloom);
        this.useBloom = false;
      }
      this._fpsT = 0;
      this._fpsN = 0;
    }

    if (this.showoff > 0) {
      this.showoff = Math.max(0, this.showoff - dt / 1.8);
      if (this.showoff === 0) {
        this.spinSpeed = 0.25;
        this.confetti.visible = false;
        this.yaw = this.spin;
      }
    }

    let targetYaw;
    if (this.spinSpeed > 1) {
      this.spin += this.spinSpeed * dt;
      targetYaw = this.spin;
    } else if (this.dragging || t < this.manualUntil) {
      if (!this.dragging) {
        this.yaw += this.yawVel * dt;
        this.yawVel *= Math.pow(0.06, dt);
      }
      targetYaw = this.yaw;
    } else {
      targetYaw = -0.42 + Math.sin(t * 0.22) * 0.42;
      this.yaw = targetYaw;
    }
    this.rig.rotation.y += (targetYaw - this.rig.rotation.y) * Math.min(1, dt * (this.dragging ? 26 : 6));

    if (this.mesh) {
      animatePlayer(this.mesh, this.showoff > 0 ? 1.5 : 0, dt, false, { lookYaw: 0 });
      const breathe = 1 + Math.sin(t * 1.35) * 0.012;
      this.mesh.position.y = Math.sin(t * 1.35) * 0.018;
      let e = breathe;
      if (this.pop > 0) {
        this.pop = Math.max(0, this.pop - dt / 0.36);
        e *= 1 + Math.sin((1 - this.pop) * Math.PI) * 0.13;
      }
      if (this.baseScale) this.mesh.scale.set(this.baseScale.x * e, this.baseScale.y * e, this.baseScale.z * e);
    }

    this.parallax.lerp(this.parallaxTarget, Math.min(1, dt * 3));

    this.confetti.children.forEach((c) => {
      c.rotation.x += c.userData.spin * dt;
      c.rotation.y += c.userData.spin * 0.7 * dt;
      c.position.y += Math.sin(t * 1.1 + c.userData.off) * c.userData.amp * dt * 2.4;
    });

    const target = this.fitDist * this.zoom * (this.showoff > 0 ? 1.04 : 1);
    this.camDist += (target - this.camDist) * Math.min(1, dt * 4);
    this.camera.position.set(
      this.parallax.x * 0.12,
      FOCUS_Y + 0.16 - this.parallax.y * 0.08,
      this.camDist
    );
    this.camera.lookAt(0, FOCUS_Y + 0.06, 0);
    this.composer.render(dt);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this._resize);
    window.removeEventListener("orientationchange", this._resize);
    this._ro?.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this._down);
    el.removeEventListener("pointermove", this._move);
    el.removeEventListener("pointerup", this._up);
    el.removeEventListener("pointercancel", this._up);
    el.removeEventListener("pointerleave", this._up);
    this.composer?.dispose?.();
    this.renderer.dispose();
    // libera el contexto WebGL de inmediato (el navegador limita ~16 por pestaña)
    this.renderer.forceContextLoss?.();
    if (el.parentNode) el.parentNode.removeChild(el);
  }
}

/* ---------------- miniaturas de peinados ---------------- */

// Un único renderer reutilizable para las miniaturas: crear uno nuevo en cada
// cambio de color agotaba los contextos WebGL de la pestaña y hacía que el
// motor del partido arrancara sin contexto (pantalla azul hasta refrescar).
let thumbRenderer = null;
const getThumbRenderer = () => {
  if (thumbRenderer && !thumbRenderer.getContext().isContextLost()) return thumbRenderer;
  thumbRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  thumbRenderer.setPixelRatio(2);
  thumbRenderer.setSize(140, 140, false);
  thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
  return thumbRenderer;
};

export function renderHairThumbs({ skin, hairColor }) {
  const r = getThumbRenderer();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#dceaff", "#08132e", 0.6));
  scene.add(new THREE.AmbientLight("#ffffff", 0.34));
  const k1 = new THREE.DirectionalLight("#fff6e2", 1.55);
  k1.position.set(-3.4, 5.6, 5.2);
  scene.add(k1);
  const k2 = new THREE.DirectionalLight("#dbeaff", 1.15);
  k2.position.set(4.2, 5.0, 4.4);
  scene.add(k2);
  const rim = new THREE.DirectionalLight("#4f8cff", 1.0);
  rim.position.set(-4.6, 2.4, -4.6);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  cam.position.set(0.15 * TOTAL, 0.055 * TOTAL, 1.0 * TOTAL);
  cam.lookAt(0, 0.005 * TOTAL, 0);
  const out = [];
  HAIR_STYLES.forEach((s) => {
    const head = createHeadMesh({ skin, hair: hairColor, hairStyle: s.id });
    head.rotation.y = -0.34;
    scene.add(head);
    r.render(scene, cam);
    out.push({ id: s.id, label: s.label, url: r.domElement.toDataURL("image/png") });
    scene.remove(head);
    head.traverse((o) => o.geometry && o.geometry.dispose());
  });
  return out;
}

// Suelta el renderer de miniaturas al salir del creador.
export function disposeHairThumbs() {
  if (!thumbRenderer) return;
  thumbRenderer.dispose();
  thumbRenderer.forceContextLoss?.();
  thumbRenderer = null;
}
