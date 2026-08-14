import * as THREE from "three";
import { FIELD, TEAMS, KEEPER_BASE, KEEPER_VARIATION } from "./config";

const HALF_L = FIELD.L / 2;
const GRAV = 24;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Atributos unificados: los dos arqueros salen del mismo molde, con una
// variación mínima determinística. Nada de "arquero dios" ni "arquero inútil".
export function makeKeeperAttrs(team) {
  const v = KEEPER_VARIATION[team] || 0;
  return {
    reflex: clamp(KEEPER_BASE.reflex + v, 0.5, 0.95),
    positioning: clamp(KEEPER_BASE.positioning - v, 0.5, 0.95),
    jump: clamp(KEEPER_BASE.jump + v * 0.5, 0.5, 0.95),
  };
}

// Predice el cruce del balón por la línea de gol propia.
function predictShot(game, team) {
  const b = game.ball;
  const t = TEAMS[team];
  const goalX = -HALF_L * t.dir;
  const vx = b.vel.x;
  if (vx * t.dir >= -0.5) return null; // no viene hacia nuestro arco
  const time = (goalX - b.mesh.position.x) / vx;
  if (time <= 0 || time > 1.6) return null;
  const z = b.mesh.position.z + b.vel.z * time;
  const y = b.mesh.position.y + b.vel.y * time - 0.5 * GRAV * time * time;
  const onTarget = Math.abs(z) < FIELD.GOAL_W / 2 + 0.9 && y < FIELD.GOAL_H + 0.4 && y > -0.4;
  return { time, z, y, speed: b.vel.length(), onTarget };
}

// Probabilidad de intervención: distancia al tiro, ángulo, potencia y reacción.
function saveChance(p, shot, latErr) {
  const a = p.attrs;
  const reach = 1.35 + a.jump * 1.5;
  const reachFactor = clamp(1 - Math.max(0, latErr - 0.6) / reach, 0, 1);
  const powerFactor = clamp(1 - (shot.speed - 30) / 78, 0.28, 1);
  const heightFactor = shot.y > 2.5 ? clamp(0.62 + a.jump * 0.3, 0.5, 0.95) : 1;
  // Ángulo: los tiros muy cruzados o desde muy cerca dejan menos margen
  const angleFactor = clamp(0.62 + (1 - Math.abs(shot.z) / (FIELD.GOAL_W / 2)) * 0.38, 0.62, 1);
  const readFactor = clamp(0.7 + shot.time * 0.55, 0.7, 1.15);
  const raw = 0.96 * a.reflex * reachFactor * powerFactor * heightFactor * angleFactor * readFactor;
  return clamp(raw, 0.1, 0.9);
}

function outcomeFor(shot, latErr, chance) {
  if (shot.speed < 40 && latErr < 0.9 && chance > 0.6) return "catch";
  if (latErr > 1.1 || shot.y > 2.1) return "dive";
  return "parry";
}

export function updateKeeper(game, p, dt) {
  const b = game.ball;
  const bp = b.mesh.position;
  const t = TEAMS[p.team];
  const a = p.attrs;
  const goalX = -HALF_L * t.dir;
  const lineX = goalX + 2.2 * t.dir;
  const shot = predictShot(game, p.team);

  // ---- posicionamiento -----------------------------------------------------
  const trackZ = shot && shot.onTarget ? shot.z : bp.z * (0.42 + a.positioning * 0.22);
  const lim = FIELD.GOAL_W / 2 + 0.3;
  const targetZ = clamp(trackZ, -lim, lim);

  // sale a cortar en mano a mano (según posicionamiento)
  const distToGoal = Math.abs(bp.x - goalX);
  const oneOnOne = distToGoal < 13 && !(shot && shot.speed > 30);
  const rush = oneOnOne ? clamp((13 - distToGoal) * 0.2 * a.positioning, 0, 3.2) : 0;
  const targetX = lineX + rush * t.dir;

  if (p.diveT > 0) {
    p.diveT -= dt;
    if (p.diveT <= 0) p.diveKind = null;
    game._movePlayer(p, new THREE.Vector3(), false, dt);
  } else {
    const to = new THREE.Vector3(targetX - p.mesh.position.x, 0, targetZ - p.mesh.position.z);
    const d = to.length();
    game._movePlayer(p, d > 0.3 ? to.normalize() : new THREE.Vector3(), d > 3.2, dt);
  }

  // ---- resolución de la atajada -------------------------------------------
  if (game.saveCooldown > 0 || p.diveT > 0) return;
  const latErr = shot ? Math.abs(shot.z - p.mesh.position.z) : 99;

  // Ventana de reacción: el arquero se lanza cuando el balón está por llegar
  const reactAt = 0.1 + a.reflex * 0.16;
  if (shot && shot.onTarget && shot.time <= reactAt && shot.speed > 8) {
    game.saveCooldown = 0.55;
    const chance = saveChance(p, shot, latErr);
    if (Math.random() < chance) {
      game._keeperSave(p, outcomeFor(shot, latErr, chance), shot);
    } else {
      // batido: igual se estira (lectura visual de intento)
      p.diveT = 0.45;
      p.diveKind = "dive";
      p.squash = 0.5;
      p.vel.z = Math.sign(shot.z - p.mesh.position.z || 1) * 11;
      game.fx.dust(p.mesh.position.x, p.mesh.position.z, 4, 1);
    }
    return;
  }

  // Blocaje en el mano a mano / rechace de balones sueltos en el área chica
  const d = bp.distanceTo(p.mesh.position);
  if (d < 2.1 && Math.abs(bp.x - goalX) < 11 && b.vel.length() < 34) {
    game.saveCooldown = 0.5;
    if (Math.random() < clamp(0.55 + a.positioning * 0.4, 0.5, 0.95)) {
      game._keeperSave(p, "catch", { speed: b.vel.length(), z: bp.z, y: bp.y, time: 0 });
    }
  }
}
