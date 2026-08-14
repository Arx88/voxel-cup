import { useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// KICKOFF COUNTDOWN — identidad 100% VOXEL.
//  · Números construidos bloque a bloque (cara frontal biselada + extrusión)
//  · Anillo segmentado rojo/azul que se descarga con el segundo en curso
//  · Píldora "EL PARTIDO COMIENZA EN" con remaches y esquinas técnicas
//  · Micro-detalle: ensamblado escalonado, onda de brillo por columna,
//    motas de voxel, shockwave por tick, micro-shake y explosión final.
// ---------------------------------------------------------------------------

const RED = "#ff2d3c";
const BLUE = "#2f74ff";

// bitmaps 5x7 (mismo grid que las texturas voxel del juego)
const GLYPHS = {
  1: ["00100", "01100", "11100", "00100", "00100", "00100", "11111"],
  2: ["11111", "00001", "00001", "11111", "10000", "10000", "11111"],
  3: ["11111", "00001", "00001", "01111", "00001", "00001", "11111"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "!": ["1", "1", "1", "1", "1", "0", "1"],
  "¡": ["1", "0", "1", "1", "1", "1", "1"],
};

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// --- un glifo voxel: cada celda es un cubo con cara y extrusión -------------
const VoxelGlyph = ({ char, unit, exploding, seedBase = 0 }) => {
  const rows = GLYPHS[char] || GLYPHS[3];
  const cols = rows[0].length;

  const cells = useMemo(() => {
    const out = [];
    rows.forEach((row, r) => {
      row.split("").forEach((v, c) => {
        if (v !== "1") return;
        const seed = seedBase * 97 + r * 13 + c * 7;
        out.push({
          r,
          c,
          delay: Math.round((r * 1.05 + c * 1.6) * 22 + hash(seed) * 60),
          bx: (hash(seed + 1) - 0.5) * 9,
          by: -6 - hash(seed + 2) * 8,
          br: (hash(seed + 3) - 0.5) * 70,
          ex: (c - (cols - 1) / 2) * 5.5 + (hash(seed + 4) - 0.5) * 10,
          ey: (r - 3) * 5.5 - 6 + (hash(seed + 5) - 0.5) * 10,
          er: (hash(seed + 6) - 0.5) * 260,
        });
      });
    });
    return out;
  }, [rows, cols, seedBase]);

  const depth = `calc(${unit} * 0.22)`;

  return (
    <div
      className="relative"
      style={{
        width: `calc(${unit} * ${cols})`,
        height: `calc(${unit} * 7)`,
      }}
    >
      {cells.map((cell, i) => {
        const style = {
          left: `calc(${unit} * ${cell.c})`,
          top: `calc(${unit} * ${cell.r})`,
          width: unit,
          height: unit,
          ["--bx"]: `${cell.bx}vmin`,
          ["--by"]: `${cell.by}vmin`,
          ["--br"]: `${cell.br}deg`,
          ["--ex"]: `${cell.ex}vmin`,
          ["--ey"]: `${cell.ey}vmin`,
          ["--er"]: `${cell.er}deg`,
          animation: exploding
            ? `vxBlast 760ms cubic-bezier(.2,.7,.2,1) ${Math.round(cell.delay * 0.35)}ms both`
            : `vxBlockIn 520ms cubic-bezier(.16,1.5,.28,1) ${cell.delay}ms both`,
          willChange: "transform, opacity",
        };
        return (
          <span key={i} className="absolute block" style={style}>
            {/* extrusión (profundidad del cubo) */}
            <span
              className="absolute block"
              style={{
                left: depth,
                top: depth,
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg, #8ea3c2 0%, #5c6f92 55%, #3d4c69 100%)",
              }}
            />
            {/* cara frontal biselada */}
            <span
              className="absolute inset-0 block"
              style={{
                background: "linear-gradient(158deg, #ffffff 0%, #ffffff 58%, #e9f0fb 100%)",
                boxShadow: `inset 0 ${`calc(${unit} * 0.1)`} 0 rgba(255,255,255,0.95),
                            inset ${`calc(${unit} * 0.09)`} 0 0 rgba(255,255,255,0.7),
                            inset 0 ${`calc(${unit} * -0.11)`} 0 rgba(96,116,152,0.55),
                            inset ${`calc(${unit} * -0.09)`} 0 0 rgba(120,140,178,0.45)`,
                animation: exploding
                  ? undefined
                  : `vxSheen 2600ms ease-in-out ${420 + cell.c * 90}ms infinite`,
              }}
            />
          </span>
        );
      })}
    </div>
  );
};

// --- anillo segmentado rojo/azul -------------------------------------------
const SEG_PER_SIDE = 22;
const ARC = 158; // grados por lado (hueco inferior)
const R = 78;

const SegmentRing = ({ progress, pulseKey }) => {
  const segs = [];
  const lit = progress * SEG_PER_SIDE;
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < SEG_PER_SIDE; i += 1) {
      const a = (ARC - (i * ARC) / (SEG_PER_SIDE - 1)) * (side === 0 ? -1 : 1);
      const on = i < lit;
      const leading = on && i + 1 >= lit;
      const color = side === 0 ? RED : BLUE;
      segs.push(
        <g key={`${side}-${i}`} transform={`rotate(${a}) translate(0 ${-R})`}>
          <rect
            x={-2.6}
            y={-6.5}
            width={5.2}
            height={13}
            rx={1.2}
            fill={leading ? "#ffffff" : on ? color : "rgba(255,255,255,0.07)"}
            style={{
              filter: on
                ? `drop-shadow(0 0 4px ${leading ? "#ffffff" : color}) drop-shadow(0 0 9px ${color})`
                : "none",
              transition: "fill 90ms linear",
            }}
          />
        </g>
      );
    }
  }

  return (
    <svg
      viewBox="-100 -100 200 200"
      className="absolute"
      style={{
        width: "44vmin",
        height: "44vmin",
        overflow: "visible",
        animation: "vxRingPop 520ms cubic-bezier(.16,1.4,.3,1) both",
      }}
    >
      {/* disco de legibilidad detrás del número */}
      <circle r={70} fill="rgba(5,9,20,0.42)" />
      <circle r={70} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      {/* guía punteada */}
      <circle
        r={R}
        fill="none"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="13"
        strokeDasharray="1.6 5.6"
      />
      {/* onda al cambiar de número */}
      <circle
        key={pulseKey}
        r={R}
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.6"
        style={{ animation: "vxPulse 620ms ease-out both", transformOrigin: "center" }}
      />
      <g style={{ transformOrigin: "center" }}>{segs}</g>
      {/* marcas de referencia en los extremos del arco */}
      {[-ARC - 6, ARC + 6].map((a, i) => (
        <g key={i} transform={`rotate(${a}) translate(0 ${-R})`}>
          <rect x={-1} y={-4} width={2} height={8} fill="rgba(255,255,255,0.35)" />
        </g>
      ))}
    </svg>
  );
};

// --- motas de voxel flotando ----------------------------------------------
const Motes = ({ seed }) => {
  const motes = useMemo(
    () =>
      Array.from({ length: 16 }).map((_, i) => ({
        x: hash(seed * 31 + i) * 100,
        y: 55 + hash(seed * 31 + i + 50) * 40,
        s: 3 + Math.round(hash(seed + i * 3) * 5),
        mx: (hash(seed + i * 5) - 0.5) * 14,
        my: -12 - hash(seed + i * 7) * 16,
        mr: (hash(seed + i * 11) - 0.5) * 320,
        d: Math.round(hash(seed + i * 13) * 700),
        c: i % 5 === 0 ? RED : i % 5 === 1 ? BLUE : "#ffffff",
      })),
    [seed]
  );
  return (
    <>
      {motes.map((m, i) => (
        <span
          key={i}
          className="absolute block"
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            width: `${m.s}px`,
            height: `${m.s}px`,
            background: m.c,
            opacity: 0,
            boxShadow: `0 0 8px ${m.c}`,
            ["--mx"]: `${m.mx}vmin`,
            ["--my"]: `${m.my}vmin`,
            ["--mr"]: `${m.mr}deg`,
            animation: `vxMote 1700ms linear ${m.d}ms both`,
          }}
        />
      ))}
    </>
  );
};

const Pill = ({ text, accent }) => (
  <div
    className="relative"
    style={{ animation: "vxPillIn 540ms cubic-bezier(.16,1.45,.3,1) 160ms both" }}
    data-testid="kickoff-pill"
  >
    <div
      className="relative flex items-center gap-[1.4vmin] px-[3.4vmin] py-[1.2vmin]"
      style={{
        background: "linear-gradient(180deg, #16224a 0%, #0c1330 100%)",
        border: "0.34vmin solid rgba(255,255,255,0.16)",
        borderRadius: "1.1vmin",
        boxShadow:
          "0 1.1vmin 0 rgba(0,0,0,0.45), inset 0 0.28vmin 0 rgba(255,255,255,0.14), inset 0 -0.4vmin 0 rgba(0,0,0,0.4)",
      }}
    >
      <span
        className="block"
        style={{
          width: "0.9vmin",
          height: "0.9vmin",
          background: accent,
          boxShadow: `0 0 1.4vmin ${accent}`,
        }}
      />
      <span
        className="hud-font block whitespace-nowrap text-white"
        style={{
          fontSize: "clamp(0.8rem, 2.1vmin, 1.5rem)",
          letterSpacing: "0.2em",
          textShadow: "0 0.25vmin 0 rgba(0,0,0,0.75)",
        }}
      >
        {text}
      </span>
      <span
        className="block"
        style={{
          width: "0.9vmin",
          height: "0.9vmin",
          background: accent,
          boxShadow: `0 0 1.4vmin ${accent}`,
        }}
      />
      {/* barrido de luz sobre la píldora */}
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ borderRadius: "0.8vmin", pointerEvents: "none" }}
      >
        <span
          className="absolute top-0 bottom-0"
          style={{
            width: "22%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
            animation: "pwrSheen 2400ms ease-in-out 400ms infinite",
          }}
        />
      </span>
    </div>
  </div>
);

export const KickoffCountdown = ({ count, go }) => {
  const step = count > 0 ? Math.min(3, Math.max(1, Math.ceil(count))) : 0;
  const phase = go > 0 && step === 0 ? "go" : step > 0 ? String(step) : null;
  const [shown, setShown] = useState(phase);
  const last = useRef(phase);

  useEffect(() => {
    if (phase !== last.current) {
      last.current = phase;
      setShown(phase);
    }
  }, [phase]);

  if (!shown) return null;
  const isGo = shown === "go";
  const accent = isGo ? "#7dff5a" : shown === "1" ? RED : shown === "2" ? "#ffd21c" : BLUE;
  const progress = isGo ? 0 : Math.max(0, Math.min(1, count - (step - 1)));
  const unit = isGo ? "2.4vmin" : "4.1vmin";

  return (
    <div
      data-testid="kickoff-countdown"
      className="absolute inset-0 grid place-items-center pointer-events-none overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 80% 70% at 50% 48%, rgba(3,6,15,0.34) 0%, rgba(3,6,15,0.14) 55%, transparent 78%)",
        animation: isGo ? "vxStageOut 640ms ease-out 180ms both" : "vxStageIn 220ms ease-out both",
      }}
    >
      <div
        key={`shake-${shown}`}
        className="absolute inset-0 grid place-items-center"
        style={{ animation: "vxShake 420ms cubic-bezier(.3,.7,.2,1) both" }}
      >
        {/* halo del paso */}
        <div
          key={`halo-${shown}`}
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 48%, ${accent}22 0%, transparent 46%)`,
            animation: "kickHalo 760ms ease-out both",
          }}
        />

        {/* motas voxel */}
        <div key={`motes-${shown}`} className="absolute inset-0">
          <Motes seed={shown.charCodeAt(0) + shown.length} />
        </div>

        <div className="relative flex flex-col items-center" style={{ gap: 0 }}>
          <div className="relative grid place-items-center" style={{ width: "46vmin", height: "46vmin" }}>
            {!isGo && <SegmentRing progress={progress} pulseKey={shown} />}

            {/* resplandor del número */}
            <div
              key={`glow-${shown}`}
              className="absolute"
              style={{
                width: "26vmin",
                height: "26vmin",
                background: "radial-gradient(circle, rgba(255,255,255,0.2), transparent 62%)",
                animation: "kickHalo 700ms ease-out both",
              }}
            />

            {/* barrido de escáner sobre el número */}
            <div
              key={`scan-${shown}`}
              className="absolute overflow-hidden"
              style={{ width: "30vmin", height: "30vmin" }}
            >
              <div
                className="absolute inset-x-0"
                style={{
                  height: "18%",
                  background: `linear-gradient(180deg, transparent, ${accent}55, transparent)`,
                  animation: "vxScan 900ms ease-in-out 220ms both",
                }}
              />
            </div>

            {/* número / palabra en voxeles */}
            <div
              className="relative flex items-end"
              style={{ gap: isGo ? "1.1vmin" : 0, filter: "drop-shadow(0 1.4vmin 1.2vmin rgba(0,0,0,0.55))" }}
              data-testid="kickoff-number"
            >
              {(isGo ? ["¡", "Y", "A", "!"] : [shown]).map((ch, i) => (
                <VoxelGlyph key={`${shown}-${i}`} char={ch} unit={unit} exploding={isGo} seedBase={i + 1} />
              ))}
            </div>
          </div>

          <div style={{ marginTop: isGo ? "1.5vmin" : "-1.2vmin" }}>
            <Pill text={isGo ? "¡QUE COMIENCE VOXEL CUP!" : "EL PARTIDO COMIENZA EN"} accent={accent} />
          </div>
        </div>
      </div>
    </div>
  );
};
