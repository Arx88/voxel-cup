import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import logo from "@/assets/logo.png";
import { music } from "@/game/music";
import { uisfx } from "@/game/uisfx";
import { isMuted, getAudio } from "@/game/audio";
import { SoundToggle } from "./SoundToggle";
import { SPLASH } from "@/constants/testIds";

const COLORS = ["#ff2d3c", "#2f74ff", "#ffd21c", "#f4f4f4"];

const makeVoxels = (n) =>
  Array.from({ length: n }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 10 + Math.random() * 24,
    delay: Math.random() * 2.6,
    dur: 2.8 + Math.random() * 2.8,
    drift: (Math.random() * 2 - 1) * 120,
    spin: 180 + Math.random() * 540,
    color: COLORS[i % COLORS.length],
  }));

const CELLS = 18;

// Ancho único que gobierna toda la columna de estado (barra, textos y CTA):
// así el bloque inferior siempre queda ópticamente alineado con el logo.
const COL_W = "min(88vw, 560px)";

// STATE MACHINE: loading -> ready
export const Splash = ({ onDone, short = false }) => {
  const total = short ? 1100 : 2600;
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState("loading"); // loading | ready
  const [exiting, setExiting] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const voxels = useMemo(() => makeVoxels(short ? 18 : 32), [short]);
  const thudRef = useRef(0);
  const phaseRef = useRef("loading");
  const exitingRef = useRef(false);

  // Autoplay gate: si el contexto está suspendido pedimos un tap
  useEffect(() => {
    const a = getAudio();
    const suspended = !a || a.ctx.state !== "running";
    if (!isMuted() && suspended) setNeedsTap(true);
    if (!isMuted() && !suspended) {
      music.start();
      uisfx.whoosh();
    }
    const unlock = () => {
      setNeedsTap(false);
      if (!isMuted()) {
        music.start();
        uisfx.whoosh();
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const t0 = performance.now();
    let raf;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / total);
      const eased = Math.round(k * 100);
      setPct(eased);
      const step = Math.floor(eased / 12);
      if (step > thudRef.current) {
        thudRef.current = step;
        uisfx.thud(0.6 + Math.random() * 0.4);
      }
      if (k < 1) raf = requestAnimationFrame(tick);
      else if (phaseRef.current === "loading") {
        phaseRef.current = "ready";
        uisfx.cheer();
        setPhase("ready");
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  // Solo escuchamos Enter/click cuando estamos en ready
  useEffect(() => {
    if (phase !== "ready") return;
    const advance = () => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      uisfx.thud(1.1);
      setExiting(true);
      setTimeout(() => onDone(), 620);
    };
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", advance);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", advance);
    };
  }, [phase, onDone]);

  const filled = Math.round((pct / 100) * CELLS);
  const isReady = phase === "ready";

  return (
    <div
      data-testid={SPLASH.root}
      className={`absolute inset-0 overflow-hidden vox-noise ${isReady ? "cursor-pointer" : ""}`}
      style={{
        background:
          "radial-gradient(circle at 50% 40%, #1b47a0 0%, #0d2260 34%, #061033 66%, #03060f 100%)",
      }}
    >
      <div className="absolute inset-0 vox-grid opacity-60" />
      <div className="splash-horizon" aria-hidden />

      {/* Voxels cayendo */}
      <AnimatePresence>
        {!exiting &&
          voxels.map((v) => (
            <motion.span
              key={v.id}
              exit={{
                opacity: 0,
                scale: 0.2,
                x: (v.left - 50) * 8,
                y: (Math.random() - 0.5) * 500,
                transition: { duration: 0.5, ease: "easeOut" },
              }}
              className="absolute block rounded-[3px]"
              style={{
                left: `${v.left}%`,
                top: 0,
                width: v.size,
                height: v.size,
                background: v.color,
                opacity: 0.9,
                boxShadow: `0 0 18px ${v.color}55, inset 0 -${Math.round(v.size / 4)}px 0 rgba(0,0,0,0.28)`,
                "--drift": `${v.drift}px`,
                "--spin": `${v.spin}deg`,
                animation: `voxFall ${v.dur}s linear ${v.delay}s infinite`,
              }}
            />
          ))}
      </AnimatePresence>

      <div className="splash-vignette" aria-hidden />

      <SoundToggle className="absolute top-6 right-6 z-30" />

      {/* Composición central: logo + zona de estado, mismo eje y mismo ancho */}
      <div className="relative z-20 h-full w-full flex flex-col items-center justify-center px-6">
        <motion.div
          data-testid={SPLASH.logo}
          initial={{ scale: 0.34, y: -170, opacity: 0, rotateX: 34, rotateZ: -7 }}
          animate={
            exiting
              ? { scale: 1.3, opacity: 0, filter: "blur(8px)" }
              : { scale: 1, y: 0, opacity: 1, rotateX: 0, rotateZ: 0 }
          }
          transition={
            exiting
              ? { duration: 0.45, ease: "easeIn" }
              : { type: "spring", stiffness: 118, damping: 9, mass: 0.9 }
          }
          style={{ perspective: 900 }}
          className="relative flex flex-col items-center"
        >
          {/* halo cálido detrás del logo (sustituye al viejo punto dorado suelto) */}
          <span className="splash-halo" aria-hidden />
          <motion.img
            src={logo}
            alt="Voxel Cup by Acido"
            draggable={false}
            animate={{ rotateZ: [-1.8, 1.8, -1.8], y: [0, -12, 0], scale: [1, 1.015, 1] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-[1] select-none"
            style={{
              maxWidth: "min(90vw, 880px)",
              maxHeight: "54vh",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              filter: "drop-shadow(0 30px 54px rgba(0,0,0,0.65))",
            }}
          />
        </motion.div>

        {/* Zona de estado: alto fijo, ancho fijo. Nunca desplaza al logo. */}
        <div
          className="mt-[clamp(20px,3.6vh,44px)] flex flex-col items-center justify-start"
          style={{ width: COL_W, height: 140 }}
        >
          <AnimatePresence mode="wait">
            {!isReady ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: exiting ? 0 : 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.24 } }}
                transition={{ duration: 0.32 }}
                className="w-full flex flex-col gap-3"
              >
                <div
                  data-testid={SPLASH.progress}
                  className="flex gap-[5px] w-full p-[6px] rounded-xl bg-[#050c22]/75 border border-white/[0.14]"
                  style={{ boxShadow: "inset 0 1px 0 rgba(180,210,255,0.10)" }}
                >
                  {Array.from({ length: CELLS }).map((_, i) => (
                    <span
                      key={i}
                      className="block flex-1 h-[24px] rounded-[3px] transition-all duration-200"
                      style={{
                        background: i < filled ? "#ffd21c" : "rgba(255,255,255,0.07)",
                        boxShadow: i < filled ? "0 0 14px rgba(255,210,28,0.75)" : "none",
                        transform: i < filled ? "scaleY(1)" : "scaleY(0.66)",
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-baseline justify-between w-full">
                  <span className="display-font text-white/70 text-base tracking-[0.30em]">
                    CARGANDO
                  </span>
                  <span
                    data-testid={SPLASH.percent}
                    className="display-font text-2xl text-[#ffd21c] tabular-nums"
                  >
                    {pct}%
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="ready"
                data-testid="press-enter"
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={
                  exiting
                    ? { opacity: 0, y: -8, transition: { duration: 0.25 } }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full flex flex-col items-center gap-3"
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  className="h-[74px] px-8 rounded-2xl border-2 border-[#ffd21c]/60 flex items-center justify-center gap-4"
                  style={{
                    animation: "splashCta 2.2s ease-in-out infinite",
                    background:
                      "linear-gradient(180deg, rgba(255,210,28,0.14) 0%, rgba(255,210,28,0.04) 100%)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <motion.span
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                    className="text-[#ffd21c] text-xl leading-none"
                  >
                    ▶
                  </motion.span>
                  <span
                    className="display-font text-[#ffd21c] text-xl sm:text-2xl tracking-[0.26em] pl-[0.26em]"
                    style={{ textShadow: "0 0 24px rgba(255,210,28,0.65)" }}
                  >
                    PRESIONÁ
                  </span>
                  <span className="display-font grid place-items-center h-10 px-3.5 rounded-lg bg-[#ffd21c] text-[#3a2500] text-base tracking-[0.14em] shadow-[0_4px_0_#b06f00]">
                    ENTER
                  </span>
                </motion.div>
                <span className="display-font text-sm tracking-[0.26em] pl-[0.26em] text-white/50">
                  O TOCÁ LA PANTALLA
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Pie: firma + aviso de audio. Fuera del flujo, no descentra nada. */}
      <div className="absolute inset-x-0 bottom-5 z-20 flex flex-col items-center gap-2 px-6 pointer-events-none">
        {needsTap && !isReady && (
          <motion.span
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 1.7, repeat: Infinity }}
            className="display-font text-[11px] tracking-[0.22em] pl-[0.22em] text-white/60"
          >
            TOCÁ LA PANTALLA PARA ACTIVAR EL SONIDO
          </motion.span>
        )}
        <span className="display-font text-[11px] tracking-[0.34em] pl-[0.34em] text-white/25">
          VOXEL CUP · BY ACIDO
        </span>
      </div>
    </div>
  );
};
