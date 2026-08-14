import * as THREE from "three";

// Single-draw-call voxel particle system. Everything (pasto, polvo, chispas,
// confeti, estela) sale de este pool para no sumar draw calls.
const MAX = 520;

export class VoxelFX {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.col = new THREE.Color();
    this.p = [];
    for (let i = 0; i < MAX; i++) {
      this.p.push({
        life: 0,
        ttl: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        size: 0.2,
        grav: 26,
        bounce: 0,
        drag: 0,
      });
      this.mesh.setColorAt(i, this.col.set("#ffffff"));
    }
    this.idx = 0;
    this._hideAll();
  }

  _hideAll() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _take() {
    const p = this.p[this.idx];
    this.i = this.idx;
    this.idx = (this.idx + 1) % MAX;
    return p;
  }

  emit({ x, y = 0.1, z, vx, vy, vz, size = 0.2, life = 0.5, color = "#ffffff", grav = 26, bounce = 0, drag = 0 }) {
    const p = this._take();
    const i = this.i;
    p.pos.set(x, y, z);
    p.vel.set(vx, vy, vz);
    p.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    p.size = size;
    p.life = life;
    p.ttl = life;
    p.grav = grav;
    p.bounce = bounce;
    p.drag = drag;
    this.mesh.setColorAt(i, this.col.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return p;
  }

  // Cubitos de césped que saltan hacia atrás al correr / derrapar
  grass(x, z, dx = 0, dz = 0, n = 5, power = 1) {
    const tones = ["#5ce033", "#2aab1d", "#7cf04a", "#1f8f14"];
    for (let i = 0; i < n; i++) {
      this.emit({
        x: x + (Math.random() - 0.5) * 0.7,
        y: 0.08,
        z: z + (Math.random() - 0.5) * 0.7,
        vx: -dx * (2 + Math.random() * 4) * power + (Math.random() - 0.5) * 3,
        vy: 2.5 + Math.random() * 4 * power,
        vz: -dz * (2 + Math.random() * 4) * power + (Math.random() - 0.5) * 3,
        size: 0.1 + Math.random() * 0.14,
        life: 0.42 + Math.random() * 0.28,
        color: tones[(Math.random() * tones.length) | 0],
        grav: 30,
      });
    }
  }

  // Polvo al frenar: cubos blancos grandes que se expanden y se apagan
  dust(x, z, n = 5, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        x,
        y: 0.14 + Math.random() * 0.2,
        z,
        vx: Math.cos(a) * (1.6 + Math.random() * 2.6) * power,
        vy: 0.6 + Math.random() * 1.4,
        vz: Math.sin(a) * (1.6 + Math.random() * 2.6) * power,
        size: 0.22 + Math.random() * 0.22,
        life: 0.36 + Math.random() * 0.24,
        color: Math.random() > 0.5 ? "#ffffff" : "#e2f2d8",
        grav: 3,
        drag: 3.4,
      });
    }
  }

  // Chispas cúbicas (palo, tackle perfecto, atajada)
  sparks(x, y, z, color = "#ffd21c", n = 12, speed = 9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2;
      this.emit({
        x,
        y,
        z,
        vx: Math.cos(a) * speed * (0.4 + Math.random()),
        vy: 2 + Math.sin(e) * speed * 0.55,
        vz: Math.sin(a) * speed * (0.4 + Math.random()),
        size: 0.08 + Math.random() * 0.12,
        life: 0.3 + Math.random() * 0.3,
        color: Math.random() > 0.35 ? color : "#ffffff",
        grav: 22,
      });
    }
  }

  // Estela del balón: cubitos que quedan atrás del disparo
  trailCube(x, y, z, color, size = 0.14) {
    this.emit({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 1.2,
      vy: (Math.random() - 0.5) * 0.8,
      vz: (Math.random() - 0.5) * 1.2,
      size,
      life: 0.24,
      color,
      grav: 0,
      drag: 5,
    });
  }

  // Fuego: cubos ascendentes amarillo -> naranja -> rojo (balón de fuego)
  fire(x, y, z, power = 1, n = 3) {
    const tones = ["#fff6b0", "#ffd21c", "#ff9a2e", "#ff5c12", "#c62200"];
    for (let i = 0; i < n; i++) {
      this.emit({
        x: x + (Math.random() - 0.5) * 0.45,
        y: y + (Math.random() - 0.5) * 0.35,
        z: z + (Math.random() - 0.5) * 0.45,
        vx: (Math.random() - 0.5) * 2.2,
        vy: 1.4 + Math.random() * 2.6 * power,
        vz: (Math.random() - 0.5) * 2.2,
        size: 0.14 + Math.random() * 0.22 * power,
        life: 0.3 + Math.random() * 0.35,
        color: tones[(Math.random() * tones.length) | 0],
        grav: -3.5,
        drag: 2.6,
      });
    }
  }

  // Chispas ardientes que saltan de la pelota en llamas
  embers(x, y, z, n = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        x,
        y,
        z,
        vx: Math.cos(a) * (2 + Math.random() * 5),
        vy: 2.5 + Math.random() * 4,
        vz: Math.sin(a) * (2 + Math.random() * 5),
        size: 0.06 + Math.random() * 0.09,
        life: 0.35 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? "#ffd21c" : "#ff6a1f",
        grav: 9,
        drag: 1.2,
      });
    }
  }

  // Explosión de confeti cúbico del color del equipo
  confetti(cx, cz, colors, n = 150) {
    for (let i = 0; i < n; i++) {
      this.emit({
        x: cx + (Math.random() - 0.5) * 14,
        y: 7 + Math.random() * 8,
        z: cz + (Math.random() - 0.5) * 26,
        vx: (Math.random() - 0.5) * 11,
        vy: 2 + Math.random() * 7,
        vz: (Math.random() - 0.5) * 11,
        size: 0.2 + Math.random() * 0.22,
        life: 2.6 + Math.random() * 1.6,
        color: colors[(Math.random() * colors.length) | 0],
        grav: 11,
        bounce: 0.32,
        drag: 0.5,
      });
    }
  }

  update(dt) {
    const d = this.dummy;
    let dirty = false;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      dirty = true;
      if (p.life <= 0) {
        d.scale.setScalar(0);
        d.position.set(0, -50, 0);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      p.vel.y -= p.grav * dt;
      if (p.drag > 0) {
        const f = Math.exp(-p.drag * dt);
        p.vel.x *= f;
        p.vel.z *= f;
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.size * 0.5) {
        p.pos.y = p.size * 0.5;
        if (p.bounce > 0) {
          p.vel.y = Math.abs(p.vel.y) * p.bounce;
          p.vel.x *= 0.6;
          p.vel.z *= 0.6;
        } else {
          p.vel.set(0, 0, 0);
        }
      }
      const t = p.life / p.ttl;
      d.position.copy(p.pos);
      d.rotation.set(p.spin.x * (p.ttl - p.life), p.spin.y * (p.ttl - p.life), p.spin.z * (p.ttl - p.life));
      d.scale.setScalar(p.size * (0.35 + t * 0.75));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
