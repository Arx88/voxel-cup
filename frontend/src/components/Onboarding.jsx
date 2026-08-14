import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Gamepad2, Move, Trophy, MessageCircle } from "lucide-react";
import { uisfx } from "@/game/uisfx";
import { SoundToggle } from "./SoundToggle";
import { ONBOARDING } from "@/constants/testIds";

const Cube = ({ color, size, x, y, delay, float = 1 }) => (
  <motion.span
    className="absolute block rounded-[4px]"
    initial={{ opacity: 0, scale: 0.2, y: y - 40 }}
    animate={{ opacity: 1, scale: 1, y }}
    transition={{ delay, type: "spring", stiffness: 180, damping: 12 }}
    style={{
      left: x,
      width: size,
      height: size,
      background: color,
      boxShadow: `0 0 20px ${color}55, inset 0 -${Math.round(size / 4)}px 0 rgba(0,0,0,0.3)`,
      animation: `voxIdle ${2.4 + float}s ease-in-out ${delay}s infinite`,
    }}
  />
);

const ArtPlay = () => (
  <div className="relative w-full h-[210px]">
    <Cube color="#2f74ff" size={54} x="12%" y={110} delay={0.05} />
    <Cube color="#f4f4f4" size={40} x="34%" y={48} delay={0.15} float={0.4} />
    <Cube color="#ff2d3c" size={54} x="58%" y={118} delay={0.25} float={1.4} />
    <Cube color="#ffd21c" size={30} x="78%" y={62} delay={0.35} float={0.8} />
    <div className="absolute inset-x-0 bottom-2 h-[10px] rounded-full bg-[#2f74ff]/25 blur-[6px]" />
  </div>
);

const ArtControls = () => (
  <div className="relative w-full h-[210px] flex items-center justify-center gap-4">
    {["W", "A", "S", "D"].map((k, i) => (
      <motion.span
        key={k}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: [0, -10, 0], opacity: 1 }}
        transition={{ delay: 0.1 * i, duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="display-font grid place-items-center w-16 h-16 rounded-xl text-2xl text-[#071129] bg-white"
        style={{ boxShadow: "0 8px 0 #8ea4cc" }}
      >
        {k}
      </motion.span>
    ))}
    <Cube color="#ffd21c" size={26} x="86%" y={40} delay={0.4} />
  </div>
);

const ArtCup = () => (
  <div className="relative w-full h-[210px] grid place-items-center">
    <motion.div
      animate={{ rotate: [-4, 4, -4], scale: [1, 1.06, 1] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      className="grid place-items-center w-32 h-32 rounded-2xl"
      style={{
        background: "linear-gradient(160deg,#ffe27a,#ffb400)",
        boxShadow: "0 0 60px rgba(255,196,0,0.45), inset 0 -12px 0 rgba(0,0,0,0.18)",
      }}
    >
      <Trophy size={64} strokeWidth={2.6} color="#4a2c00" />
    </motion.div>
    <Cube color="#ff2d3c" size={22} x="20%" y={40} delay={0.2} />
    <Cube color="#2f74ff" size={30} x="76%" y={140} delay={0.3} float={1.2} />
  </div>
);

const SLIDES = [
  {
    tag: "CÓMO SE JUEGA",
    title: "1 TAP Y A LA CANCHA",
    text: "Partidos rápidos de fútbol voxel 2v2, 3v3 o 4v4, todos con arquero IA. Robá la pelota, pasá, y definí.",
    Art: ArtPlay,
    Icon: Gamepad2,
  },
  {
    tag: "CONTROLES",
    title: "MOVÉ, CORRÉ, PATEÁ",
    text: "WASD para moverte, SHIFT para correr, ESPACIO para patear. En mobile usá el joystick y los botones.",
    Art: ArtControls,
    Icon: Move,
  },
  {
    tag: "OBJETIVO",
    title: "LEVANTÁ LA VOXEL CUP",
    text: "Ganá partidos, sumá power-ups y llevate el trofeo dorado del torneo.",
    Art: ArtCup,
    Icon: Trophy,
  },
  {
    tag: "COMUNICATE",
    title: "EMOJIS TÁCTICOS",
    text: "Usá las teclas 1 a 4: 👆 pedir balón (la IA te lo pasa), ❗ patear (la IA tira), 😡 enojarse (IA agresiva), 👏 aplaudir (IA paciente). Tu equipo reacciona por 4 segundos.",
    Art: ArtControls,
    Icon: MessageCircle,
  },
];

export const Onboarding = ({ onDone }) => {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);

  const go = (next) => {
    if (next < 0 || next > SLIDES.length - 1) return;
    setDir(next > i ? 1 : -1);
    uisfx.swipe(next > i ? 1 : -1);
    setI(next);
  };

  const advance = () => {
    if (i === SLIDES.length - 1) {
      uisfx.pop();
      onDone();
    } else {
      go(i + 1);
    }
  };

  const s = SLIDES[i];

  return (
    <div
      data-testid={ONBOARDING.root}
      className="absolute inset-0 overflow-hidden vox-noise"
      style={{
        background:
          "radial-gradient(circle at 30% 25%, #12387f 0%, #0a1c49 40%, #050b20 74%, #03060f 100%)",
      }}
    >
      <div className="absolute inset-0 vox-grid opacity-50" />

      <div className="absolute top-5 right-5 flex items-center gap-3 z-40">
        <SoundToggle />
        <button
          data-testid={ONBOARDING.skip}
          onClick={() => {
            uisfx.click();
            onDone();
          }}
          className="display-font px-5 h-12 rounded-xl bg-white/8 border-2 border-white/15 text-white text-sm tracking-[0.2em] transition-all hover:border-white/40 hover:-translate-y-0.5 active:scale-95"
        >
          SALTAR
        </button>
      </div>

      <div className="relative h-full flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-[720px]">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={i}
              data-testid={ONBOARDING.slide}
              custom={dir}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.16}
              onDragEnd={(e, info) => {
                if (info.offset.x < -70) go(i + 1);
                else if (info.offset.x > 70) go(i - 1);
              }}
              initial={{ opacity: 0, x: dir * 90, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: dir * -90, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              className="cursor-grab active:cursor-grabbing rounded-3xl border-2 border-white/12 bg-[#08122e]/85 backdrop-blur-xl p-8 sm:p-11"
              style={{ boxShadow: "0 40px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="grid place-items-center w-9 h-9 rounded-lg bg-[#2f74ff]/20 border border-[#2f74ff]/50">
                  <s.Icon size={18} strokeWidth={2.8} color="#8ab6ff" />
                </span>
                <span className="display-font text-[11px] tracking-[0.34em] text-[#8ab6ff]">{s.tag}</span>
              </div>
              <h2 className="display-font text-4xl sm:text-5xl text-white leading-[0.95] uppercase">
                {s.title.split(" ").slice(0, -1).join(" ")}{" "}
                <span className="text-[#ffd21c]">{s.title.split(" ").slice(-1)}</span>
              </h2>
              <p className="mt-3 text-white/65 text-sm sm:text-base max-w-[520px]">{s.text}</p>
              <s.Art />
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-[10px]">
              {SLIDES.map((_, k) => (
                <button
                  key={k}
                  data-testid={ONBOARDING.dot(k)}
                  onClick={() => go(k)}
                  className="rounded-[3px] transition-all duration-300"
                  style={{
                    width: k === i ? 34 : 12,
                    height: 12,
                    background: k === i ? "#ffd21c" : "rgba(255,255,255,0.2)",
                    boxShadow: k === i ? "0 0 16px rgba(255,210,28,0.6)" : "none",
                  }}
                  aria-label={`Slide ${k + 1}`}
                />
              ))}
            </div>

            <button
              data-testid={ONBOARDING.next}
              onClick={advance}
              className="display-font flex items-center gap-3 h-14 pl-8 pr-6 rounded-2xl text-xl text-[#3a2500] uppercase tracking-wide transition-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
              style={{
                background: "linear-gradient(180deg,#ffd94f,#ffab00)",
                boxShadow: "0 8px 0 #b87400",
              }}
            >
              {i === SLIDES.length - 1 ? "CREAR JUGADOR" : "SIGUIENTE"}
              <ChevronRight size={24} strokeWidth={3.2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
