import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Clock, X, RotateCcw, Video, Trophy, Coins, Star, TrendingUp, ArrowUp } from "lucide-react";
import { Minimap } from "./Minimap";
import { ActionWheel } from "./ActionWheel";
import { PowerupBar } from "./PowerupBar";
import { DownloadProjectButton } from "./DownloadProjectButton";
import { KickoffCountdown } from "./KickoffCountdown";
import { HalftimeScreen } from "./HalftimeScreen";
import { POWERUPS } from "../game/powerups";
import { sfx } from "../game/audio";
import { loadProfile } from "../game/appearance";
import { loadCareer, applyMatchResult, xpForLevel } from "../game/career";
import { prToRewards } from "../game/pr";

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

const EMPTY = {
  score: { red: 0, blue: 0 },
  clock: 180,
  half: 1,
  halfLabel: "PRIMER TIEMPO",
  halftime: false,
  halftimeCount: 0,
  matchEnded: false,
  winner: null,
  kickoffCount: 0,
  stamina: 1,
  power: 0,
  superMeter: 0,
  charging: false,
  hasBall: false,
  goalText: null,
  goalScorer: null,
  goalScorerName: null,
  goalScorerHero: false,
  camMode: "area",
  superReady: false,
  superFx: 0,
  cd: { tackle: 0, dash: 0 },
  chips: [],
  toast: null,
  stats: { red: {}, blue: {} },
  goals: [],
  heroStats: {},
  // === Phase 3: HUD FIFA + rating 1-10 ===
  ballHolder: null,
  ballHolderRating: null,
  playerRatings: { red: [], blue: [] },
};

const Key = ({ children }) => (
  <span className="px-[6px] py-[1px] rounded bg-white/90 text-[#101a33] font-extrabold text-[10px] tracking-wide">
    {children}
  </span>
);

// -------- helpers de estadísticas ----------
const StatRow = ({ label, red, blue, unit = "" }) => {
  const total = Math.max(1, (red || 0) + (blue || 0));
  const rp = ((red || 0) / total) * 100;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-white/90 text-sm font-black tracking-widest mb-[6px]">
        <span style={{ color: "#ff7583" }}>{Math.round(red || 0)}{unit}</span>
        <span className="text-white/70 text-xs">{label}</span>
        <span style={{ color: "#7fb0ff" }}>{Math.round(blue || 0)}{unit}</span>
      </div>
      <div className="relative w-full h-[6px] rounded-full overflow-hidden bg-white/10">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${rp}%`,
            background: "linear-gradient(90deg,#ff2d3c,#ff5a6b)",
            boxShadow: "0 0 12px rgba(255,45,60,0.6)",
            transition: "width 800ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
        <div
          className="absolute inset-y-0 right-0"
          style={{
            width: `${100 - rp}%`,
            background: "linear-gradient(270deg,#2f74ff,#7fb0ff)",
            boxShadow: "0 0 12px rgba(47,116,255,0.6)",
            transition: "width 800ms cubic-bezier(.2,.8,.2,1)",
          }}
        />
        <div className="absolute inset-y-0 left-1/2 w-[2px] bg-white/40" />
      </div>
    </div>
  );
};

// Phase 3: barra inferior estilo FIFA — muestra quién tiene el balón y su rating 1-10.
const FifaHudBar = ({ s }) => {
  const holder = s.ballHolder;
  const rating = s.ballHolderRating;
  if (!holder) {
    return (
      <div
        data-testid="fifa-hud-bar"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full bg-[#101a33]/90 border-2 border-white/25 backdrop-blur-md text-sm font-bold tracking-widest text-white/70"
      >
        BALÓN SUELTO
      </div>
    );
  }
  const teamColor = holder.team === "red" ? "#ff1e33" : "#0f5cff";
  const ratingColor = rating >= 7 ? "#7dff5a" : rating >= 5 ? "#ffd21c" : "#ff5a5a";
  return (
    <div
      data-testid="fifa-hud-bar"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-2 rounded-full bg-[#101a33]/90 border-2 border-white/25 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
    >
      <span className="w-3 h-3 rounded-full" style={{ background: teamColor, boxShadow: `0 0 10px ${teamColor}` }} />
      <span className="text-white/70 text-sm font-bold">#{holder.number}</span>
      <span className="text-white text-base font-extrabold tracking-wide uppercase">{holder.name}</span>
      <span
        className="ml-3 text-2xl font-black tabular-nums"
        style={{ color: ratingColor, textShadow: `0 0 12px ${ratingColor}` }}
      >
        {rating != null ? rating.toFixed(1) : "--"}
      </span>
    </div>
  );
};

const GoalStrip = ({ goals, team, side }) => {
  const list = goals.filter((g) => g.team === team);
  return (
    <div
      className={`flex flex-col gap-[6px] ${side === "left" ? "items-end text-right" : "items-start text-left"}`}
      style={{ minWidth: 180 }}
    >
      {list.length === 0 && (
        <span className="text-white/40 text-xs italic tracking-widest">SIN GOLES</span>
      )}
      {list.map((g, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-sm font-black"
          style={{
            animation: `chipIn 380ms cubic-bezier(.2,1.5,.3,1) ${i * 90}ms both`,
            color: team === "red" ? "#ff7583" : "#7fb0ff",
            textShadow: `0 0 12px ${team === "red" ? "rgba(255,45,60,0.55)" : "rgba(47,116,255,0.55)"}`,
          }}
        >
          {side === "left" && (
            <>
              <span className="uppercase tracking-widest">{g.scorer || (g.byHero ? "TU HÉROE" : "EQUIPO")}</span>
              <span className="text-white/60">·</span>
              <span className="text-white/80">{g.minute}'</span>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
                  background: "#ffd21c",
                  boxShadow: "0 0 10px #ffd21c",
                }}
              />
            </>
          )}
          {side === "right" && (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)",
                  background: "#ffd21c",
                  boxShadow: "0 0 10px #ffd21c",
                }}
              />
              <span className="text-white/80">{g.minute}'</span>
              <span className="text-white/60">·</span>
              <span className="uppercase tracking-widest">{g.scorer || (g.byHero ? "TU HÉROE" : "EQUIPO")}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

// Trofeo voxel construido con cubos CSS
const VoxelTrophy = ({ color = "#ffd21c" }) => (
  <div
    className="relative"
    style={{
      width: "clamp(6rem,10vw,10rem)",
      height: "clamp(9rem,14vw,14rem)",
      animation: "trophyFloat 3.6s ease-in-out infinite",
      filter: `drop-shadow(0 24px 40px ${color}66) drop-shadow(0 0 40px ${color}80)`,
    }}
  >
    <div
      className="absolute left-1/2 -translate-x-1/2 top-[6%]"
      style={{
        width: "78%",
        height: "50%",
        background: `linear-gradient(180deg,${color},#a0740a 90%)`,
        clipPath: "polygon(10% 0,90% 0,100% 65%,50% 100%,0 65%)",
        border: "3px solid #fff",
        boxShadow: `inset 0 -12px 0 rgba(0,0,0,0.25), 0 0 40px ${color}70`,
      }}
    />
    <div
      className="absolute left-[8%] top-[24%]"
      style={{
        width: "20%",
        height: "34%",
        background: `linear-gradient(90deg,${color},#a0740a)`,
        border: "3px solid #fff",
        borderRadius: 999,
      }}
    />
    <div
      className="absolute right-[8%] top-[24%]"
      style={{
        width: "20%",
        height: "34%",
        background: `linear-gradient(270deg,${color},#a0740a)`,
        border: "3px solid #fff",
        borderRadius: 999,
      }}
    />
    <div
      className="absolute left-1/2 -translate-x-1/2 top-[62%]"
      style={{
        width: "16%",
        height: "12%",
        background: "#a0740a",
        border: "3px solid #fff",
      }}
    />
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-0"
      style={{
        width: "56%",
        height: "18%",
        background: `linear-gradient(180deg,${color},#a0740a)`,
        clipPath: "polygon(6% 0,94% 0,100% 100%,0% 100%)",
        border: "3px solid #fff",
        boxShadow: `inset 0 -8px 0 rgba(0,0,0,0.3)`,
      }}
    />
    {/* estrellas voxel */}
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="absolute block"
        style={{
          left: `${18 + i * 30}%`,
          top: "18%",
          width: 10,
          height: 10,
          background: "#fff",
          clipPath: "polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
          animation: `starTwinkle ${1.4 + i * 0.3}s ease-in-out ${i * 200}ms infinite`,
        }}
      />
    ))}
  </div>
);

// ============================================================ P3: POST-MATCH
// Helpers para la pantalla de fin de partido. Construye standings desde el
// snapshot (playerStats + prSnapshot), encuentra el MVP (mayor PR en equipo
// ganador, o global si empate), y aplica el resultado al career (XP, coins,
// racha, level-up). Se llama UNA vez cuando s.matchEnded pasa a true.

const ROLE_LABEL = { GK: "ARQ", DEF: "DEF", MID: "MED", FWD: "ATA" };
const ROLE_FULL = { GK: "ARQUERO", DEF: "DEFENSA", MID: "MEDIO", FWD: "ATACANTE" };

function buildEndData(snap, gameRef) {
  const pr = Array.isArray(snap?.prSnapshot) ? snap.prSnapshot : [];
  if (pr.length === 0) return null;
  const score = snap?.score || { red: 0, blue: 0 };
  const winner =
    snap?.winner ||
    (score.red === score.blue ? "draw" : score.red > score.blue ? "red" : "blue");

  // Hero team + formationIdx from the live engine (works on host and client).
  const ctrl = gameRef.current?.controlled;
  const heroTeam = ctrl?.team || "red";
  const heroFIdx = ctrl?.formationIdx;

  // Standings: enrich prSnapshot with per-player XP/coins (no win/MVP bonus).
  // prSnapshot is already filtered (no keepers) + sorted by PR desc.
  const standings = pr.map((row) => {
    const r = prToRewards(row.pr || 0, 0);
    return {
      ...row,
      xp: r.xp,
      coins: r.coins,
    };
  });

  // MVP: highest PR on winning team; if draw, overall highest PR.
  const mvpPool = winner === "draw" ? standings : standings.filter((r) => r.team === winner);
  const mvpRow = (mvpPool.length ? mvpPool : standings).reduce(
    (best, r) => (!best || r.pr > best.pr ? r : best),
    null
  );

  // Hero row: match by (team, formationIdx) — robust on both host & client.
  // Fallback: isLocal flag (host view) → first row of heroTeam.
  const heroRow =
    standings.find((r) => r.team === heroTeam && r.formationIdx === heroFIdx) ||
    standings.find((r) => r.isLocal) ||
    standings.find((r) => r.team === heroTeam) ||
    standings[0];

  const isMVP = !!(mvpRow && heroRow &&
    mvpRow.team === heroRow.team &&
    mvpRow.formationIdx === heroRow.formationIdx);

  // Apply match result to career (writes localStorage + returns diff).
  const careerBefore = loadCareer();
  const matchData = {
    winner,
    myTeam: heroTeam,
    pr: heroRow?.pr || 0,
    goals: heroRow?.goals || 0,
    assists: heroRow?.assists || 0,
    tackles: heroRow?.tackles || 0,
    saves: heroRow?.saves || 0,
    isMVP,
    score,
  };

  // P3: idempotency guard. If the HUD remounts (e.g. after a WebGL context
  // loss + GameCanvas retry), buildEndData would fire again and double-
  // count XP/coins. We skip applyMatchResult if the most recent career
  // history entry already matches this match (same score + winner + PR
  // within the last 60s). The matchEndData fingerprint is also stored in
  // sessionStorage to be extra safe across remounts.
  const fingerprint = `${winner}|${score.red}-${score.blue}|${heroRow?.pr || 0}|${isMVP ? 1 : 0}`;
  let alreadyApplied = false;
  try {
    const sess = sessionStorage.getItem("voxelcup.lastMatchFingerprint");
    if (sess === fingerprint) alreadyApplied = true;
  } catch (e) { /* noop */ }
  // Cross-check against career history (most-recent entry).
  const last = careerBefore.history?.[0];
  if (
    last &&
    last.score &&
    last.score.red === score.red &&
    last.score.blue === score.blue &&
    last.pr === (Math.max(0, matchData.pr) + (winner === heroTeam ? 80 : winner === "draw" ? 30 : 10) + (isMVP ? 50 : 0)) &&
    (Date.now() - new Date(last.date).getTime() < 60000)
  ) {
    alreadyApplied = true;
  }

  let rewards = null;
  let careerAfter = careerBefore;
  if (!alreadyApplied) {
    rewards = applyMatchResult(careerBefore, matchData);
    careerAfter = rewards?.newCareer || careerBefore;
    try { sessionStorage.setItem("voxelcup.lastMatchFingerprint", fingerprint); } catch (e) {}
  } else {
    // Reconstruct a synthetic rewards object so the UI can still display
    // the values (without re-writing localStorage).
    const isWin = winner === heroTeam;
    const isDraw = winner === "draw";
    const bonus = isWin ? 80 : isDraw ? 30 : 10;
    const mvpBonus = isMVP ? 50 : 0;
    const finalPR = Math.max(0, matchData.pr) + bonus + mvpBonus;
    const newStreak = isWin ? (careerBefore.streak || 0) + 1 : 0;
    const streakMult = 1 + Math.min(0.25, newStreak * 0.05);
    rewards = {
      newCareer: careerBefore,
      xpGained: 0,
      coinsGained: 0,
      finalPR,
      streakMult,
      leveledUp: false,
      levelsGained: 0,
    };
  }

  return {
    standings,
    mvpRow,
    heroRow,
    matchData,
    rewards,
    careerBefore,
    careerAfter,
    winner,
    score,
    heroTeam,
  };
}

// Sub-componente: fila de la tabla de standings. Highlight para MVP y héroe.
const StandingRow = ({ row, idx, isMvp, isHero }) => {
  const teamColor = row.team === "red" ? "#ff2d3c" : "#2f74ff";
  const teamBg = row.team === "red" ? "rgba(255,45,60,0.10)" : "rgba(47,116,255,0.10)";
  return (
    <tr
      style={{
        background: isMvp
          ? "linear-gradient(90deg,rgba(255,210,28,0.18),rgba(255,210,28,0.04))"
          : isHero
          ? "rgba(255,255,255,0.06)"
          : teamBg,
        borderTop: isMvp ? "2px solid #ffd21c" : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <td style={{ textAlign: "center", fontWeight: 900, color: isMvp ? "#ffd21c" : "#fff" }}>
        {isMvp ? "★" : idx + 1}
      </td>
      <td style={{ fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>
        {row.name}
        {isHero && <span style={{ color: "#ffd21c", marginLeft: 4, fontSize: 9 }}>(TÚ)</span>}
      </td>
      <td style={{ textAlign: "center" }}>
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 4,
            background: teamColor,
            color: "#fff",
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.08em",
          }}
        >
          {row.team === "red" ? "ROJO" : "AZUL"}
        </span>
      </td>
      <td style={{ textAlign: "center", color: "#fff8", fontSize: 11 }}>{ROLE_LABEL[row.role] || row.role}</td>
      <td style={{ textAlign: "center", color: "#fff" }}>{row.goals || 0}</td>
      <td style={{ textAlign: "center", color: "#fff" }}>{row.assists || 0}</td>
      <td style={{ textAlign: "center", color: "#fff8" }}>{row.shots || 0}</td>
      <td style={{ textAlign: "center", color: "#fff8" }}>{row.passes || 0}</td>
      <td style={{ textAlign: "center", color: "#fff8" }}>{row.tackles || 0}</td>
      <td style={{ textAlign: "center", fontWeight: 900, color: isMvp ? "#ffd21c" : "#fff" }}>{row.pr || 0}</td>
      <td style={{ textAlign: "center", color: "#3df0ff", fontWeight: 700 }}>+{row.xp || 0}</td>
      <td style={{ textAlign: "center", color: "#ffd21c", fontWeight: 700 }}>+{row.coins || 0}</td>
    </tr>
  );
};

export const HUD = ({ gameRef, multiplayer = false }) => {
  const [s, setS] = useState(EMPTY);
  const [menu, setMenu] = useState(false);
  // P3-CAREER-POSTMATCH: cached post-match data (standings + MVP + rewards +
  // career diff). Computed ONCE when s.matchEnded flips true; cleared when
  // the match resets (REVANCHA). Avoids re-running applyMatchResult on every
  // 60ms poll, which would inflate XP/coins.
  const [endData, setEndData] = useState(null);
  const matchEndedRef = useRef(false);
  const profile = useMemo(() => loadProfile(), []);

  useEffect(() => {
    const id = setInterval(() => {
      const snap = gameRef.current?.snapshot;
      if (!snap) return;
      const nowEnded = !!snap.matchEnded;
      setS({
        score: { ...snap.score },
        clock: snap.clock,
        half: snap.half ?? 1,
        halfLabel: snap.halfLabel || "PRIMER TIEMPO",
        halftime: !!snap.halftime,
        matchEnded: nowEnded,
        winner: snap.winner || null,
        kickoffCount: snap.kickoffCount || 0,
        kickoffGo: snap.kickoffGo || 0,
        stamina: snap.stamina ?? 1,
        power: snap.power ?? 0,
        superMeter: snap.superMeter ?? 0,
        charging: !!snap.charging,
        hasBall: !!snap.hasBall,
        goalText: snap.goalText,
        goalScorer: snap.goalScorer,
        goalScorerName: snap.goalScorerName,
        goalScorerHero: !!snap.goalScorerHero,
        camMode: snap.camMode,
        pointerLocked: !!snap.pointerLocked,
        superReady: !!snap.superReady,
        superFx: snap.superFx ?? 0,
        cd: snap.cd || EMPTY.cd,
        chips: snap.chips || [],
        toast: snap.toast || null,
        stats: snap.stats || EMPTY.stats,
        goals: snap.goals || [],
        heroStats: snap.heroStats || {},
        // Entretiempo: contador regresivo
        halftimeCount: snap.halftimeCount ?? 0,
        // Sistema de pausas
        pauses: snap.pauses || null,
        // Phase 3: HUD FIFA
        ballHolder: snap.ballHolder || null,
        ballHolderRating: snap.ballHolderRating ?? null,
        playerRatings: snap.playerRatings || { red: [], blue: [] },
      });
      // P3: build post-match data ONCE when matchEnded flips true. The ref
      // guard prevents re-running on every poll (which would apply match-
      // result N times and inflate XP/coins). We retry while matchEnded is
      // true and endData is still null (prSnapshot may take a tick to land
      // on clients). When matchEnded flips back to false (REVANCHA), clear.
      if (nowEnded) {
        if (!matchEndedRef.current) {
          matchEndedRef.current = true;
          const data = buildEndData(snap, gameRef);
          if (data) setEndData(data);
        } else if (!endData) {
          // Retry: matchEndedRef is set but build failed earlier (no
          // prSnapshot yet). Keep trying every tick until it lands.
          const data = buildEndData(snap, gameRef);
          if (data) setEndData(data);
        }
      } else if (matchEndedRef.current) {
        matchEndedRef.current = false;
        setEndData(null);
        // P3: clear the match fingerprint so the next match can apply its
        // own result (REVANCHA → new match → new fingerprint).
        try { sessionStorage.removeItem("voxelcup.lastMatchFingerprint"); } catch (e) {}
      }
    }, 60);
    return () => clearInterval(id);
  }, [gameRef, endData]);

  const openMenu = (v) => {
    // No permitir pausar durante el kickoff ("EL PARTIDO COMIENZA" / 3-2-1-YA)
    if (v && (s.kickoffCount > 0 || s.kickoffGo > 0)) return;
    // No permitir pausar si el partido terminó
    if (v && s.matchEnded) return;
    // No permitir pausar si no quedan pausas disponibles
    if (v && s.pauses && (s.pauses.red?.remaining ?? 0) <= 0) return;
    sfx.ui();
    setMenu(v);
    // Si estamos pausando, registrar el uso de pausa en el engine
    if (v) {
      gameRef.current?.usePause?.();
    }
    gameRef.current?.setPaused(v);
  };

  // Escuchar cuando el timer de pausa expira para cerrar el menú automáticamente
  useEffect(() => {
    const onExpire = () => setMenu(false);
    window.addEventListener("voxelcup:pause-expired", onExpire);
    return () => window.removeEventListener("voxelcup:pause-expired", onExpire);
  }, []);

  // Estadísticas normalizadas
  const st = s.stats || {};
  const stR = st.red || { shots: 0, tackles: 0, saves: 0, passes: 0, possession: 0 };
  const stB = st.blue || { shots: 0, tackles: 0, saves: 0, passes: 0, possession: 0 };
  const posTotal = Math.max(1, (stR.possession || 0) + (stB.possession || 0));
  const posR = ((stR.possession || 0) / posTotal) * 100;
  const posB = 100 - posR;

  const scorerLabel = s.goalScorerName || (s.goalScorer ? (s.goalScorer === "red" ? "ROJO" : "AZUL") : "");

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-[Baloo_2] text-white">
      {/* MENU */}
      <button
        data-testid="menu-button"
        onClick={() => openMenu(true)}
        disabled={(s.pauses?.red?.remaining ?? 1) <= 0 || s.matchEnded || s.kickoffCount > 0 || s.kickoffGo > 0}
        className="pointer-events-auto absolute top-5 left-5 flex items-center gap-3 pl-4 pr-6 py-3 rounded-2xl bg-[#101a33]/85 border-2 border-white/25 backdrop-blur-md text-xl font-extrabold tracking-wide shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition-transform duration-150 hover:-translate-y-0.5 hover:border-white/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        <Menu size={26} strokeWidth={3} /> MENÚ
        {s.pauses && (s.pauses.red?.remaining ?? 0) > 0 && !s.matchEnded && (
          <span className="ml-1 px-2 py-0.5 rounded-md bg-[#ffd21c] text-[#101a33] text-xs font-black">
            {s.pauses.red.remaining}⏸
          </span>
        )}
      </button>

      {/* SCOREBOARD */}
      <div data-testid="scoreboard" className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="flex items-stretch rounded-2xl border-2 border-white/25 overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <div className="flex items-center px-7 py-2 bg-gradient-to-b from-[#e8323f] to-[#b8121f] text-2xl font-extrabold tracking-widest">
            ROJO
          </div>
          <div className="flex items-center px-7 bg-[#101a33]/95 backdrop-blur-md">
            <span data-testid="score-red" className="text-4xl font-extrabold">{s.score.red}</span>
            <span className="text-3xl font-extrabold mx-3 opacity-70">-</span>
            <span data-testid="score-blue" className="text-4xl font-extrabold">{s.score.blue}</span>
          </div>
          <div className="flex items-center px-7 py-2 bg-gradient-to-b from-[#2f74ff] to-[#123ec0] text-2xl font-extrabold tracking-widest">
            AZUL
          </div>
        </div>
        <div className="-mt-1 px-6 py-1 rounded-b-xl bg-[#101a33]/95 border-2 border-t-0 border-white/25 text-xs font-bold tracking-[0.25em]" style={s.halftime ? { color: "#ffd21c" } : undefined}>
          {s.halftime ? "ENTRETIEMPO" : s.halfLabel}
        </div>

        {/* ACTIVE POWERUPS */}
        <PowerupBar chips={s.chips} />
      </div>

      {/* CLOCK */}
      <div
        data-testid="match-clock"
        className="absolute top-5 right-5 flex items-center gap-3 px-6 py-3 rounded-2xl bg-[#101a33]/85 border-2 border-white/25 backdrop-blur-md text-3xl font-extrabold tabular-nums shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
      >
        <Clock size={26} strokeWidth={3} /> {fmt(s.clock)}
      </div>

      {/* TOAST (powerups, robos, palos) */}
      {s.toast && (
        <div
          key={s.toast.id}
          data-testid="game-toast"
          className="absolute top-[24%] left-1/2 z-30 flex w-[min(92vw,760px)] justify-center px-3 pointer-events-none"
          style={{ transform: "translateX(-50%)", textAlign: "center" }}
        >
          <div style={{ animation: "toastPop 420ms cubic-bezier(.2,1.7,.35,1) both", display: "inline-flex", maxWidth: "100%" }}>
            <div className="relative" style={{ transform: "skewX(-9deg)", maxWidth: "100%" }}>
            <span
              className="absolute -inset-[5px]"
              style={{
                background: s.toast.color,
                clipPath: "polygon(0 0, 100% 0, calc(100% - 10px) 100%, 10px 100%)",
                opacity: 0.9,
                filter: `drop-shadow(0 0 20px ${s.toast.color})`,
              }}
            />
            <div
              className="relative px-9 py-[10px]"
              style={{
                background: "#05070f",
                clipPath: "polygon(0 0, 100% 0, calc(100% - 10px) 100%, 10px 100%)",
              }}
            >
              <span
                className="block whitespace-nowrap text-[clamp(1.1rem,4vw,1.875rem)] font-black tracking-[0.14em]"
                style={{
                  color: s.toast.color,
                  textShadow: `0 0 22px ${s.toast.color}cc, 0 3px 0 rgba(0,0,0,0.9)`,
                  transform: "skewX(9deg)",
                  display: "inline-block",
                }}
              >
                {s.toast.text}
              </span>
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 4px)",
                }}
              />
            </div>
          </div>
          </div>
        </div>
      )}

      {/* MINIMAP (bottom-left) — sin panel de hints */}
      <div className="absolute bottom-5 left-5 flex flex-col gap-2 items-start">
        <Minimap gameRef={gameRef} />
      </div>

      {/* ACTION WHEEL */}
      <ActionWheel gameRef={gameRef} s={s} />

      {/* Phase 3: HUD FIFA — barra inferior con tenedor del balón + rating 1-10 */}
      {!s.matchEnded && !s.halftime && <FifaHudBar s={s} />}

      {/* SUPER SHOT SCREEN FLASH */}
      {s.superFx > 0 && (
        <div
          data-testid="super-shot-flash"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at center, rgba(255,138,31,${0.35 * s.superFx}) 0%, rgba(255,45,45,${0.18 * s.superFx}) 45%, transparent 75%)`,
          }}
        />
      )}

      {/* SUPER READY EDGE GLOW */}
      {s.superReady && !s.goalText && (
        <div
          data-testid="super-ready-glow"
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: "inset 0 0 120px rgba(255,120,30,0.35)",
            animation: "superPulse 1.4s ease-in-out infinite",
          }}
        />
      )}

      {/* GOAL FLASH — con autor del gol */}
      {s.goalText && (
        <div data-testid="goal-banner" className="absolute inset-0 grid place-items-center overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              background:
                s.goalScorer === "red"
                  ? "radial-gradient(circle at center, rgba(255,45,60,0.35) 0%, rgba(255,138,31,0.18) 40%, transparent 70%)"
                  : "radial-gradient(circle at center, rgba(47,116,255,0.35) 0%, rgba(31,138,255,0.18) 40%, transparent 70%)",
              animation: "goalFlash 0.6s ease-out",
            }}
          />
          <div className="relative flex flex-col items-center gap-4 px-6">
            <div className="flex items-end justify-center gap-1">
              {["G", "O", "O", "O", "L", "!"].map((ch, i) => (
                <span
                  key={i}
                  className="text-[5rem] sm:text-[7rem] leading-none font-black tracking-tight"
                  style={{
                    color: "#ffe14d",
                    WebkitTextStroke: s.goalScorer === "red" ? "3px #b8121f" : "3px #123ec0",
                    textShadow:
                      "0 6px 0 rgba(0,0,0,0.55), 0 0 30px rgba(255,225,77,0.65), 0 0 60px rgba(255,138,31,0.5)",
                    animation: `goalLetter 900ms cubic-bezier(.2,1.6,.4,1) ${i * 70}ms both`,
                    transformOrigin: "center bottom",
                    display: "inline-block",
                  }}
                >
                  {ch}
                </span>
              ))}
            </div>
            {/* AUTOR DEL GOL — una sola caja con fondo del color del equipo */}
            <div
              data-testid="goal-scorer"
              className="flex items-center justify-center gap-3 px-8 py-3 rounded-2xl border-4"
              style={{
                background: s.goalScorer === "red" ? "linear-gradient(90deg,#e8323f,#b8121f)" : "linear-gradient(90deg,#2f74ff,#123ec0)",
                borderColor: "#ffe14d",
                boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
                animation: "goalScorerIn 600ms cubic-bezier(.16,1.4,.3,1) 700ms both",
              }}
            >
              <span
                className="text-xl sm:text-2xl font-black tracking-[0.3em] text-white"
                style={{ textShadow: "0 2px 0 rgba(0,0,0,0.6), 0 0 18px rgba(255,225,77,0.6)" }}
              >
                {s.goalScorerHero ? "¡GOL DE" : "ANOTÓ"}
              </span>
              <span
                className="text-2xl sm:text-3xl font-black tracking-wider uppercase text-white"
                style={{ textShadow: "0 2px 0 rgba(0,0,0,0.7), 0 0 18px rgba(255,225,77,0.6)" }}
              >
                {scorerLabel}
              </span>
              {s.goalScorerHero && (
                <span
                  className="text-xl sm:text-2xl font-black tracking-[0.3em] text-white"
                  style={{ textShadow: "0 2px 0 rgba(0,0,0,0.6), 0 0 18px rgba(255,225,77,0.6)" }}
                >
                  !
                </span>
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 40 }).map((_, i) => (
              <span
                key={i}
                className="absolute block"
                style={{
                  left: `${(i * 97) % 100}%`,
                  top: "-10%",
                  width: "10px",
                  height: "16px",
                  background: ["#ff2d3c", "#2f74ff", "#ffd21c", "#20b26a", "#f04a86", "#ffffff", "#ff8a1f"][i % 7],
                  transform: `rotate(${(i * 43) % 360}deg)`,
                  animation: `confettiFall ${2 + ((i * 13) % 20) / 10}s linear ${(i % 10) * 80}ms both`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* POV OVERLAY — pequeño, arriba, no bloquea el click en la cancha */}
      {s.camMode === "pov" && !s.pointerLocked && !s.matchEnded && !menu && (
        <div
          className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 z-30"
          style={{ animation: "chipIn 300ms ease-out both" }}
        >
          <div className="px-4 py-2 rounded-xl bg-[#101a33]/90 border-2 border-[#ffd21c]/50 backdrop-blur-md text-center">
            <div className="text-[#ffd21c] font-black text-sm tracking-wide">MODO POV · Click en la cancha para activar el mouse</div>
            <div className="text-white/50 text-[10px] mt-0.5">Mové el mouse para mirar · ESC para salir</div>
          </div>
        </div>
      )}

      {/* MENU OVERLAY */}
      {menu && (
        <div data-testid="menu-overlay" className="pointer-events-auto absolute inset-0 grid place-items-center bg-[#050a1c]/75 backdrop-blur-sm">
          <div className="w-[400px] max-h-[90vh] overflow-y-auto p-6 rounded-3xl bg-[#101a33]/95 border-2 border-white/25 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-extrabold tracking-wide">VOXEL CUP</h2>
              <button data-testid="close-menu-button" onClick={() => openMenu(false)} className="opacity-70 hover:opacity-100">
                <X size={24} strokeWidth={3} />
              </button>
            </div>

            {/* Pausas restantes — compacto, una línea */}
            {s.pauses && (
              <div className="mb-3 flex items-center justify-between px-3 py-2 rounded-lg bg-[#0a1530] border border-white/15 text-xs">
                <span className="text-white/50 tracking-wider">PAUSAS</span>
                <span className="flex items-center gap-2">
                  <span className="text-[#ff5a5a] font-black">ROJO {s.pauses.red?.remaining ?? 0}</span>
                  <span className="text-white/30">·</span>
                  <span className="text-[#5a8aff] font-black">{s.pauses.blue?.remaining ?? 0} AZUL</span>
                </span>
                {s.pauses.red?.active && (
                  <span className="text-[#ffd21c] font-bold tabular-nums">{Math.ceil(s.pauses.red.timer)}s</span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                data-testid="resume-button"
                onClick={() => openMenu(false)}
                className="w-full py-3 rounded-xl bg-gradient-to-b from-[#ffd21c] to-[#ffa000] text-[#101a33] text-base font-extrabold tracking-wide transition-transform hover:-translate-y-0.5"
              >
                REANUDAR
              </button>
              <button
                data-testid="restart-button"
                onClick={() => {
                  gameRef.current?.reset();
                  openMenu(false);
                }}
                className="w-full py-2.5 rounded-xl bg-white/10 border-2 border-white/20 text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/20"
              >
                <RotateCcw size={18} strokeWidth={3} /> REINICIAR PARTIDO
              </button>
              <button
                data-testid="toggle-camera-button"
                onClick={() => gameRef.current?.toggleCamera()}
                className="w-full py-2.5 rounded-xl bg-white/10 border-2 border-white/20 text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/20"
              >
                <Video size={18} strokeWidth={3} /> CÁMARA: {s.camMode === "area" ? "ÁREA" : "POV"}
              </button>
              <div className="h-px bg-white/10 my-1" />
              <button
                data-testid="exit-button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("voxelcup:exit-match"));
                }}
                className="w-full py-2.5 rounded-xl bg-[#ff3b52]/15 border-2 border-[#ff3b52]/40 text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#ff3b52]/25 text-[#ff9aa2] transition-colors"
              >
                <X size={18} strokeWidth={3} /> SALIR DEL PARTIDO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KICKOFF COUNTDOWN — cinemático AAA */}
      {!s.matchEnded && (
        <KickoffCountdown count={s.kickoffCount} go={s.kickoffGo} />
      )}

      {/* ENTRETIEMPO — Rediseño AAA estilo voxel */}
      {s.halftime && !s.matchEnded && <HalftimeScreen s={s} />}

      {/* MATCH ENDED — pantalla final con standings + MVP + rewards (P3) */}
      {s.matchEnded && (() => {
        const winColor = s.winner === "red" ? "#ff2d3c" : s.winner === "blue" ? "#2f74ff" : "#ffd21c";
        const winTitle = s.winner === "draw" ? "EMPATE" : s.winner === "red" ? "¡GANA ROJO!" : "¡GANA AZUL!";

        // Post-match data (standings + MVP + rewards). Built once when
        // matchEnded flips true; null on the very first tick before
        // prSnapshot lands. We still render the basic overlay so the user
        // sees the winner immediately; the rich content fades in.
        const ed = endData;
        const mvp = ed?.mvpRow;
        const rewards = ed?.rewards;
        const heroRow = ed?.heroRow;
        const standings = ed?.standings || [];
        const careerAfter = ed?.careerAfter;
        const careerBefore = ed?.careerBefore;
        const leveledUp = !!rewards?.leveledUp;
        const levelsGained = rewards?.levelsGained || 0;
        const xpForNext = careerAfter ? xpForLevel(careerAfter.level) : 100;
        const xpPct = careerAfter ? Math.min(100, (careerAfter.xp / xpForNext) * 100) : 0;
        const mvpColor = mvp ? (mvp.team === "red" ? "#ff2d3c" : "#2f74ff") : "#ffd21c";

        return (
          <div
            data-testid="match-ended-overlay"
            className="pointer-events-auto absolute inset-0 overflow-y-auto"
            style={{
              background: "radial-gradient(circle at center, rgba(3,6,15,0.88), rgba(3,6,15,0.96))",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            {/* glow del color del ganador */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse 70% 50% at 50% 25%, ${winColor}25, transparent 60%)` }}
            />

            {/* confetti */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {Array.from({ length: 60 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute block"
                  style={{
                    left: `${(i * 71) % 100}%`,
                    top: "-8%",
                    width: "10px",
                    height: "14px",
                    background: ["#ff2d3c", "#2f74ff", "#ffd21c", "#20b26a", "#ffffff"][i % 5],
                    transform: `rotate(${(i * 47) % 360}deg)`,
                    animation: `confettiFall ${2.4 + ((i * 13) % 22) / 10}s linear ${(i % 12) * 60}ms both`,
                  }}
                />
              ))}
            </div>

            {/* Contenido — responsive grid: header arriba, 2 columnas al medio, stats + botones abajo */}
            <div className="relative min-h-full flex flex-col items-center py-6 px-3 sm:py-8 sm:px-6 gap-3 sm:gap-5">
              {/* === HEADER: tag + título + marcador === */}
              <span
                className="text-center"
                style={{
                  color: winColor,
                  letterSpacing: "0.3em",
                  paddingLeft: "0.3em",
                  fontSize: "clamp(0.7rem, 2.5vw, 1rem)",
                  textShadow: `0 0 20px ${winColor}88`,
                  animation: "kickTag 500ms ease-out 200ms both",
                }}
              >
                FIN DEL PARTIDO
              </span>
              <div
                className="flex flex-col items-center"
                style={{ animation: "matchEndIn 900ms cubic-bezier(.14,1.4,.3,1) both" }}
              >
                <span
                  data-testid="match-end-winner-title"
                  className="font-black leading-none text-center"
                  style={{
                    fontFamily: '"Anton","Saira Condensed",system-ui,sans-serif',
                    fontSize: "clamp(2rem, 6vw, 4.5rem)",
                    letterSpacing: "-0.01em",
                    color: "#ffffff",
                    textShadow: `0 0 30px ${winColor}aa, 0 3px 0 rgba(0,0,0,0.8)`,
                  }}
                >
                  {winTitle}
                </span>
              </div>
              {/* Marcador */}
              <div
                className="flex items-center gap-3 sm:gap-6"
                style={{ animation: "matchEndIn 900ms cubic-bezier(.14,1.4,.3,1) 150ms both" }}
              >
                <div
                  className="px-4 sm:px-7 py-2 sm:py-3 rounded-xl border-2 text-center"
                  style={{
                    background: s.winner === "red" ? "linear-gradient(180deg,#ff3d4c,#a80f1c)" : "rgba(255,255,255,0.06)",
                    borderColor: s.winner === "red" ? "#ffe14d" : "rgba(255,255,255,0.25)",
                    boxShadow: s.winner === "red" ? "0 0 30px rgba(255,60,80,0.45)" : "none",
                  }}
                >
                  <div className="text-white/70 text-[10px] sm:text-xs tracking-[0.3em]">ROJO</div>
                  <div className="text-3xl sm:text-5xl font-black text-white leading-none">{s.score.red}</div>
                </div>
                <span className="text-white/40 text-2xl sm:text-4xl font-black">—</span>
                <div
                  className="px-4 sm:px-7 py-2 sm:py-3 rounded-xl border-2 text-center"
                  style={{
                    background: s.winner === "blue" ? "linear-gradient(180deg,#4d8bff,#0f2cb5)" : "rgba(255,255,255,0.06)",
                    borderColor: s.winner === "blue" ? "#ffe14d" : "rgba(255,255,255,0.25)",
                    boxShadow: s.winner === "blue" ? "0 0 30px rgba(70,120,255,0.45)" : "none",
                  }}
                >
                  <div className="text-white/70 text-[10px] sm:text-xs tracking-[0.3em]">AZUL</div>
                  <div className="text-3xl sm:text-5xl font-black text-white leading-none">{s.score.blue}</div>
                </div>
              </div>

              {/* === MAIN GRID: MVP+Rewards (left) · Standings (right) === */}
              <div
                className="w-full max-w-[1100px] grid gap-3 sm:gap-4 mt-1"
                style={{
                  gridTemplateColumns: "minmax(0,1fr)",
                  animation: "matchEndIn 900ms cubic-bezier(.14,1.4,.3,1) 300ms both",
                }}
              >
                <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
                  {/* MVP CARD */}
                  {mvp && (
                    <div
                      data-testid="match-end-mvp-card"
                      className="relative p-4 sm:p-5 rounded-2xl border-2 overflow-hidden"
                      style={{
                        background: "linear-gradient(135deg,rgba(255,210,28,0.10),rgba(11,20,40,0.85))",
                        borderColor: "rgba(255,210,28,0.55)",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.45), inset 0 0 30px rgba(255,210,28,0.05)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Star size={18} strokeWidth={2.6} style={{ color: "#ffd21c" }} />
                        <span className="text-[#ffd21c] text-xs sm:text-sm font-black tracking-[0.3em]">
                          MVP DEL PARTIDO
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div
                            className="font-black text-white text-xl sm:text-3xl truncate"
                            style={{ fontFamily: '"Anton","Saira Condensed",system-ui,sans-serif', textShadow: `0 0 18px ${mvpColor}88` }}
                          >
                            {mvp.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-black tracking-widest text-white"
                              style={{ background: mvpColor }}
                            >
                              {mvp.team === "red" ? "ROJO" : "AZUL"}
                            </span>
                            <span className="text-white/60 text-xs sm:text-sm tracking-wider">
                              {ROLE_FULL[mvp.role] || mvp.role}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white/50 text-[10px] tracking-[0.2em] font-bold">PR</div>
                          <div
                            className="text-3xl sm:text-5xl font-black tabular-nums"
                            style={{ color: "#ffd21c", textShadow: "0 0 18px rgba(255,210,28,0.6)" }}
                          >
                            {mvp.pr || 0}
                          </div>
                        </div>
                      </div>
                      {/* Key stats */}
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        {[
                          { label: "GOLES", value: mvp.goals || 0, color: "#ffd21c" },
                          { label: "ASIST.", value: mvp.assists || 0, color: "#3df0ff" },
                          { label: "BARRID.", value: mvp.tackles || 0, color: "#7dff5a" },
                        ].map((st) => (
                          <div
                            key={st.label}
                            className="rounded-lg py-2 text-center"
                            style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)" }}
                          >
                            <div className="text-xl sm:text-2xl font-black tabular-nums" style={{ color: st.color }}>
                              {st.value}
                            </div>
                            <div className="text-white/50 text-[9px] tracking-widest mt-0.5">{st.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* REWARDS CARD */}
                  {rewards && (
                    <div
                      data-testid="match-end-rewards-card"
                      className="p-4 sm:p-5 rounded-2xl border-2"
                      style={{
                        background: "rgba(11,20,40,0.85)",
                        borderColor: "rgba(255,255,255,0.18)",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp size={18} strokeWidth={2.6} style={{ color: "#3df0ff" }} />
                        <span className="text-[#3df0ff] text-xs sm:text-sm font-black tracking-[0.3em]">
                          TUS RECOMPENSAS
                        </span>
                      </div>
                      {/* Level-up banner */}
                      {leveledUp && (
                        <div
                          className="mb-3 px-3 py-2 rounded-lg flex items-center gap-2"
                          style={{
                            background: "linear-gradient(90deg,rgba(125,255,90,0.18),rgba(255,210,28,0.12))",
                            border: "1px solid rgba(125,255,90,0.4)",
                            animation: "matchEndIn 600ms ease-out both",
                          }}
                        >
                          <ArrowUp size={18} strokeWidth={3} style={{ color: "#7dff5a" }} />
                          <span className="text-[#7dff5a] font-black text-sm sm:text-base tracking-wider">
                            ¡SUBISTE AL NIVEL {careerAfter?.level}!
                          </span>
                          {levelsGained > 1 && (
                            <span className="text-white/60 text-xs">(+{levelsGained} niveles)</span>
                          )}
                        </div>
                      )}
                      {/* XP / Coins / Streak */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg py-3 text-center" style={{ background: "rgba(61,240,255,0.08)", border: "1px solid rgba(61,240,255,0.25)" }}>
                          <div className="text-xl sm:text-3xl font-black tabular-nums" style={{ color: "#3df0ff" }}>
                            +{rewards.xpGained || 0}
                          </div>
                          <div className="text-white/60 text-[9px] tracking-widest mt-0.5">XP</div>
                        </div>
                        <div className="rounded-lg py-3 text-center" style={{ background: "rgba(255,210,28,0.08)", border: "1px solid rgba(255,210,28,0.25)" }}>
                          <div className="text-xl sm:text-3xl font-black tabular-nums" style={{ color: "#ffd21c" }}>
                            +{rewards.coinsGained || 0}
                          </div>
                          <div className="text-white/60 text-[9px] tracking-widest mt-0.5">MONEDAS</div>
                        </div>
                        <div className="rounded-lg py-3 text-center" style={{ background: "rgba(125,255,90,0.08)", border: "1px solid rgba(125,255,90,0.25)" }}>
                          <div className="text-xl sm:text-3xl font-black tabular-nums" style={{ color: "#7dff5a" }}>
                            ×{rewards.streakMult?.toFixed(2) || "1.00"}
                          </div>
                          <div className="text-white/60 text-[9px] tracking-widest mt-0.5">MULT RACHA</div>
                        </div>
                      </div>
                      {/* PR breakdown */}
                      <div className="flex items-center justify-between mt-3 px-2 text-xs">
                        <span className="text-white/60 tracking-wider">PR FINAL</span>
                        <span className="font-black text-white tabular-nums">{rewards.finalPR || 0}</span>
                      </div>
                      {/* Level progress bar */}
                      {careerAfter && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[10px] sm:text-xs mb-1.5">
                            <span className="text-white/70 font-bold tracking-wider">
                              NIVEL {careerAfter.level}
                            </span>
                            <span className="text-white/50 tabular-nums">
                              {careerAfter.xp} / {xpForNext} XP
                            </span>
                          </div>
                          <div className="relative w-full h-[8px] rounded-full overflow-hidden bg-white/10">
                            <div
                              className="absolute inset-y-0 left-0"
                              style={{
                                width: `${xpPct}%`,
                                background: "linear-gradient(90deg,#3df0ff,#7fb0ff)",
                                boxShadow: "0 0 10px rgba(61,240,255,0.6)",
                                transition: "width 600ms cubic-bezier(.2,.8,.2,1)",
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-[10px]">
                            <span className="text-white/50 flex items-center gap-1">
                              <Coins size={11} strokeWidth={3} style={{ color: "#ffd21c" }} />
                              <span className="font-bold tabular-nums">{careerAfter.coins || 0}</span>
                              <span className="text-white/40">monedas</span>
                            </span>
                            <span className="text-white/50 flex items-center gap-1">
                              <Trophy size={11} strokeWidth={3} style={{ color: "#ffd21c" }} />
                              <span className="font-bold tabular-nums">×{careerAfter.streak || 0}</span>
                              <span className="text-white/40">racha</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* STANDINGS TABLE */}
                {standings.length > 0 && (
                  <div
                    data-testid="match-end-standings"
                    className="p-3 sm:p-4 rounded-2xl border-2 overflow-x-auto"
                    style={{
                      background: "rgba(11,20,40,0.85)",
                      borderColor: "rgba(255,255,255,0.18)",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy size={16} strokeWidth={2.6} style={{ color: "#ffd21c" }} />
                      <span className="text-[#ffd21c] text-xs sm:text-sm font-black tracking-[0.3em]">
                        TABLA DE PARTIDO
                      </span>
                    </div>
                    <table className="w-full border-collapse" style={{ fontSize: 12, minWidth: 540 }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                          {["#","JUGADOR","EQUIPO","PUESTO","G","A","TIROS","PASES","ROBOS","PR","XP","$"].map((h, i) => (
                            <th
                              key={i}
                              style={{
                                padding: "6px 4px",
                                textAlign: i === 1 ? "left" : "center",
                                color: "rgba(255,255,255,0.6)",
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: "0.06em",
                                borderBottom: "1px solid rgba(255,255,255,0.15)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((row, idx) => (
                          <StandingRow
                            key={`${row.team}-${row.formationIdx}-${idx}`}
                            row={row}
                            idx={idx}
                            isMvp={!!mvp && row.team === mvp.team && row.formationIdx === mvp.formationIdx}
                            isHero={!!heroRow && row.team === heroRow.team && row.formationIdx === heroRow.formationIdx}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* === TEAM STATS (comparativas) === */}
              <div
                className="w-full max-w-[600px] p-3 sm:p-4 rounded-2xl bg-[#0b1428]/80 border border-white/15"
                style={{ animation: "matchEndIn 900ms cubic-bezier(.14,1.4,.3,1) 500ms both" }}
              >
                <StatRow label="POSESIÓN" red={posR} blue={posB} unit="%" />
                <StatRow label="TIROS" red={stR.shots} blue={stB.shots} />
                <StatRow label="PASES" red={stR.passes} blue={stB.passes} />
                <StatRow label="BARRIDAS" red={stR.tackles} blue={stB.tackles} />
                <StatRow label="ATAJADAS" red={stR.saves} blue={stB.saves} />
              </div>

              {/* === BUTTONS === */}
              <div
                className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-1 mb-4"
                style={{ animation: "matchEndIn 900ms cubic-bezier(.14,1.4,.3,1) 700ms both" }}
              >
                <button
                  data-testid="match-end-restart"
                  onClick={() => { sfx.ui(); gameRef.current?.reset(); }}
                  className="px-6 sm:px-9 py-3 sm:py-4 rounded-xl bg-gradient-to-b from-[#ffd21c] to-[#ffa000] text-[#101a33] text-base sm:text-xl font-black tracking-wide transition-transform hover:-translate-y-0.5 active:scale-95 shadow-[0_15px_40px_rgba(255,210,28,0.3)]"
                >
                  REVANCHA
                </button>
                <button
                  data-testid="match-end-exit"
                  onClick={() => {
                    sfx.ui();
                    window.dispatchEvent(new CustomEvent("voxelcup:exit-match"));
                  }}
                  className="px-6 sm:px-9 py-3 sm:py-4 rounded-xl bg-white/8 border-2 border-white/25 text-base sm:text-xl font-bold tracking-wide hover:bg-white/16 transition-colors"
                >
                  {multiplayer ? "VOLVER A LA SALA" : "VOLVER AL LOBBY"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
