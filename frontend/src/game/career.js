// === P3-CAREER-POSTMATCH: Career progression (localStorage) ===============
//
// El "career" es la persistencia del jugador entre partidos: nivel, XP,
// monedas, racha de victorias, historial (últimos 20), items desbloqueados
// (kits/skins/accesorios/celebraciones) y challenges semanales.
//
// Especificación (doc sección 09):
//   XP ganada por partido = PR * 1.0 * mult (racha)
//   Monedas = PR * 0.35 + 15
//   Racha: +5% por victoria, cap +25% (racha 5+)
//   Bonus PR final: +80 victoria / +30 empate / +10 derrota; +50 MVP
//   Curva de nivel: 100 * n^1.35 (nivel 1=100, 5=886, 10=2239, 20=5720)
//
// Este módulo es puro: no depende de THREE ni del Game. Sólo lee/escribe
// localStorage. La HUD llama a applyMatchResult() cuando s.matchEnded pasa
// a true, y buyItem() cuando el usuario compra algo en la tienda.
//
// El "score" del historial se guarda como {red, blue} (objeto) para que el
// post-match pueda mostrar el resultado exacto. La Lobby normaliza a string
// "R-B" al mostrar el historial (ver ResultPill en Lobby.jsx).

const KEY = "voxelcup.career";

const DEFAULT_CAREER = {
  level: 1,
  xp: 0,
  coins: 0,
  streak: 0,           // win streak
  history: [],          // last 20 matches [{result:'W'|'L'|'D', score:{red,blue}, pr, goals, assists, date}]
  unlocked: {           // which items are unlocked
    kits: ["classic-red", "classic-blue"],  // 2 starting kits
    skins: ["#f4c69a", "#e8b083", "#c78855", "#8f5a34"],  // 4 starting skins
    accessories: ["none"],
    celebrations: ["default"],
  },
  challenges: {         // weekly challenges
    week: null,         // ISO week identifier
    list: [],           // [{id, desc, goal, progress, reward, claimed}]
  },
};

// Carga el career desde localStorage, mergueando con DEFAULTS. Si no hay
// nada guardado (first-time), devuelve un DEFAULT fresco. Si la versión
// guardada es vieja (sin unlocked/challenges), esos campos se rellenan
// desde DEFAULT_CAREER porque el spread de primer nivel no los sobreescribe.
export function loadCareer() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Deep-merge unlocked + challenges (shallow spread no los junta bien
      // si el saved los tiene parciales o como undefined).
      const unlocked = parsed.unlocked
        ? { ...DEFAULT_CAREER.unlocked, ...parsed.unlocked }
        : { ...DEFAULT_CAREER.unlocked };
      const challenges = parsed.challenges
        ? { ...DEFAULT_CAREER.challenges, ...parsed.challenges }
        : { ...DEFAULT_CAREER.challenges };
      return { ...DEFAULT_CAREER, ...parsed, unlocked, challenges };
    }
  } catch (e) { /* no-op */ }
  return { ...DEFAULT_CAREER };
}

// Guarda el career en localStorage. Best-effort: ignora errores de quota.
export function saveCareer(career) {
  try { localStorage.setItem(KEY, JSON.stringify(career)); } catch (e) { /* no-op */ }
}

// XP needed for level n (curva suave: 100 * n^1.35).
//   Nivel 1: 100 XP
//   Nivel 5: 886 XP
//   Nivel 10: 2239 XP
//   Nivel 20: 5720 XP
export function xpForLevel(n) {
  return Math.round(100 * Math.pow(n, 1.35));
}

// Aplica el resultado de un partido al career y devuelve el diff (XP/coins
// ganados, PR final, multiplicador de racha, flag de level-up).
//
// matchData: {winner:'red'|'blue'|'draw', myTeam:'red'|'blue', pr, goals,
//              assists, tackles, saves, isMVP, score:{red,blue}, standings?}
//
// El PR que llega es el "en bruto" (acumulado durante el partido). Acá se
// le suman los bonuses de resultado (win/draw/loss) y de MVP. Ese PR final
// se convierte en XP y coins con el multiplicador de racha.
export function applyMatchResult(career, matchData) {
  if (!career || !matchData) return null;
  const isWin = matchData.winner === matchData.myTeam;
  const isDraw = matchData.winner === "draw";

  // Streak multiplier (cap +25% en racha 5+).
  const newStreak = isWin ? (career.streak || 0) + 1 : 0;
  const streakMult = 1 + Math.min(0.25, newStreak * 0.05);

  // Final PR with bonuses.
  const bonus = isWin ? 80 : isDraw ? 30 : 10;
  const mvpBonus = matchData.isMVP ? 50 : 0;
  const finalPR = Math.max(0, matchData.pr || 0) + bonus + mvpBonus;

  // XP and coins.
  const xpGained = Math.round(finalPR * 1.0 * streakMult);
  const coinsGained = Math.round(finalPR * 0.35) + 15;

  // Apply.
  const newCareer = { ...career, unlocked: { ...career.unlocked }, challenges: { ...career.challenges } };
  newCareer.xp = (career.xp || 0) + xpGained;
  newCareer.coins = (career.coins || 0) + coinsGained;
  newCareer.streak = newStreak;

  // Level up (can level up multiple times).
  const prevLevel = career.level || 1;
  newCareer.level = prevLevel;
  while (newCareer.xp >= xpForLevel(newCareer.level)) {
    newCareer.xp -= xpForLevel(newCareer.level);
    newCareer.level += 1;
  }

  // History (keep last 20, most-recent first).
  newCareer.history = [
    {
      result: isWin ? "W" : isDraw ? "D" : "L",
      score: matchData.score || { red: 0, blue: 0 },
      pr: finalPR,
      goals: matchData.goals || 0,
      assists: matchData.assists || 0,
      date: new Date().toISOString(),
    },
    ...(career.history || []),
  ].slice(0, 20);

  saveCareer(newCareer);
  return {
    newCareer,
    xpGained,
    coinsGained,
    finalPR,
    streakMult,
    leveledUp: newCareer.level > prevLevel,
    levelsGained: newCareer.level - prevLevel,
  };
}

// Compra un item de la tienda. Descuenta coins y lo agrega a unlocked.
// Retorna {success, newCareer} o {success:false, error}.
export function buyItem(career, itemType, itemId, price) {
  if (!career || !itemType || !itemId) return { success: false, error: "Datos inválidos" };
  if ((career.coins || 0) < price) return { success: false, error: "No hay monedas suficientes" };
  const unlocked = { ...career.unlocked };
  if (!unlocked[itemType]) unlocked[itemType] = [];
  if (unlocked[itemType].includes(itemId)) return { success: false, error: "Ya lo tenés" };
  unlocked[itemType] = [...unlocked[itemType], itemId];
  const newCareer = { ...career, coins: career.coins - price, unlocked };
  saveCareer(newCareer);
  return { success: true, newCareer };
}

// Export/import career (backup). Útil para migrar entre dispositivos.
export function exportCareer() {
  return JSON.stringify(loadCareer(), null, 2);
}

export function importCareer(json) {
  try {
    const data = JSON.parse(json);
    const unlocked = data.unlocked
      ? { ...DEFAULT_CAREER.unlocked, ...data.unlocked }
      : { ...DEFAULT_CAREER.unlocked };
    const challenges = data.challenges
      ? { ...DEFAULT_CAREER.challenges, ...data.challenges }
      : { ...DEFAULT_CAREER.challenges };
    saveCareer({ ...DEFAULT_CAREER, ...data, unlocked, challenges });
    return true;
  } catch (e) { return false; }
}
