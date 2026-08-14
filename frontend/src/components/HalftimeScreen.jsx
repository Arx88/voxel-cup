import { Zap, Flame } from "lucide-react";

// -------- Voxel bust (avatar cúbico estilo del juego) ----------
export const VoxelBust = ({ team = "red", delay = 0 }) => {
  const isRed = team === "red";
  const frame = isRed
    ? "linear-gradient(160deg,#2a1116,#160a12)"
    : "linear-gradient(160deg,#0e1b3a,#0a1226)";
  const glow = isRed ? "rgba(255,61,76,0.55)" : "rgba(63,123,255,0.55)";
  const jersey = isRed ? "#e8323f" : "#2f74ff";
  const jerseyDark = isRed ? "#a80f1c" : "#123ec0";
  const skin = "#e7b088";
  const skinShade = "#cf9269";
  const hair = "#5a3a22";
  const hairShade = "#432a17";
  return (
    <div
      className="relative shrink-0 overflow-hidden"
      data-testid={`halftime-bust-${team}`}
      style={{
        width: "clamp(72px,7vw,104px)",
        height: "clamp(72px,7vw,104px)",
        borderRadius: "18px",
        background: frame,
        border: "2px solid rgba(255,255,255,0.18)",
        boxShadow: `0 10px 26px rgba(0,0,0,0.5), 0 0 0 4px rgba(0,0,0,0.25), inset 0 2px 0 rgba(255,255,255,0.12), 0 0 26px ${glow}`,
        animation: `bustPop 620ms cubic-bezier(.2,1.5,.35,1) ${delay}ms both`,
      }}
    >
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 34%, ${glow}, transparent 66%)`, opacity: 0.7 }}
      />
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ animation: "bustFloat 3.4s ease-in-out infinite" }}>
        <g shapeRendering="crispEdges">
          <rect x="16" y="70" width="68" height="30" fill={jersey} />
          <rect x="16" y="70" width="10" height="30" fill={jerseyDark} opacity="0.55" />
          <rect x="74" y="70" width="10" height="30" fill={jerseyDark} opacity="0.55" />
          <rect x="42" y="62" width="16" height="10" fill={skinShade} />
          <rect x="30" y="24" width="40" height="40" fill={skin} />
          <rect x="60" y="24" width="10" height="40" fill={skinShade} />
          <rect x="28" y="16" width="44" height="14" fill={hair} />
          <rect x="28" y="16" width="44" height="5" fill={hairShade} />
          <rect x="28" y="24" width="6" height="16" fill={hair} />
          <rect x="66" y="24" width="6" height="16" fill={hairShade} />
          <rect x="39" y="40" width="7" height="8" fill="#1a1420" />
          <rect x="54" y="40" width="7" height="8" fill="#1a1420" />
          <rect x="40" y="41" width="3" height="3" fill="#ffffff" opacity="0.85" />
          <rect x="55" y="41" width="3" height="3" fill="#ffffff" opacity="0.85" />
          <rect x="44" y="54" width="12" height="3" fill={skinShade} />
        </g>
      </svg>
    </div>
  );
};

// -------- Mini cancha táctica ----------
export const MiniPitch = () => (
  <div
    className="shrink-0 rounded-lg overflow-hidden"
    style={{
      width: "clamp(78px,8vw,110px)",
      height: "clamp(46px,4.6vw,64px)",
      background: "linear-gradient(180deg,#0c1e14,#081a10)",
      border: "1.5px solid rgba(120,200,150,0.35)",
      boxShadow: "inset 0 0 18px rgba(0,0,0,0.55)",
    }}
  >
    <svg viewBox="0 0 110 64" className="w-full h-full">
      <g stroke="rgba(180,230,190,0.5)" strokeWidth="1.4" fill="none">
        <rect x="6" y="6" width="98" height="52" rx="3" />
        <line x1="55" y1="6" x2="55" y2="58" />
        <circle cx="55" cy="32" r="9" />
        <rect x="6" y="18" width="10" height="28" />
        <rect x="94" y="18" width="10" height="28" />
      </g>
      <circle cx="55" cy="32" r="2.4" fill="#ffd21c" />
      {[[28, 20], [36, 44], [24, 32]].map(([x, y], i) => (
        <circle key={`r${i}`} cx={x} cy={y} r="2.6" fill="#ff4757" />
      ))}
      {[[82, 22], [74, 46], [86, 34]].map(([x, y], i) => (
        <circle key={`b${i}`} cx={x} cy={y} r="2.6" fill="#3f7bff" />
      ))}
    </svg>
  </div>
);

const Crown = ({ delay = 0 }) => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="#ffd21c" style={{ filter: "drop-shadow(0 0 8px rgba(255,210,28,0.6))", animation: `htCrown 2.6s ease-in-out infinite ${delay}ms` }}>
    <path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z" />
  </svg>
);

export const HalftimeScreen = ({ s }) => {
  const htLeft = Math.max(0, Math.ceil(s.halftimeCount || 0));
  const htUrgent = htLeft <= 3;
  const htColor = htUrgent ? "#ff5a4a" : "#ffd21c";
  return (
    <div
      data-testid="halftime-banner"
      className="absolute inset-0 grid place-items-center pointer-events-none overflow-hidden"
      style={{
        background: "radial-gradient(120% 90% at 50% 42%, rgba(3,8,20,0.55), rgba(2,5,14,0.82) 78%)",
        backdropFilter: "blur(3px) saturate(1.12)",
        WebkitBackdropFilter: "blur(3px) saturate(1.12)",
        animation: "kickVeilIn 320ms ease-out both",
      }}
    >
      {/* viñeta lateral roja/azul */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(255,45,60,0.16), transparent 32%, transparent 68%, rgba(47,116,255,0.16))" }} />

      {/* confeti voxel */}
      {Array.from({ length: 34 }).map((_, i) => {
        const cols = ["#ff2d3c", "#2f74ff", "#ffd21c", "#ffffff"];
        const left = (i * 61) % 100;
        const size = 6 + ((i * 7) % 8);
        const dur = 4 + ((i * 13) % 40) / 10;
        const delay = ((i * 29) % 50) / 10;
        const rot = (i % 2 ? 1 : -1) * (18 + (i % 20));
        return (
          <span
            key={`ht-conf-${i}`}
            className="absolute top-[-6%]"
            style={{
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              background: cols[i % cols.length],
              transform: `rotate(${rot}deg)`,
              borderRadius: "1px",
              opacity: 0.85,
              boxShadow: "0 1px 0 rgba(0,0,0,0.35)",
              animation: `htConfetti ${dur}s linear ${delay}s infinite`,
            }}
          />
        );
      })}

      {/* TARJETA CENTRAL */}
      <div
        className="relative flex flex-col items-center"
        style={{
          width: "min(760px,92vw)",
          padding: "clamp(20px,2.4vw,34px) clamp(20px,2.6vw,40px)",
          borderRadius: "26px",
          background: "linear-gradient(180deg, rgba(13,28,58,0.94), rgba(8,18,40,0.96))",
          border: "1.5px solid rgba(120,160,230,0.35)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 60px rgba(60,110,220,0.18)",
          animation: "halftimeIn 620ms cubic-bezier(.2,1.35,.3,1) both",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-[38%] pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.08), transparent)", borderRadius: "26px 26px 0 0" }} />

        {/* TÍTULO con coronas */}
        <div className="flex items-center gap-4" style={{ animation: "htRise 520ms ease-out 80ms both" }}>
          <Crown />
          <span
            className="font-black leading-none"
            style={{
              fontFamily: '"Anton","Saira Condensed",system-ui,sans-serif',
              fontSize: "clamp(2.4rem,5.4vw,4.2rem)",
              letterSpacing: "0.02em",
              color: "#ffd21c",
              textShadow: "0 0 26px rgba(255,210,28,0.55), 0 4px 0 rgba(120,80,0,0.5)",
            }}
          >
            ENTRETIEMPO
          </span>
          <Crown delay={300} />
        </div>
        <div className="text-white/85 font-extrabold mt-1" style={{ fontSize: "clamp(0.9rem,1.7vw,1.25rem)", animation: "htRise 520ms ease-out 160ms both" }}>
          ¡Gran partido hasta ahora!
        </div>

        {/* MARCADOR con bustos voxel */}
        <div className="flex items-center justify-center gap-5 sm:gap-8 mt-5" style={{ animation: "htRise 560ms ease-out 220ms both" }}>
          <VoxelBust team="red" delay={260} />
          <span className="font-black text-white leading-none tabular-nums" style={{ fontSize: "clamp(3rem,7vw,5.6rem)", textShadow: "0 5px 0 rgba(0,0,0,0.5)" }} data-testid="halftime-score-red">
            {s.score.red}
          </span>
          <span className="font-black leading-none" style={{ fontSize: "clamp(1.6rem,3.4vw,2.8rem)", color: "rgba(255,255,255,0.4)" }}>—</span>
          <span className="font-black text-white leading-none tabular-nums" style={{ fontSize: "clamp(3rem,7vw,5.6rem)", textShadow: "0 5px 0 rgba(0,0,0,0.5)" }} data-testid="halftime-score-blue">
            {s.score.blue}
          </span>
          <VoxelBust team="blue" delay={340} />
        </div>

        {/* divisor rojo→azul */}
        <div className="w-full h-[2px] my-5 rounded-full" style={{ background: "linear-gradient(90deg, rgba(255,45,60,0.7), rgba(255,255,255,0.15) 50%, rgba(47,116,255,0.7))", animation: "htBar 620ms ease-out 340ms both" }} />

        {/* TIPS + mini cancha */}
        <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6" style={{ animation: "htRise 560ms ease-out 420ms both" }}>
          <div className="flex items-center gap-3">
            <div className="grid place-items-center shrink-0" style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(160deg,#8a5cff,#5b3df0)", boxShadow: "0 6px 16px rgba(110,70,240,0.5), inset 0 2px 0 rgba(255,255,255,0.25)" }}>
              <Zap size={22} strokeWidth={2.6} fill="#fff" color="#fff" style={{ animation: "htGlow 1.8s ease-in-out infinite" }} />
            </div>
            <div className="text-left leading-tight">
              <div className="font-black tracking-widest" style={{ color: "#ffd21c", fontSize: "0.72rem" }}>TIP</div>
              <div className="text-white/85 font-semibold" style={{ fontSize: "clamp(0.72rem,1.3vw,0.9rem)" }}>
                Usá <b className="text-white">BARRIDA</b> para recuperar la posesión
              </div>
            </div>
          </div>

          <MiniPitch />

          <div className="flex items-center gap-3 justify-end sm:justify-start">
            <div className="grid place-items-center shrink-0" style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(160deg,#ff8a3c,#e0490f)", boxShadow: "0 6px 16px rgba(230,90,20,0.5), inset 0 2px 0 rgba(255,255,255,0.25)" }}>
              <Flame size={22} strokeWidth={2.6} fill="#ffd9a0" color="#fff" style={{ animation: "htGlow 1.8s ease-in-out infinite .4s" }} />
            </div>
            <div className="text-left leading-tight">
              <div className="font-black tracking-widest" style={{ color: "#ffd21c", fontSize: "0.72rem" }}>TIP</div>
              <div className="text-white/85 font-semibold" style={{ fontSize: "clamp(0.72rem,1.3vw,0.9rem)" }}>
                Cargá el <b className="text-white">TIRO</b> para más potencia
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COUNTDOWN inferior — centrado con flex en lugar de absolute left-1/2 */}
      <div
        data-testid="halftime-countdown"
        className="absolute inset-x-0 flex justify-center"
        style={{ bottom: "clamp(20px,5vh,64px)", animation: "htRise 560ms ease-out 520ms both" }}
      >
        <div className="px-6 py-3 rounded-2xl flex flex-col items-center" style={{ background: "rgba(9,18,38,0.85)", border: "1.5px solid rgba(120,160,230,0.25)", boxShadow: "0 18px 46px rgba(0,0,0,0.5)" }}>
          <span className="hud-font text-white/70" style={{ letterSpacing: "0.24em", fontSize: "clamp(0.62rem,1.1vw,0.82rem)" }}>
            EL SEGUNDO TIEMPO COMIENZA EN
          </span>
          <span
            className="font-black tabular-nums leading-none mt-1"
            style={{
              fontFamily: '"Anton","Saira Condensed",system-ui,sans-serif',
              fontSize: "clamp(2.2rem,4.4vw,3.4rem)",
              color: htColor,
              textShadow: `0 0 22px ${htUrgent ? "rgba(255,90,74,0.7)" : "rgba(255,210,28,0.6)"}`,
              transition: "color 200ms ease",
            }}
          >
            <span key={htLeft} style={{ display: "inline-block", animation: "htTick 420ms cubic-bezier(.2,1.6,.35,1) both" }}>
              00:{String(htLeft).padStart(2, "0")}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
