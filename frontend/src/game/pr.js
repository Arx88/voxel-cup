// === P1-PR-TEST: Puntos de Rendimiento (PR) por-jugador en vivo ===========
//
// PR es la moneda de progreso del jugador: cada acción en cancha suma (o
// resta) puntos. Al final del partido, el PR total se convierte en XP y
// coins con multiplicador de racha.
//
// Especificación (doc sección 06):
//   Gol +100 (+25 extra si fuera de área o chilena)
//   Asistencia +60 (último pase dentro de ventana de 6s)
//   Pase clave / filtrado que genera tiro +18
//   Pase completado +4 (cap 25 pases contados)
//   Tiro al arco +8 (+4 si sweet spot)
//   Tiro afuera +2
//   Barrida perfecta +30
//   Robo / barrida normal +15
//   Regate exitoso +10
//   Atajada (arquero humano) +35 (+15 si palomita)
//   Valla invicta +40 (al final)
//   Pérdida de balón bajo presión -8
//   Barrida fallida -5 (-12 si deja al rival 1v1)
//   Fuera de posición sostenido (>15s) -10
//   Gol en contra -40
//
// Este módulo es puro: no depende de THREE ni del Game. Sólo lee/escribe
// `player.controller.pr` y `player.controller.prPassCap`. El motor lo llama
// cuando suceden eventos (gol, pase, tiro, barrida, etc.).

// Tabla de puntos por evento. La usan awardPR/getPR/finalPR.
export const PR_TABLE = {
  goal: 100,
  goalBonus: 25,
  assist: 60,
  keyPass: 18,
  passCompleted: 4,
  shotOnTarget: 8,
  sweetSpot: 4,
  shotOff: 2,
  perfectTackle: 30,
  tackle: 15,
  dribble: 10,
  save: 35,
  saveDive: 15,
  cleanSheet: 40,
  turnover: -8,
  tackleMissed: -5,
  tackleMissedBad: -12,
  outOfPosition: -10,
  ownGoal: -40,
};

// Otorga PR a un jugador. Llamado desde el engine cuando suceden eventos.
// Si `key` no está en la tabla (typo), no hace nada — pero `extra` siempre
// se aplica (para bonus dinámicos como goalBonus, saveDive, etc.).
export function awardPR(player, key, extra = 0) {
  if (!player || !player.controller) return;
  const base = PR_TABLE[key] || 0;
  player.controller.pr = (player.controller.pr || 0) + base + extra;
  // Cap de pases contados: el spec dice "cap of 25 passes counted". Lo
  // aplicamos aquí vía un contador en el controller. Si la key es
  // 'passCompleted', incrementamos el contador; si excede 25, no sumamos.
  if (key === "passCompleted") {
    player.controller.prPassCount = (player.controller.prPassCount || 0) + 1;
    if (player.controller.prPassCount > 25) {
      // Devolver el +4 que ya sumamos: el cap significa "no se cuentan más".
      player.controller.pr -= base; // base === 4
    }
  }
}

// Devuelve el PR actual de un jugador (0 si no tiene controller).
export function getPR(player) {
  return player?.controller?.pr || 0;
}

// Resetea el PR de todos los jugadores al iniciar un partido.
export function resetAllPR(players) {
  if (!players) return;
  players.forEach((p) => {
    if (p && p.controller) {
      p.controller.pr = 0;
      p.controller.prPassCount = 0;
    }
  });
}

// Construye el snapshot de PR para la HUD. Filtra arqueros (los arqueros
// humanos se muestran aparte en el HUD de atajadas; aquí van los de campo).
// Combina PR con playerStats (goals/assists/tackles/saves/passes/shots) si
// están disponibles en el snapshot del engine.
//
// Resultado: [{name, team, role, formationIdx, pr, goals, assists, tackles,
//   saves, passes, shots, isLocal, isRemote}, ...] ordenado por PR descendente
// (mejor jugador primero). `formationIdx` + `isLocal`/`isRemote` permiten a
// la post-match screen matchear contra playerStats y resaltar al héroe.
export function buildPRSnapshot(players, playerStats = null, profileName = "") {
  if (!players) return [];
  const rows = players
    .filter((p) => !p.keeper)
    .map((p) => {
      const statsKey = `${p.team}-${p.formationIdx}`;
      const s = playerStats?.[statsKey] || {};
      return {
        name: p.controller?.isLocal ? (profileName || "JUGADOR") : (p.baseRole || `#${p.number || 0}`),
        team: p.team,
        role: p.baseRole,
        formationIdx: p.formationIdx,
        pr: Math.max(0, getPR(p)),
        goals: s.goals || 0,
        assists: s.assists || 0,
        tackles: s.tacklesWon || 0,
        saves: s.saves || 0,
        passes: s.passes || 0,
        shots: s.shots || 0,
        isLocal: !!p.controller?.isLocal,
        isRemote: !!p.controller?.isRemote,
      };
    });
  rows.sort((a, b) => b.pr - a.pr);
  return rows;
}

// Cálculo final de PR con bonos de resultado.
//   Victoria: +80
//   Empate:   +30
//   Derrota:  +10
// El bonus de MVP (+50) lo calcula el llamador (porque requiere comparar
// contra los PR de todo el equipo) y se pasa como `isMVP`.
export function finalPR(player, matchResult, isMVP = false) {
  let pr = Math.max(0, getPR(player));
  const bonus =
    matchResult?.winner === player?.team ? 80 :
    matchResult?.winner === "draw" ? 30 : 10;
  pr += bonus;
  if (isMVP) pr += 50;
  return pr;
}

// Convierte PR en XP y coins con multiplicador de racha.
//   XP = PR * 1.0 * mult
//   Coins = PR * 0.35 + 15
//   mult = 1 + min(0.25, streak * 0.05)  → cap a +25% en racha de 5+
export function prToRewards(pr, streak = 0) {
  const mult = 1 + Math.min(0.25, streak * 0.05);
  const xp = Math.round(pr * 1.0 * mult);
  const coins = Math.round(pr * 0.35) + 15;
  return { xp, coins, streakMult: mult };
}

// XP necesaria para alcanzar el nivel n (curva suave: 100 * n^1.35).
//   Nivel 1: 100 XP
//   Nivel 5: 886 XP
//   Nivel 10: 2239 XP
//   Nivel 20: 5720 XP
export function xpForLevel(n) {
  return Math.round(100 * Math.pow(n, 1.35));
}
