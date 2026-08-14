import * as THREE from "three";
import { FIELD } from "./config";
import { POWERUP_ICONS } from "./powerupIcons";

const HALF_L = FIELD.L / 2;
const HALF_W = FIELD.W / 2;

export const POWERUPS = {
  boot: { label: "BALÓN DE FUEGO", color: "#ff6a1f", dur: 0, desc: "SÚPER DISPARO GARANTIZADO" },
  bolt: { label: "BOTÍN DE ORO", color: "#ffd21c", dur: 7, desc: "VELOCIDAD + STAMINA INFINITA" },
  magnet: { label: "IMÁN", color: "#c56bff", dur: 9, desc: "CONTROL MAGNÉTICO" },
  shield: { label: "MURALLA", color: "#20d47a", dur: 8, desc: "INMUNE A BARRIDAS" },
  ice: { label: "SILBATO", color: "#f4d43a", dur: 4.5, desc: "TARJETA: RIVALES CONGELADOS" },
};

const KEYS = Object.keys(POWERUPS);

const loader = new THREE.TextureLoader();

function iconTexture(key) {
  const t = loader.load(POWERUP_ICONS[key] || POWERUP_ICONS.boot);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,255,0.95)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.35)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PowerupField {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    // Aparecen bien pocas veces: el primero después de ~40 s, y siempre bien
    // esparcidos por la cancha (nunca cerca del último punto).
    this.timer = 42;
    this.tex = {};
    this.glow = glowTexture();
    this.sparks = [];
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 0.2),
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true })
      );
      m.visible = false;
      scene.add(m);
      this.sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }
    this.sparkIdx = 0;
  }

  _texture(key) {
    if (!this.tex[key]) this.tex[key] = iconTexture(key);
    return this.tex[key];
  }

  spawn(key, fx = null, fz = null) {
    if (this.items.length >= 1) return null;
    const type = key || KEYS[Math.floor(Math.random() * KEYS.length)];
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.95, 0.95),
      new THREE.MeshBasicMaterial({ map: this._texture(type) })
    );
    group.add(box);
    const cage = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 1.35, 1.35),
      new THREE.MeshBasicMaterial({ color: POWERUPS[type].color, wireframe: true, transparent: true, opacity: 0.55 })
    );
    group.add(cage);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glow,
        color: POWERUPS[type].color,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      })
    );
    halo.scale.set(3.4, 3.4, 1);
    group.add(halo);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.35, 32),
      new THREE.MeshBasicMaterial({
        color: POWERUPS[type].color,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    // Bien esparcidos por toda la cancha (no siempre en el centro) y lejos
    // del último punto de aparición. Si nos pasan una posición explícita
    // (sincronización con el host), la usamos directamente.
    let x = 0;
    let z = 0;
    if (fx != null && fz != null) {
      x = fx;
      z = fz;
    } else {
      for (let tries = 0; tries < 12; tries++) {
        x = (Math.random() * 2 - 1) * (HALF_L - 9);
        z = (Math.random() * 2 - 1) * (HALF_W - 6);
        if (!this.lastSpot) break;
        if (Math.hypot(x - this.lastSpot.x, z - this.lastSpot.z) > 22) break;
      }
    }
    this.lastSpot = { x, z };
    group.position.set(x, 1.5, z);
    group.scale.setScalar(0.01);
    ring.position.set(x, 0.04, z);
    this.scene.add(group);
    this.scene.add(ring);
    const item = { type, group, ring, box, cage, life: 13, t: 0, x, z };
    this.items.push(item);
    return item;
  }

  burst(x, z, color) {
    for (let i = 0; i < 18; i++) {
      const s = this.sparks[this.sparkIdx];
      this.sparkIdx = (this.sparkIdx + 1) % this.sparks.length;
      s.mesh.visible = true;
      s.mesh.position.set(x, 1.2, z);
      s.mesh.material.color.set(color);
      s.mesh.material.opacity = 1;
      s.vel.set((Math.random() - 0.5) * 9, 3 + Math.random() * 6, (Math.random() - 0.5) * 9);
      s.life = 0.75;
    }
  }

  update(dt, time) {
    this.timer -= dt;
    if (this.timer <= 0) {
      const it = this.spawn();
      this.timer = it ? 11 + Math.random() * 5 : 3;
      if (it) return { spawned: it.type };
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.life -= dt;
      const pop = Math.min(1, it.t * 4);
      const s = pop * (1 + Math.sin(it.t * 6) * 0.05);
      it.group.scale.setScalar(s);
      it.group.position.y = 1.35 + Math.sin(time * 2.4 + it.x) * 0.22;
      it.group.rotation.y = time * 1.5;
      it.cage.rotation.y = -time * 2.2;
      it.cage.rotation.x = time * 1.1;
      const blink = it.life < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(it.life * 9)) : 1;
      it.box.material.opacity = blink;
      it.box.material.transparent = true;
      it.ring.scale.setScalar(1 + Math.sin(time * 3 + it.x) * 0.12);
      it.ring.material.opacity = 0.35 * blink + 0.25;
      if (it.life <= 0) this._remove(i);
    }
    this.sparks.forEach((s) => {
      if (s.life <= 0) {
        if (s.mesh.visible) s.mesh.visible = false;
        return;
      }
      s.life -= dt;
      s.vel.y -= 16 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += dt * 8;
      s.mesh.rotation.y += dt * 6;
      s.mesh.material.opacity = Math.max(0, s.life / 0.75);
    });
    return null;
  }

  // Client-only visual pass. The guest must not run update() (that would
  // randomly spawn or collect authoritative items), but it still needs to
  // animate the items received from the host instead of leaving their groups
  // at the initial scale 0.01.
  updateVisual(dt, time) {
    for (const it of this.items) {
      const pop = Math.min(1, Math.max(0, it.t || 0) * 4);
      const s = pop * (1 + Math.sin(time * 6) * 0.05);
      it.group.scale.setScalar(s);
      it.group.position.y = 1.35 + Math.sin(time * 2.4 + it.x) * 0.22;
      it.group.rotation.y = time * 1.5;
      it.cage.rotation.y = -time * 2.2;
      it.cage.rotation.x = time * 1.1;
      const blink = it.life < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(it.life * 9)) : 1;
      it.box.material.opacity = blink;
      it.box.material.transparent = true;
      it.ring.scale.setScalar(1 + Math.sin(time * 3 + it.x) * 0.12);
      it.ring.material.opacity = 0.35 * blink + 0.25;
    }
  }

  _remove(i) {
    const it = this.items[i];
    this.scene.remove(it.group);
    this.scene.remove(it.ring);
    it.box.geometry.dispose();
    it.cage.geometry.dispose();
    it.ring.geometry.dispose();
    this.items.splice(i, 1);
  }

  collect(players) {
    const events = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const hit = players.find(
        (p) => Math.hypot(p.mesh.position.x - it.x, p.mesh.position.z - it.z) < 1.5
      );
      if (hit) {
        events.push({ type: it.type, player: hit });
        this.burst(it.x, it.z, POWERUPS[it.type].color);
        this._remove(i);
      }
    }
    return events;
  }

  clear() {
    for (let i = this.items.length - 1; i >= 0; i--) this._remove(i);
    this.timer = 20;
    this.lastSpot = null;
  }

  /**
   * Sincroniza los power-ups con el estado del host (el cliente no simula,
   * así que refleja los items activos del host: los que faltan se crean y
   * los que ya no están se quitan).
   */
  syncItems(remoteItems) {
    if (!Array.isArray(remoteItems)) return;
    const want = new Map();
    remoteItems.forEach((r) => {
      const key = `${r.type}:${Math.round(r.x * 2)}:${Math.round(r.z * 2)}`;
      want.set(key, r);
    });
    // quitar items locales que el host ya no tiene
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const key = `${it.type}:${Math.round(it.x * 2)}:${Math.round(it.z * 2)}`;
      if (!want.has(key)) this._remove(i);
    }
    // crear/actualizar items del host
    want.forEach((r) => {
      const key = `${r.type}:${Math.round(r.x * 2)}:${Math.round(r.z * 2)}`;
      let it = this.items.find(
        (i) => `${i.type}:${Math.round(i.x * 2)}:${Math.round(i.z * 2)}` === key
      );
      if (!it) {
        it = this.spawn(r.type, r.x, r.z);
      }
      if (it) {
        it.life = typeof r.life === "number" ? r.life : it.life;
        it.t = typeof r.t === "number" ? r.t : it.t;
      }
    });
  }
}
