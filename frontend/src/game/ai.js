import * as THREE from "three";
import { FIELD, TEAMS, ROLE_ZONES } from "./config";
import { updateKeeper } from "./keeper";
import { awardPR } from "./pr";

const HALF_L = FIELD.L / 2;
const HALF_W = FIELD.W / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Agresividad dinámica: escalones según el marcador + empujón al final del
// partido para el que va perdiendo.
export function teamAggression(game, team) {
  const s = game.snapshot.score;
  const diff = team === "red" ? s.red - s.blue : s.blue - s.red;
  const lateness = 1 - clamp(game.snapshot.clock / Math.max(1, game.halfLen), 0, 1);
  let a = 1;
  if (diff <= -1) a = 1.2;
  if (diff <= -2) a = 1.38;
  if (diff >= 2) a = 0.86;
  if (diff < 0) a += lateness * 0.3;
  return clamp(a, 0.82, 1.7);
}

// ---------------------------------------------------------------- helpers
const isField = (p) => !p.keeper;

function pressureAt(game, pos, team, radius = 6.5) {
  let sum = 0;
  game.players.forEach((o) => {
    if (o.team === team || o.keeper) return;
    const d = o.mesh.position.distanceTo(pos);
    if (d < radius) sum += 1 - d / radius;
  });
  return sum;
}

// Cuánto está tapada la línea entre from y to por rivales.
function laneBlock(game, from, to, team, pad = 2.1) {
  const rel = to.clone().sub(from).setY(0);
  const dist = rel.length();
  if (dist < 0.001) return 0;
  const dir = rel.clone().multiplyScalar(1 / dist);
  let block = 0;
  game.players.forEach((o) => {
    if (o.team === team) return;
    const r = o.mesh.position.clone().sub(from).setY(0);
    const proj = r.dot(dir);
    if (proj <= 0 || proj > dist) return;
    const perp = r.sub(dir.clone().multiplyScalar(proj)).length();
    if (perp < pad) block += (pad - perp) / pad;
  });
  return block;
}

// Empuja un target fuera de la zona reservada al presser/portador.
function keepOut(target, bp, radius) {
  const dx = target.x - bp.x;
  const dz = target.z - bp.z;
  const d = Math.hypot(dx, dz);
  if (d >= radius) return target;
  if (d < 0.001) {
    target.x = bp.x - radius;
    return target;
  }
  target.x = bp.x + (dx / d) * radius;
  target.z = bp.z + (dz / d) * radius;
  return target;
}

// Posición estructural del puesto: mantiene la formación y el espaciado.
function structuralTarget(game, p, progress) {
  const t = TEAMS[p.team];
  const zone = ROLE_ZONES[p.baseRole] || ROLE_ZONES.MID;
  const bp = game.ball.mesh.position;
  const shift = lerp(-6, 15, progress) * zone.push;
  let x = p.home.x + t.dir * shift;
  const za = zone.minX * t.dir;
  const zb = zone.maxX * t.dir;
  x = clamp(x, Math.min(za, zb), Math.max(za, zb));
  const z = clamp(
    p.home.z * (0.7 + 0.3 * (1 - progress)) + bp.z * zone.follow,
    -HALF_W + 3,
    HALF_W - 3
  );
  return new THREE.Vector3(x, 0, z);
}

// ---------------------------------------------------------------- team brain
// Un único contexto por equipo y por frame: estado táctico, ranking al balón,
// presser designado y asignación de roles sin duplicados.
function teamCtx(game, team) {
  if (!game._aiCtx) game._aiCtx = {};
  let ctx = game._aiCtx[team];
  if (!ctx) {
    ctx = { stamp: -1, state: "TRANSICION", stateT: 0, assign: new Map() };
    game._aiCtx[team] = ctx;
  }
  if (ctx.stamp === game.time) return ctx;
  const dt = ctx.stamp < 0 ? 0.016 : Math.max(0, game.time - ctx.stamp);
  ctx.stamp = game.time;

  const bp = game.ball.mesh.position;
  const t = TEAMS[team];
  const agg = teamAggression(game, team);

  let holder = null;
  let holderDist = 1e9;
  game.players.forEach((o) => {
    const d = o.mesh.position.distanceTo(bp);
    if (d < holderDist) {
      holderDist = d;
      holder = o;
    }
  });
  const owner = holderDist < 2.5 ? holder.team : null;

  // Estados con histéresis: no parpadean entre ATACANDO / DEFENDIENDO.
  const wanted = owner === team ? "ATACANDO" : owner ? "DEFENDIENDO" : "TRANSICION";
  ctx.stateT += dt;
  if (wanted !== ctx.state && ctx.stateT > 0.22) {
    ctx.state = wanted;
    ctx.stateT = 0;
  }
  const state = ctx.state;

  const mates = game.players.filter((o) => o.team === team && isField(o));
  const ranked = mates
    .slice()
    .sort((a, b) => a.mesh.position.distanceTo(bp) - b.mesh.position.distanceTo(bp));
  const progress = clamp((bp.x * t.dir + HALF_L) / FIELD.L, 0, 1);

  // Marcas individuales: cada defensor toma un rival distinto.
  const foes = game.players
    .filter((o) => o.team !== team && isField(o))
    .sort((a, b) => b.mesh.position.x * t.dir - a.mesh.position.x * t.dir);

  ctx.assign.clear();
  ctx.presser = null;
  ranked.forEach((p, rank) => {
    let role;
    if (state === "ATACANDO") {
      if (rank === 0) role = "carry";
      else if (p.baseRole === "DEF") role = "hold";
      else if (p.baseRole === "FWD") role = "run";
      // En 4v4 (2 DEFs) el segundo DEF puede subir como support
      else if (p.baseRole === "DEF" && ranked.length > 3) role = "support";
      else role = "support";
    } else if (state === "DEFENDIENDO") {
      if (rank === 0) role = "press";
      else if (rank === 1) role = "cover";
      else role = "mark";
    } else {
      // TRANSICION: el más cerca persigue, los demás se reposicionan
      role = rank === 0 ? "chase" : p.baseRole === "FWD" ? "run" : "hold";
    }
    if (role === "press") ctx.presser = p;
    ctx.assign.set(p, { role, rank, mark: foes[(rank - 1 + foes.length) % Math.max(1, foes.length)] });
  });

  ctx.state = state;
  ctx.agg = agg;
  ctx.progress = progress;
  ctx.owner = owner;
  ctx.holder = holder;
  ctx.ranked = ranked;
  return ctx;
}

// ---------------------------------------------------------------- movimiento
function moveTargetFor(game, p, ctx) {
  const bp = game.ball.mesh.position;
  const t = TEAMS[p.team];
  const info = ctx.assign.get(p) || { role: "hold", rank: 3 };
  const role = info.role;
  const agg = ctx.agg;
  const goalOwn = new THREE.Vector3(-HALF_L * t.dir, 0, 0);
  const struct = structuralTarget(game, p, ctx.progress);
  let target = struct;
  let sprint = false;

  if (role === "carry") {
    // El portador avanza hacia el arco rival, no persigue el balón.
    // El balón se queda pegado por la lógica de posesión del engine.
    const goalX = HALF_L * t.dir;
    target = new THREE.Vector3(goalX, 0, p.mesh.position.z * 0.7);
    // Evitar rivales cercanos: si hay uno adelante, desviarse lateralmente
    let nearestFoe = null;
    let nearestFoeDist = 1e9;
    game.players.forEach((o) => {
      if (o.team === p.team || o.keeper) return;
      const d = o.mesh.position.distanceTo(p.mesh.position);
      if (d < nearestFoeDist) { nearestFoeDist = d; nearestFoe = o; }
    });
    if (nearestFoe && nearestFoeDist < 6) {
      // Desviar perpendicular a la dirección al rival
      const away = p.mesh.position.clone().sub(nearestFoe.mesh.position).setY(0);
      if (away.lengthSq() > 0.01) {
        away.normalize();
        target.x += away.x * 4;
        target.z += away.z * 4;
      }
    }
    target.x = clamp(target.x, -HALF_L + 2, HALF_L - 2);
    target.z = clamp(target.z, -HALF_W + 2, HALF_W - 2);
    sprint = true;
  } else if (role === "press" || role === "chase") {
    const lead = role === "press" ? 0.28 * agg : 0.12;
    target = bp.clone().addScaledVector(game.ball.vel, lead).setY(0);
    sprint = target.distanceTo(p.mesh.position) > 4.5 / agg;
  } else if (role === "run") {
    // Desmarque simple: ir al espacio adelante en su carril
    const laneZ = p.home.z >= 0 ? HALF_W * 0.35 : -HALF_W * 0.35;
    target = new THREE.Vector3(
      clamp(bp.x + 10 * t.dir, -HALF_L + 7, HALF_L - 5),
      0,
      laneZ
    );
    keepOut(target, bp, 7.5);
    sprint = true;
  } else if (role === "support") {
    // Línea de pase: por detrás/al costado del balón, en el carril opuesto al portador
    const holderLane = bp.z > 0 ? -1 : 1;
    const side = p.home.z >= 0 ? 1 : -1;
    // Si el portador está en un lado, el support va al otro para dar salida
    const targetSide = bp.z * holderLane > 4 ? -holderLane : side;
    target = new THREE.Vector3(bp.x - 6.5 * t.dir, 0, bp.z + targetSide * 7);
    target.z = clamp(target.z, -HALF_W + 3, HALF_W - 3);
    keepOut(target, bp, 6);
    sprint = target.distanceTo(p.mesh.position) > 8;
  } else if (role === "cover") {
    // Cobertura del presser: entre el balón y el arco propio, pero desplazado
    // hacia el lado del balón para tapar el pase filtrado
    const sideOffset = bp.z > 0 ? 3 : -3;
    target = bp.clone().setY(0).lerp(goalOwn, 0.35);
    target.z += sideOffset;
    keepOut(target, bp, 5.6);
    sprint = target.distanceTo(p.mesh.position) > 6;
  } else if (role === "mark") {
    const mark = info.mark;
    if (mark) {
      // Marcación más inteligente: entre el rival y nuestro arco, no pegado al rival
      const mp = mark.mesh.position.clone().setY(0);
      const toGoal = goalOwn.clone().sub(mp).setY(0);
      const len = toGoal.length() || 1;
      // Distancia de marcaje según cercanía al balón
      const ballToMark = mark.mesh.position.distanceTo(bp);
      const markDist = ballToMark < 8 ? 2.5 : 4; // más pegado si el rival está cerca del balón
      target = mp.addScaledVector(toGoal.multiplyScalar(1 / len), markDist);
      target.lerp(struct, 0.25);
    }
    keepOut(target, bp, 5.4);
    sprint = target.distanceTo(p.mesh.position) > 6.5;
  } else {
    // hold: mantiene puesto y línea defensiva
    sprint = target.distanceTo(p.mesh.position) > 9;
  }

  // Línea defensiva: los DEF no se adelantan al balón hacia el arco rival
  if (p.baseRole === "DEF" && ctx.state !== "ATACANDO") {
    const behind = bp.x - 2 * t.dir;
    if ((target.x - behind) * t.dir > 0) target.x = behind;
  }

  // Anti-clustering: separa intenciones de compañeros cercanas entre sí
  ctx.ranked.forEach((o) => {
    if (o === p || !o._aiTarget) return;
    const dx = target.x - o._aiTarget.x;
    const dz = target.z - o._aiTarget.z;
    const d = Math.hypot(dx, dz);
    if (d < 6 && d > 0.001) {
      target.x += (dx / d) * (6 - d) * 0.5;
      target.z += (dz / d) * (6 - d) * 0.5;
    }
  });

  target.x = clamp(target.x, -HALF_L + 2, HALF_L - 2);
  target.z = clamp(target.z, -HALF_W + 2, HALF_W - 2);
  return { target, sprint, role };
}

// ---------------------------------------------------------------- decisiones
// Sistema ponderado: pasar > driblar > tirar según distancia al arco, presión
// rival y compañeros libres.
function bestPass(game, p) {
  const t = TEAMS[p.team];
  let best = null;
  game.players.forEach((o) => {
    if (o === p || o.team !== p.team || o.keeper) return;
    const to = o.mesh.position.clone().sub(p.mesh.position).setY(0);
    const dist = to.length();
    if (dist < 5 || dist > 46) return;
    const block = laneBlock(game, p.mesh.position, o.mesh.position, p.team);
    const upfield = (o.mesh.position.x - p.mesh.position.x) * t.dir;
    const openness = 1 - clamp(pressureAt(game, o.mesh.position, p.team, 6) / 2, 0, 1);
    const score = openness * 1.4 + upfield * 0.045 - block * 1.5 - dist * 0.012;
    if (!best || score > best.score) best = { o, dist, score, dir: to.multiplyScalar(1 / dist) };
  });
  return best;
}

function carryDecide(game, p, ctx, dt) {
  const b = game.ball;
  const bp = b.mesh.position;
  const t = TEAMS[p.team];
  // Guard relajado: la IA puede decidir si está cerca del balón (2.5 en vez de 1.6)
  // y el balón no va demasiado rápido (25 en vez de 17). Antes era tan estricto
  // que la IA casi nunca tomaba decisiones → se movía erráticamente sin hacer nada.
  // P1-MULTIAGENT: kickCooldown por-agente (antes game.kickCooldown, que vía
  // proxy caía en el héroe local incluso cuando un IA acaba de patear).
  if (bp.distanceTo(p.mesh.position) > 2.5 || b.vel.length() > 25 || (p.controller?.kickCooldown ?? 0) > 0) return;

  p.aiThink = (p.aiThink || 0) - dt;
  if (p.aiThink > 0) return;
  p.aiThink = 0.22;

  // Comando de emoji del equipo propio (4s de duración)
  // 0=👆 pedir balón, 1=❗ patear, 2=😡 enojarse, 3=👏 aplaudir
  const emoteCmd = (game.emoteCommandTimer > 0 && game.emoteCommandTeam === p.team) ? game.emoteCommand : -1;
  const hero = game.hero;
  const heroPos = hero ? hero.mesh.position : null;

  const goalCenter = new THREE.Vector3(HALF_L * t.dir, 0, 0);
  const gd = goalCenter.distanceTo(p.mesh.position);
  const press = pressureAt(game, p.mesh.position, p.team, 6.5);
  const agg = ctx.agg;

  // ¿Está en campo rival? (necesario para tirar al arco rival)
  // team red ataca hacia +x (t.dir=1), team blue hacia -x (t.dir=-1)
  // "Campo rival" = estar del lado del arco rival: p.x * t.dir > 0
  const inAttackHalf = p.mesh.position.x * t.dir > -3; // un poco de margen

  // --- TIRO: solo si está en campo rival Y en rango razonable
  // Si no está en campo rival, NO tira (evita goles desde su campo que terminan en contra)
  const shootBlock = laneBlock(game, p.mesh.position, goalCenter, p.team, 1.8);
  const rangeScore = clamp(1 - (gd - 8) / 22, 0, 1);
  // Shoot score: requiere inAttackHalf + rangeScore decente + poco bloqueo
  let shoot = inAttackHalf
    ? rangeScore * 2.8 * agg - shootBlock * 1.1 + press * 0.3
    : -10; // negativo: nunca tirar desde campo propio
  const canShoot = inAttackHalf && gd < 28 && rangeScore > 0.15;
  // Comando ❗ patear: la IA prefiere tirar aunque esté lejos
  if (emoteCmd === 1) {
    shoot += 1.5;
    if (inAttackHalf && gd < 35) canShoot = true;
  }

  // --- pase (priorizar cuando hay compañero libre o presión alta)
  let pass = bestPass(game, p);
  let passScore = pass
    ? pass.score * 1.1 + press * 1.0 + (pass.score > 0.5 ? 0.4 : 0)
    : -1;
  // Comando 👆 pedir balón: la IA prefiere pasar al héroe
  if (emoteCmd === 0 && heroPos && p !== hero) {
    // Buscar pase específicamente al héroe
    const heroDist = p.mesh.position.distanceTo(heroPos);
    if (heroDist > 4 && heroDist < 50) {
      // Forzar pase al héroe
      pass = { o: hero, dist: heroDist, score: 2.0, dir: heroPos.clone().sub(p.mesh.position).setY(0).normalize() };
      passScore = 3.0; // prioridad máxima
    }
  }
  // Comando 😡 enojarse: la IA es más agresiva (menos pases, más dribbling/tiro)
  if (emoteCmd === 2) {
    passScore *= 0.7;
    shoot += 0.5;
  }
  // Comando 👏 aplaudir: la IA es más paciente (más pases, menos tiro)
  if (emoteCmd === 3) {
    passScore += 0.5;
    shoot *= 0.7;
  }

  // --- dribbling — bajo score: la IA prefiere pasar o tirar antes que driblar
  const ahead = new THREE.Vector3(p.mesh.position.x + 8 * t.dir, 0, p.mesh.position.z);
  let dribble = 0.45 - press * 0.85 - laneBlock(game, p.mesh.position, ahead, p.team, 2.4) * 0.5;

  const bestScore = Math.max(shoot, passScore, dribble);
  if (bestScore === shoot && canShoot && shoot > 0.55) {
    // Apuntar al centro del arco rival con algo de dispersión (no a las esquinas)
    // para maximizar chances de ir al arco
    const aimZ = (Math.random() - 0.5) * (FIELD.GOAL_W * 0.6); // dentro del arco
    const aim = new THREE.Vector3(HALF_L * t.dir, 0, aimZ).sub(p.mesh.position).setY(0).normalize();
    const power = clamp(34 + (1 - rangeScore) * 18, 34, 54);
    b.vel.copy(aim.multiplyScalar(power));
    b.vel.y = 3.1 + Math.random() * 1.8;
    b.spin.set(0, (Math.random() - 0.5) * 8, 0);
    // P1-MULTIAGENT: kickCooldown por-agente + flag de input para traceability.
    if (p.controller) p.controller.kickCooldown = 0.22;
    if (p.controller?.input) p.controller.input.shoot = true;
    // P1-PR-TEST: PR por tiro de la IA. Mismo esquema que el engine: shotOff
    // base (+2). El "onTarget" real se detecta en _keeperSave; aquí no lo
    // sabemos. También bump de shots en playerStats (la IA no pasa por
    // _shoot, así que hay que bumparlo acá).
    if (game._bumpStat) game._bumpStat(p, "shots");
    awardPR(p, "shotOff");
    p.aiThink = 0.5;
  } else if (bestScore === passScore && pass) {
    const leadT = clamp(pass.dist / 26, 0.15, 0.7);
    const lead = pass.o.mesh.position.clone().addScaledVector(pass.o.vel, leadT).setY(0);
    lead.x = clamp(lead.x, -HALF_L + 2, HALF_L - 2);
    lead.z = clamp(lead.z, -HALF_W + 2, HALF_W - 2);
    const dir = lead.sub(p.mesh.position).setY(0).normalize();
    b.vel.copy(dir.multiplyScalar(clamp(17 + pass.dist * 0.72, 18, 38)));
    b.vel.y = 0.7 + Math.min(1.3, pass.dist * 0.028);
    b.spin.set(0, 0, 0);
    // P1-MULTIAGENT: kickCooldown por-agente + flag de input.
    if (p.controller) p.controller.kickCooldown = 0.2;
    if (p.controller?.input) p.controller.input.pass = true;
    // P1-PR-TEST: PR por pase de la IA + bump de passes en playerStats.
    if (game._bumpStat) game._bumpStat(p, "passes");
    awardPR(p, "passCompleted");
    p.aiThink = 0.36;
  } else {
    // conducción: toque corto al espacio (solo si no hay presión fuerte)
    const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
    b.vel.x = fwd.x * 12 + p.vel.x * 0.5;
    b.vel.z = fwd.z * 12 + p.vel.z * 0.5;
  }
}

// Barrida: sólo el presser designado, con el rival en posesión clara y con
// cooldown por jugador + cooldown de equipo. Frecuencia baja para no vivir barriendo.
function maybeTackle(game, p, ctx, dt) {
  if (p.aiTackleCd > 0) p.aiTackleCd -= dt;
  if (game._teamTackleCd) {
    game._teamTackleCd[p.team] = Math.max(0, (game._teamTackleCd[p.team] || 0) - dt);
  }
  if (ctx.presser !== p || p.slide > 0 || p.aiTackleCd > 0) return;
  if ((game._teamTackleCd?.[p.team] || 0) > 0) return;
  const holder = ctx.holder;
  if (!holder || holder.team === p.team) return;
  const bp = game.ball.mesh.position;
  if (holder.mesh.position.distanceTo(bp) > 1.9) return; // sin posesión clara
  const d = p.mesh.position.distanceTo(holder.mesh.position);
  if (d > 2.9 || d < 0.9) return;
  // Frecuencia más baja: 2.5% por frame * agg (era 5%).
  // La barrida es un recurso táctico, no algo que se hace en cada oportunidad.
  if (Math.random() > 0.025 * ctx.agg) return;

  game._teamTackleCd[p.team] = 3.0; // cooldown de equipo: 3s (era 1.5s)
  const dir = bp.clone().sub(p.mesh.position).setY(0).normalize();
  p.slide = 0.6;
  p.slideDir.copy(dir);
  p.slideTarget = holder;
  p.slideAssist = 0.35; // Asistido: tracking suave del portador durante la barrida (mismo que el humano)
  p.stoleThis = false;
  p.slideBrake = false;
  p.shieldBounce = false;
  p.vel.x = dir.x * 24;
  p.vel.z = dir.z * 24;
  p.aiTackleCd = 3.5; // cooldown individual: 3.5s (era 2.1s)
  // P1-MULTIAGENT: flag de input por-agente para traceability.
  if (p.controller?.input) p.controller.input.tackle = true;
  // P1-PR-TEST: la IA no pasa por _tackle() del engine (modifica p.slide
  // directo), así que bumpamos tackles (intentos) acá y marcamos el
  // pending para que el loop aplique tackleMissed (-5) si no roba.
  if (game._bumpStat) game._bumpStat(p, "tackles");
  p._prTacklePending = true;
}

// ---------------------------------------------------------------- field AI
export function updateAI(game, p, dt) {
  if (p.keeper) return updateKeeper(game, p, dt);

  const ctx = teamCtx(game, p.team);
  const { target, sprint, role } = moveTargetFor(game, p, ctx);
  p.role = role;
  p.aiState = ctx.state;
  p._aiTarget = target.clone();

  const to = target.sub(p.mesh.position).setY(0);
  const dist = to.length();
  const moveDir = dist > 0.6 ? to.normalize() : new THREE.Vector3();
  game._movePlayer(p, moveDir, sprint && dist > 3, dt);

  // P1-MULTIAGENT: espejar input del IA a su controller.input para
  // traceability / networking. El engine NO consume estos flags hoy (la
  // IA sigue modificando b.vel/p.slide directamente), pero quedan
  // registrados para debugging y para el futuro refactor que rutee la IA
  // por los métodos de acción del engine. Limpiar flags transitorios
  // (shoot/pass/tackle/dash) al inicio de cada frame.
  const c = p.controller;
  if (c && c.input) {
    c.input.ax = moveDir.x;
    c.input.az = moveDir.z;
    c.input.sprint = !!(sprint && dist > 3);
    // shoot/pass/tackle/dash son transitorios — los limpia acá y los
    // vuelve a setear carryDecide / maybeTackle si deciden actuar.
    // (dash no lo usa la IA hoy.)
    c.input.shoot = false;
    c.input.pass = false;
    c.input.tackle = false;
    c.input.dash = false;
  }

  maybeTackle(game, p, ctx, dt);
  if (role === "carry" || role === "chase") carryDecide(game, p, ctx, dt);
}
