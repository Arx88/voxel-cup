import { useMemo, useState, useEffect, useRef } from "react";
import { Plus, LogIn, Swords, User, X, Check, Copy, RefreshCw, Share2, Crown, Play, UserPlus, AlertTriangle, Loader2, Lock, Delete, Coins, Clock, Trophy, Settings, BarChart3, LogOut, MessageSquare, Zap, Users } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { uisfx } from "@/game/uisfx";
import { sfx } from "@/game/audio";
import { loadProfile } from "@/game/appearance";
import { SoundToggle } from "./SoundToggle";
import { createRoom, getRoom } from "@/game/net";
import { loadCareer } from "@/game/career";

const cn = (...args) => twMerge(clsx(args));
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ═══════════════════════════════════════════════════════════════════════
// ArenaBackground
// ═══════════════════════════════════════════════════════════════════════
function ArenaBackground() {
  const cubes = useMemo(() => {
    let seed = 9871;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    return Array.from({ length: 26 }, () => {
      const r = rnd();
      return { left: rnd()*100, size: 6+rnd()*16, duration: 14+rnd()*18, delay: -rnd()*30, dx: (rnd()-0.5)*160, tone: r>0.78?"red":r>0.6?"gold":"blue" };
    });
  }, []);
  const TONES = { blue: "oklch(0.68 0.2 258)", red: "oklch(0.62 0.22 25)", gold: "oklch(0.85 0.16 84)" };
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url(/voxel-stadium.png)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 35%, transparent 15%, oklch(0.09 0.05 262 / 0.55) 60%, oklch(0.07 0.04 262 / 0.92) 100%)" }} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[oklch(0.09_0.05_262/0.95)] via-[oklch(0.1_0.05_262/0.55)] to-transparent" />
      <div className="absolute inset-y-0 left-0 w-[30%] bg-gradient-to-r from-[oklch(0.09_0.05_262/0.9)] to-transparent" />
      <div className="absolute inset-y-0 right-0 w-[30%] bg-gradient-to-l from-[oklch(0.09_0.05_262/0.9)] to-transparent" />
      {cubes.map((c, i) => (
        <span key={i} className="vc-cube absolute bottom-0 block rounded-[2px]"
          style={{ left: `${c.left}%`, width: c.size, height: c.size, background: TONES[c.tone], boxShadow: `0 0 14px ${TONES[c.tone]}`, opacity: 0.55, animationDuration: `${c.duration}s`, animationDelay: `${c.delay}s`, "--dx": `${c.dx}px` }} />
      ))}
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "repeating-linear-gradient(0deg, oklch(1 0 0 / 0.6) 0px, oklch(1 0 0 / 0.6) 1px, transparent 1px, transparent 3px)" }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PlayerCard
// ═══════════════════════════════════════════════════════════════════════
function PlayerCard({ profile, career }) {
  const name = (profile?.name || "JUGADOR");
  return (
    <div className="vc-rise flex items-center gap-3 rounded-2xl border-2 border-[#ffd21c]/50 bg-[#050c22]/85 p-2.5 pr-3" style={{ animationDelay: "80ms", boxShadow: "0 5px 0 #b06f00" }}>
      <div className="group relative grid size-12 place-items-center overflow-hidden rounded-xl border-2 border-[#ffd21c]/40 bg-[linear-gradient(140deg,#2f74ff,#1a3a8a)]" style={{ boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.35), 0 0 16px rgba(47,116,255,0.35)" }}>
        <span className="display-font text-2xl font-extrabold text-white">{name[0]}</span>
        <span className="absolute inset-0 -translate-y-full bg-gradient-to-b from-white/40 to-transparent transition-transform duration-700 group-hover:translate-y-full" />
      </div>
      <div className="pr-2">
        <p className="display-font text-lg leading-none font-extrabold text-white">{name}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="display-font rounded-md border border-[#ffd21c]/60 bg-[#ffd21c]/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-[#ffd21c]">Nivel {career.level || 1}</span>
          <span className="flex items-center gap-1 rounded-md border border-[#ffd21c]/30 bg-[#0a1430] px-2 py-0.5 text-[11px] font-semibold text-white/70">
            <Coins className="size-3 text-[#ffd21c]" /><span className="tabular-nums">{career.coins || 0}</span>
          </span>
        </div>
      </div>
      <div className="ml-1 flex items-center gap-2">
        <button aria-label="Estadísticas" className="group grid size-11 place-items-center rounded-xl border-2 border-[#ffd21c]/40 bg-[#0a1430] text-[#2f74ff] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#ffd21c]" style={{ boxShadow: "0 3px 0 #b06f00" }}>
          <span className="flex h-4 items-end gap-[3px]">
            {[0.5, 1, 0.7].map((h, i) => (<span key={i} className="w-[3px] origin-bottom rounded-sm bg-[#2f74ff]" style={{ height: `${h*100}%`, animation: `vc-bar ${1.4+i*0.25}s ease-in-out ${i*0.15}s infinite` }} />))}
          </span>
        </button>
        <button aria-label="Ajustes" className="group grid size-11 place-items-center rounded-xl border-2 border-[#ffd21c]/40 bg-[#0a1430] text-[#2f74ff] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#ffd21c]" style={{ boxShadow: "0 3px 0 #b06f00" }}>
          <Settings className="size-5 text-[#2f74ff] transition-transform duration-500 group-hover:rotate-180" />
        </button>
        <SoundToggle className="shrink-0" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ModeSelector
// ═══════════════════════════════════════════════════════════════════════
const MODES = [
  { id: "2v2", label: "2v2", players: 2, time: "2-60s" },
  { id: "3v3", label: "3v3", players: 3, time: "2-90s" },
  { id: "4v4", label: "4v4", players: 4, time: "2-120s" },
];
const POWER_UPS = [
  { id: "ice", color: "oklch(0.72 0.14 235)", ring: "oklch(0.85 0.12 220)" },
  { id: "fire", color: "oklch(0.58 0.22 25)", ring: "oklch(0.75 0.19 30)" },
  { id: "leaf", color: "oklch(0.66 0.16 155)", ring: "oklch(0.82 0.16 150)" },
];

function ModeSelector({ mode, setMode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="display-font text-[13px] font-bold tracking-[0.2em] text-white/70">Modo de juego</h2>
      <div className="flex flex-col gap-2.5">
        {MODES.map((m, i) => {
          const isActive = mode === m.id;
          return (
            <button key={m.id} data-testid={`lobby-mode-${m.id}`} aria-pressed={isActive}
              onClick={() => { uisfx.click(); setMode(m.id); try { localStorage.setItem("voxelcup.mode", m.id); } catch {} }}
              style={{ animationDelay: `${120 + i * 90}ms`, boxShadow: isActive ? "0 5px 0 #6b4a00" : "0 5px 0 #b06f00" }}
              className={cn("vc-rise group relative rounded-xl border-2 px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_1px_0_#b06f00]",
                isActive
                  ? "border-[#ffd21c] bg-[linear-gradient(180deg,#ffdf62,#ffab00)]"
                  : "border-[#ffd21c]/50 bg-[#050c22]/85 hover:border-[#ffd21c]"
              )}>
              {isActive && <span className="absolute inset-y-0 left-0 w-1 bg-[#3a2500] shadow-[0_0_18px_2px_rgba(255,210,28,0.8)]" />}
              <div className="flex items-center gap-3">
                <div className="flex items-end gap-0.5 pb-1">
                  {Array.from({ length: m.players }).map((_, k) => (
                    <Users key={k} className={cn("size-4 transition-colors duration-300", isActive ? "text-[#3a2500]" : "text-[#2f74ff] group-hover:text-[#5a9bff]")} strokeWidth={2.5} />
                  ))}
                </div>
                <div className="min-w-0">
                  <p style={{ textTransform: "none" }} className={cn("display-font text-2xl leading-none font-extrabold transition-colors", isActive ? "text-[#3a2500]" : "text-white/85")}>{m.label}</p>
                  <p className={cn("display-font mt-1 text-[11px] font-semibold tracking-[0.12em]", isActive ? "text-[#3a2500]/70" : "text-white/55")}>Partidas rápidas</p>
                  <p className={cn("mt-0.5 flex items-center gap-1 text-[11px]", isActive ? "text-[#3a2500]/70" : "text-white/40")}><Clock className={cn("size-3", isActive ? "text-[#3a2500]" : "text-[#2f74ff]")} /> {m.time}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="vc-rise mt-1 flex items-center justify-between gap-3 rounded-xl border-2 border-[#ffd21c]/50 bg-[#050c22]/85 px-3 py-2.5" style={{ animationDelay: "420ms", boxShadow: "0 4px 0 #b06f00" }}>
        <div className="flex items-center gap-2">
          <Zap className="size-4 shrink-0 text-[#ffd21c]" style={{ animation: "vc-pulse-glow 2.4s ease-in-out infinite" }} />
          <p className="display-font text-[11px] leading-tight font-bold tracking-[0.12em] text-white/70">Power-ups<br />activos</p>
        </div>
        <div className="flex items-center gap-2">
          {POWER_UPS.map((p, i) => (
            <span key={p.id} className="grid size-9 place-items-center rounded-md border transition-transform duration-300 hover:scale-110"
              style={{ borderColor: p.ring, background: `radial-gradient(circle at 30% 25%, ${p.ring}, ${p.color})`, boxShadow: `0 0 14px ${p.color}`, animation: `vc-float ${3+i*0.4}s ease-in-out ${i*0.3}s infinite` }}>
              <span className="size-3.5 rotate-45 rounded-[2px] bg-white/85" />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ActionPanel
// ═══════════════════════════════════════════════════════════════════════
// Estética Splash: bordes amarillos (#ffd21c), iconos azules vibrantes (#2f74ff),
// fondos oscuros sólidos con sombra voxel inferior estilo "0 4px 0 #b06f00".
const ACCENTS = {
  violet: { card: "border-2 border-[#ffd21c]/50 bg-[#050c22]/85 hover:border-[#ffd21c]", icon: "border-2 border-[#ffd21c]/40 bg-[#0a1430] text-[#2f74ff]", glow: "#ffd21c" },
  blue: { card: "border-2 border-[#ffd21c]/50 bg-[#050c22]/85 hover:border-[#ffd21c]", icon: "border-2 border-[#ffd21c]/40 bg-[#0a1430] text-[#2f74ff]", glow: "#ffd21c" },
  red: { card: "border-2 border-[#ffd21c]/50 bg-[#050c22]/85 hover:border-[#ffd21c]", icon: "border-2 border-[#ffd21c]/40 bg-[#0a1430] text-[#2f74ff]", glow: "#ffd21c" },
};

function ActionCard({ icon, title, lines, accent, delay, onClick }) {
  const a = ACCENTS[accent];
  return (
    <button type="button" onClick={onClick} style={{ animationDelay: `${delay}ms`, boxShadow: "0 5px 0 #b06f00" }}
      className={cn("vc-rise group relative flex items-center gap-4 rounded-2xl p-4 text-left transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_1px_0_#b06f00]", a.card)}>
      <span className={cn("grid size-16 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105", a.icon)} style={{ boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.35), 0 0 16px rgba(47,116,255,0.35)" }}>{icon}</span>
      <span className="min-w-0">
        <span className="display-font block text-xl leading-tight font-extrabold text-white sm:text-2xl">{title}</span>
        <span className="display-font mt-1 block text-[12px] leading-snug font-semibold tracking-[0.08em] text-white/55">
          {lines.map((l) => <span key={l} className="block">{l}</span>)}
        </span>
      </span>
    </button>
  );
}

function ActionPanel({ mode, onPlayVsAi, onEditPlayer, onEnterRoom }) {
  const [screen, setScreen] = useState("none");
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {screen === "crear" && <CreateRoomScreen mode={mode} onClose={() => setScreen("none")} onEnterRoom={onEnterRoom} busy={busy} setBusy={setBusy} />}
      {screen === "unirse" && <JoinCodeScreen onClose={() => setScreen("none")} onEnterRoom={onEnterRoom} mode={mode} />}
      <ActionCard delay={200} onClick={() => setScreen("crear")} accent="violet" icon={<Plus className="size-7 transition-transform duration-300 group-hover:rotate-90" strokeWidth={3} />} title="Crear sala" lines={["Generá un código", "y compartilo"]} />
      <ActionCard delay={280} onClick={() => setScreen("unirse")} accent="blue" icon={<LogIn className="size-7 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2.5} />} title="Unirse con código" lines={["Ingresá las 4", "letras de una sala"]} />
      <ActionCard delay={360} onClick={onPlayVsAi} accent="red" icon={<Swords className="vc-shake size-7" strokeWidth={2.5} />} title="Partido rápido" lines={["Vos vs IA - al instante"]} />
      <ActionCard delay={440} onClick={onEditPlayer} accent="blue" icon={<User className="size-7 transition-transform duration-300 group-hover:scale-110" strokeWidth={2.5} />} title="Mi jugador" lines={["Editar avatar", "y dorsal"]} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ScreenShell
// ═══════════════════════════════════════════════════════════════════════
function ScreenShell({ title, subtitle, accent, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  const ring = accent === "violet"
    ? "border-vc-violet/50 shadow-[0_40px_120px_-40px_oklch(0.6_0.19_300/0.9),inset_0_1px_0_oklch(1_0_0/0.08)]"
    : "border-vc-blue/50 shadow-[0_40px_120px_-40px_oklch(0.62_0.18_258/0.9),inset_0_1px_0_oklch(1_0_0/0.08)]";
  const glow = accent === "violet" ? "oklch(0.6 0.19 300 / 0.5)" : "oklch(0.62 0.18 258 / 0.5)";
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button aria-label="Cerrar" onClick={onClose} className="vc-fade-in absolute inset-0 cursor-default bg-[oklch(0.09_0.04_262/0.88)]" />
      <section className={cn("vc-screen-in relative flex max-h-[88vh] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border sm:rounded-3xl", "bg-[linear-gradient(160deg,oklch(0.19_0.07_265/0.97),oklch(0.12_0.045_262/0.98))]", ring)}>
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${glow},transparent)` }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)", backgroundSize: "34px 34px", maskImage: "radial-gradient(circle at 50% 0%, black, transparent 78%)" }} />
        <header className="relative flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="display-font text-xl leading-none font-extrabold text-white sm:text-2xl">{title}</h2>
            <p className="display-font mt-1.5 text-[10px] font-semibold tracking-[0.16em] text-white/50 sm:text-[11px]">{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Volver" className="group grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition-all duration-300 hover:rotate-90 hover:border-vc-red/60 hover:bg-vc-red/20 hover:text-white sm:size-10">
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </header>
        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">{children}</div>
        {footer && <footer className="relative shrink-0 border-t border-white/10 bg-[oklch(0.1_0.04_262/0.6)] px-5 py-3 sm:px-6 sm:py-4">{footer}</footer>}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CreateRoomScreen
// ═══════════════════════════════════════════════════════════════════════
function randomCode() { return Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join(""); }

function CreateRoomScreen({ mode, onClose, onEnterRoom, busy, setBusy }) {
  const [error, setError] = useState(null);
  // React StrictMode (dev) double-mounts this effect, which would otherwise
  // fire `createRoom()` TWICE and leak a ghost room on the backend. The host
  // then lands in one room while the guest joins the other — so they never
  // meet. Share ONE in-flight promise across both effect runs so exactly one
  // room is created.
  const createPromiseRef = useRef(null);

  // Al montar: crear la sala en el backend y pasar DIRECTO a RoomScreen.
  // No mostramos equipos ni botón "Iniciar partido" acá — eso es tarea de
  // RoomScreen. Este modal solo es un puente: crea la sala y transiciona.
  useEffect(() => {
    let cancelled = false;
    if (createPromiseRef.current == null) {
      createPromiseRef.current = createRoom(mode);
    }
    (async () => {
      try {
        setBusy(true);
        const res = await createPromiseRef.current;
        if (cancelled) return;
        // Pasar directo a RoomScreen con el código real del backend.
        // onEnterRoom va a cambiar el stage en App.js a "room".
        onEnterRoom(res.code, mode, true);
      } catch (e) {
        if (cancelled) return;
        setError("No se pudo crear la sala. ¿Backend caído?");
        setBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenShell title="Creando sala…" subtitle={`Modo ${mode} · partidas rápidas`} accent="violet" onClose={onClose}>
      <div className="flex flex-col items-center justify-center gap-4 py-10">
        {error ? (
          <>
            <AlertTriangle className="size-10 text-vc-red" strokeWidth={2.5} />
            <p className="display-font text-sm tracking-[0.12em] text-vc-red">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="size-10 animate-spin text-vc-violet" strokeWidth={2.5} />
            <p className="display-font text-sm tracking-[0.16em] uppercase text-white/60">
              Creando sala…
            </p>
          </>
        )}
      </div>
    </ScreenShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// JoinCodeScreen
// ═══════════════════════════════════════════════════════════════════════
const SALAS = [
  { code: "ACID", host: "ACIDO", mode: "2v2", players: "3/4", ping: 24, locked: false },
  { code: "VOXL", host: "PIXELITO", mode: "3v3", players: "4/6", ping: 38, locked: false },
  { code: "CUPA", host: "CUBO88", mode: "4v4", players: "7/8", ping: 61, locked: false },
  { code: "KING", host: "LA_ROJA", mode: "2v2", players: "2/4", ping: 88, locked: true },
];

function JoinCodeScreen({ onClose, onEnterRoom, mode }) {
  const [chars, setChars] = useState(["", "", "", ""]);
  const [state, setState] = useState("idle");
  const [roomInfo, setRoomInfo] = useState(null);
  const inputs = useRef([]);
  const code = chars.join("");
  const complete = code.length === 4;

  useEffect(() => { inputs.current[0]?.focus(); }, []);
  // Validar contra el backend real: GET /api/rooms/{code}
  // Si responde 200 → sala existe y se puede entrar. Si 404 → no existe.
  // Timeout de 4s para no quedar en "checking" para siempre si el backend no responde.
  // OJO: NO incluir `state` en las deps — si lo hacemos, el cleanup aborta el fetch
  // en curso cuando state pasa a "checking", y nunca llega la respuesta.
  useEffect(() => {
    if (!complete) return;
    setState("checking");
    let cancelled = false;
    let timedOut = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
      if (!cancelled) setState("error");
    }, 4000);
    (async () => {
      try {
        const room = await getRoom(code.toUpperCase(), { signal: ctrl.signal });
        if (cancelled || timedOut) return;
        clearTimeout(timer);
        if (room && room.code) {
          setRoomInfo(room);
          setState("ok");
        } else {
          setState("error");
        }
      } catch (e) {
        if (cancelled || timedOut) return;
        clearTimeout(timer);
        setState("error");
      }
    })();
    return () => { cancelled = true; clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, complete]);

  function setChar(i, raw) {
    const v = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (state === "error") setState("idle");
    if (!v) { setChars(c => c.map((x, k) => k === i ? "" : x)); return; }
    const letters = v.split("");
    setChars(c => { const next = [...c]; letters.forEach((l, k) => { if (i + k < 4) next[i + k] = l; }); return next; });
    inputs.current[Math.min(i + letters.length, 3)]?.focus();
  }
  function onKeyDown(i, e) {
    if (e.key === "Backspace" && !chars[i] && i > 0) { e.preventDefault(); setChars(c => c.map((x, k) => k === i - 1 ? "" : x)); inputs.current[i - 1]?.focus(); }
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 3) inputs.current[i + 1]?.focus();
  }
  function limpiar() { setChars(["", "", "", ""]); setState("idle"); inputs.current[0]?.focus(); }
  function usarCodigo(c) { setState("idle"); setChars(c.split("")); inputs.current[3]?.focus(); }

  const border = state === "error" ? "border-vc-red/80 shadow-[inset_0_0_26px_oklch(0.58_0.22_25/0.4)]"
    : state === "ok" ? "border-vc-green/80 shadow-[inset_0_0_26px_oklch(0.72_0.17_155/0.35)]"
    : "border-vc-blue/45 shadow-[inset_0_0_24px_oklch(0.62_0.18_258/0.35)]";

  return (
    <ScreenShell title="Unirse con código" subtitle="Ingresá las 4 letras de una sala" accent="blue" onClose={onClose}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className={cn("display-font flex items-center gap-2 text-[11px] font-bold tracking-[0.14em]", state === "error" ? "text-vc-red" : state === "ok" ? "text-vc-green" : "text-white/45")}>
            {state === "checking" && <Loader2 className="size-4 animate-spin" strokeWidth={3} />}
            {state === "ok" && <Check className="size-4" strokeWidth={3} />}
            {state === "error" && <AlertTriangle className="size-4" strokeWidth={2.5} />}
            {state === "checking" ? "Buscando sala..." : state === "ok" ? (roomInfo ? `¡Sala ${code} encontrada! (${roomInfo.mode})` : `¡Sala ${code} encontrada!`) : state === "error" ? "Esa sala no existe o ya arrancó" : "Ingresá las 4 letras que te pasó el host"}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={limpiar} className="display-font inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-[12px] font-bold tracking-[0.12em] text-white/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-vc-red/60 hover:text-white">
              <Delete className="size-4" strokeWidth={2.5} />Borrar
            </button>
            <button disabled={state !== "ok"} onClick={() => onEnterRoom(code, roomInfo?.mode || mode, false)}
              className={cn("display-font vc-sweep group relative inline-flex items-center gap-2 overflow-hidden rounded-xl border px-5 py-2.5 text-[13px] font-extrabold tracking-[0.12em] transition-all duration-300 hover:-translate-y-0.5",
                state === "ok" ? "vc-glow-gold border-vc-gold bg-[linear-gradient(100deg,oklch(0.82_0.16_84),oklch(0.72_0.15_60))] text-[oklch(0.18_0.05_262)]" : "border-white/12 bg-white/5 text-white/35")}>
              <LogIn className="size-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />Entrar a la sala
            </button>
          </div>
        </div>
      }>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-7">
        <div className="flex flex-col gap-4">
          <p className="display-font text-[11px] font-bold tracking-[0.2em] text-white/45">Código de sala</p>
          <div className="flex gap-2 sm:gap-2.5">
            {chars.map((c, i) => (
              <div key={i} className="relative flex-1">
                <input ref={el => { inputs.current[i] = el; }} value={c} onChange={e => setChar(i, e.target.value)} onKeyDown={e => onKeyDown(i, e)}
                  inputMode="text" autoComplete="off" spellCheck={false} aria-label={`Letra ${i+1}`}
                  className={cn("display-font h-16 w-full rounded-2xl border bg-[linear-gradient(160deg,oklch(0.26_0.12_258/0.45),oklch(0.13_0.05_262/0.92))]",
                    "text-center text-3xl font-extrabold text-white caret-transparent transition-all duration-300 sm:h-24 sm:text-4xl lg:text-5xl",
                    "focus:-translate-y-1 focus:outline-none focus:border-vc-gold focus:shadow-[0_0_0_2px_oklch(0.82_0.16_84/0.35),inset_0_0_26px_oklch(0.82_0.16_84/0.25)]",
                    border, state === "error" && "animate-[vc-shake_0.4s_ease-in-out]")} />
                {!c && <span className="vc-caret pointer-events-none absolute inset-x-0 bottom-3 mx-auto h-0.5 w-5 bg-vc-gold/80 sm:bottom-4 sm:w-6" />}
              </div>
            ))}
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            {state === "checking" ? <span className="block h-full w-1/3 rounded-full bg-vc-gold [animation:vc-progress_0.9s_ease-in-out_infinite]" />
            : <span className={cn("block h-full rounded-full transition-all duration-500", state === "ok" ? "bg-vc-green" : state === "error" ? "bg-vc-red" : "bg-vc-blue")} style={{ width: `${(code.length / 4) * 100}%` }} />}
          </div>
          <div className="mt-1 hidden rounded-2xl border border-white/10 bg-[oklch(0.16_0.05_262/0.55)] p-3 sm:block">
            <p className="display-font mb-2.5 text-[10px] font-bold tracking-[0.18em] text-white/40">Teclado rápido</p>
            <div className="grid grid-cols-9 gap-1.5">
              {CODE_ALPHABET.split("").map(l => (
                <button key={l} onClick={() => { const idx = chars.findIndex(x => !x); setChar(idx === -1 ? 3 : idx, l); }}
                  className="display-font aspect-square rounded-md border border-white/12 bg-white/5 text-[12px] font-bold text-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-vc-gold/70 hover:bg-vc-gold/20 hover:text-white active:scale-95">
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <p className="display-font text-[11px] font-bold tracking-[0.2em] text-white/45">Salas activas</p>
          <ul className="flex flex-col gap-2.5">
            {SALAS.map((s, i) => (
              <li key={s.code}>
                <button disabled={s.locked} onClick={() => usarCodigo(s.code)} style={{ animationDelay: `${120 + i * 80}ms` }}
                  className={cn("vc-rise vc-sweep group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-all duration-300",
                    s.locked ? "cursor-not-allowed border-white/10 bg-white/[0.03] opacity-60" : "border-white/12 bg-[oklch(0.18_0.05_262/0.75)] hover:-translate-y-0.5 hover:border-vc-blue/70 hover:bg-[oklch(0.22_0.07_258/0.85)]",
                    code === s.code && !s.locked && "border-vc-gold/80 bg-vc-gold/10")}>
                  <span className="display-font grid size-11 shrink-0 place-items-center rounded-lg border border-vc-blue/45 bg-[oklch(0.28_0.12_258/0.5)] text-[15px] font-extrabold tracking-[0.06em] text-white">{s.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="display-font block truncate text-[13px] font-bold tracking-[0.08em] text-white">{s.host}</span>
                    <span className="mt-1 flex items-center gap-3 text-[11px] text-white/45">
                      <span className="display-font font-bold text-vc-gold">{s.mode}</span>
                      <span className="inline-flex items-center gap-1"><Users className="size-3" strokeWidth={2.5} />{s.players}</span>
                      <span className="inline-flex items-center gap-1">
                        <span className={cn("size-1.5 rounded-full", s.ping < 40 ? "bg-vc-green" : s.ping < 70 ? "bg-vc-gold" : "bg-vc-red")} />{s.ping}ms
                      </span>
                    </span>
                  </span>
                  {s.locked ? <Lock className="size-4 shrink-0 text-white/40" strokeWidth={2.5} /> : <LogIn className="size-4 shrink-0 text-white/45 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-white" strokeWidth={2.5} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-vc-blue/30 bg-[oklch(0.18_0.06_258/0.18)] p-3.5">
            <p className="display-font flex items-center gap-2 text-[11px] font-bold tracking-[0.12em] text-vc-blue">
              <Zap className="size-4" strokeWidth={2.5} />
              Validación en tiempo real
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
              Al escribir las 4 letras, validamos contra el servidor si la sala existe. Si no responde en 4s, te avisamos.
            </p>
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SidePanels
// ═══════════════════════════════════════════════════════════════════════
function PrizeBanner() {
  return (
    <div className="vc-rise group relative overflow-hidden rounded-2xl border-2 border-[#ffd21c]/50 bg-[#050c22]/85 p-4" style={{ animationDelay: "160ms", boxShadow: "0 5px 0 #b06f00" }}>
      <div className="flex items-center gap-3">
        <div className="relative grid size-20 shrink-0 place-items-center rounded-xl border-2 border-[#ffd21c]/40 bg-[#0a1430]" style={{ boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.35), 0 0 16px rgba(255,210,28,0.25)" }}>
          <span className="absolute inset-0 rounded-xl bg-[conic-gradient(from_0deg,transparent,rgba(255,210,28,0.35),transparent_45%)]" style={{ animation: "vc-spin-slow 6s linear infinite" }} />
          <Trophy className="relative size-10 text-[#ffd21c] drop-shadow-[0_0_12px_rgba(255,210,28,0.9)] transition-transform duration-500 group-hover:scale-110" strokeWidth={2.5} />
        </div>
        <p className="display-font text-[15px] leading-tight font-extrabold text-white">¡Competí<br />y gana<br /><span className="text-[#ffd21c]">la Voxel Cup!</span></p>
      </div>
      <button data-testid="lobby-store" className="display-font mt-3 w-full rounded-lg border-2 border-[#ffd21c]/40 bg-[#0a1430] px-3 py-2 text-[12px] font-bold tracking-[0.16em] text-[#2f74ff] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#ffd21c] hover:text-[#5a9bff]" style={{ boxShadow: "0 3px 0 #b06f00" }}>
        Ver premios
      </button>
    </div>
  );
}

function RecentMatches({ recent, playerName }) {
  const matches = recent.length > 0 ? recent : [
    { teams: `FANTASMA & ${playerName}`, score: "3-1" },
    { teams: `FANTASMA & ${playerName}`, score: "2-0" },
    { teams: `FANTASMA & ${playerName}`, score: "4-2" },
  ];
  return (
    <section className="vc-rise rounded-2xl border-2 border-[#ffd21c]/50 bg-[#050c22]/85 p-4" style={{ animationDelay: "240ms", boxShadow: "0 5px 0 #b06f00" }}>
      <h2 className="display-font text-[12px] font-bold tracking-[0.18em] text-white/70">Últimos partidos</h2>
      <ul className="mt-3 flex flex-col">
        {matches.map((m, i) => {
          const sc = m.score && typeof m.score === "object" ? `${m.score.red ?? 0}-${m.score.blue ?? 0}` : m.score || "";
          const win = m.result === "W"; const draw = m.result === "D";
          return (
            <li key={i} className="group flex items-center justify-between gap-2 border-b border-white/8 py-2.5 transition-colors last:border-0 hover:bg-white/5" style={{ animation: `vc-rise 0.6s cubic-bezier(0.2,0.9,0.2,1) ${300 + i * 110}ms both` }}>
              <div className="min-w-0">
                <p className="display-font truncate text-[12px] font-bold tracking-[0.06em] text-[oklch(0.72_0.15_250)]">{m.teams || `FANTASMA & ${playerName}`}</p>
                <p className="display-font text-[11px] font-bold tracking-[0.1em]" style={{ color: win ? "var(--vc-green)" : draw ? "var(--vc-gold)" : "var(--vc-red)" }}>{win ? "Ganó" : draw ? "Empate" : "Perdió"}</p>
              </div>
              <p className="display-font text-xl font-extrabold tabular-nums text-white transition-transform duration-300 group-hover:scale-110">{sc}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// FooterBar
// ═══════════════════════════════════════════════════════════════════════
function DiscordIcon({ className }) { return (<svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M20.32 4.57A19.8 19.8 0 0 0 15.4 3l-.36.74a14.6 14.6 0 0 1 4.3 1.87 13.9 13.9 0 0 0-4.9-1.4 15.4 15.4 0 0 0-4.9 0 13.9 13.9 0 0 0-4.9 1.4 14.6 14.6 0 0 1 4.3-1.87L8.6 3a19.8 19.8 0 0 0-4.92 1.57C1.5 8.53.9 12.44 1.2 16.3A16.3 16.3 0 0 0 6.2 19l.9-1.4c-.9-.33-1.75-.77-2.5-1.3l.6-.46a13.9 13.9 0 0 0 13.6 0l.6.46c-.76.53-1.6.97-2.5 1.3l.9 1.4a16.3 16.3 0 0 0 5-2.7c.4-4.6-.6-8.5-2.48-11.73ZM8.7 14.2c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.82.9 1.8 2c0 1.1-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.82.9 1.8 2c0 1.1-.8 2-1.8 2Z" /></svg>); }
function InstagramIcon({ className }) { return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>); }
function TwitterIcon({ className }) { return (<svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M22 5.9c-.8.35-1.6.6-2.5.7a4.3 4.3 0 0 0 1.9-2.4c-.9.55-1.85.93-2.85 1.1a4.25 4.25 0 0 0-7.3 3.9A12.1 12.1 0 0 1 2.5 4.7a4.25 4.25 0 0 0 1.3 5.7c-.7 0-1.4-.2-2-.55v.06a4.25 4.25 0 0 0 3.4 4.16c-.65.18-1.35.2-2 .08a4.25 4.25 0 0 0 4 2.95A12 12 0 0 1 2 19.55A17 17 0 0 0 11.2 22c5.55 0 10-4.6 9.8-10.25A8.7 8.7 0 0 0 22 5.9Z" /></svg>); }
function YoutubeIcon({ className }) { return (<svg viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M21.6 7.2a2.6 2.6 0 0 0-1.83-1.84C18.1 4.9 12 4.9 12 4.9s-6.1 0-7.77.46A2.6 2.6 0 0 0 2.4 7.2C2 8.9 2 12 2 12s0 3.1.4 4.8a2.6 2.6 0 0 0 1.83 1.84C5.9 19.1 12 19.1 12 19.1s6.1 0 7.77-.46a2.6 2.6 0 0 0 1.83-1.84C22 15.1 22 12 22 12s0-3.1-.4-4.8ZM10.1 15.2V8.8L15.6 12l-5.5 3.2Z" /></svg>); }
const SOCIALS = [{ label: "Discord", icon: DiscordIcon }, { label: "Instagram", icon: InstagramIcon }, { label: "Twitter", icon: TwitterIcon }, { label: "YouTube", icon: YoutubeIcon }];

function FooterBar({ onBack }) {
  return (
    <footer className="vc-rise flex flex-wrap items-center gap-4 rounded-2xl border border-vc-blue/35 bg-[oklch(0.14_0.05_262/0.9)] p-4" style={{ animationDelay: "520ms" }}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-lg border border-white/12 bg-[oklch(0.22_0.06_262/0.9)]"><MessageSquare className="size-5 text-white/70" /></span>
        <div>
          <p className="display-font text-[13px] font-extrabold tracking-[0.06em] text-white">¡Bienvenido a Voxel Cup!</p>
          <p className="display-font text-[11px] font-semibold tracking-[0.08em] text-white/50">Armá tu equipo y domina la cancha.</p>
        </div>
      </div>
      <div className="mx-auto flex items-center gap-3">
        <span className="display-font hidden text-[11px] font-bold tracking-[0.18em] text-white/50 sm:block">Seguinos en</span>
        <div className="flex items-center gap-2">
          {SOCIALS.map(({ label, icon: Icon }, i) => (
            <button key={label} aria-label={label} className="grid size-10 place-items-center rounded-lg border border-white/12 bg-[oklch(0.2_0.06_262/0.9)] transition-all duration-300 hover:-translate-y-1 hover:border-vc-blue hover:bg-[oklch(0.28_0.1_258/0.9)]" style={{ animation: `vc-rise 0.6s ease-out ${560 + i * 70}ms both` }}>
              <Icon className="size-[18px] text-white/80" />
            </button>
          ))}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-5">
        <div className="text-right">
          <p className="display-font text-[11px] font-bold tracking-[0.12em] text-white/45">v1.0.0</p>
          <p className="display-font flex items-center justify-end gap-1.5 text-[11px] font-bold tracking-[0.12em] text-white/45">
            Región: SA
            <span className="flex h-3 items-end gap-[2px]">
              {[0.4, 0.7, 1].map((h, i) => (<span key={i} className="w-[3px] origin-bottom rounded-sm bg-vc-green" style={{ height: `${h*100}%`, animation: `vc-bar ${1.2+i*0.3}s ease-in-out ${i*0.2}s infinite` }} />))}
            </span>
          </p>
        </div>
        {onBack && (
          <button onClick={() => { uisfx.click(); onBack(); }} className="vc-sweep vc-glow-gold group relative flex items-center gap-3 overflow-hidden rounded-xl bg-[linear-gradient(100deg,oklch(0.86_0.16_88),oklch(0.76_0.16_78))] px-7 py-3 transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0">
            <span className="display-font text-lg font-extrabold tracking-[0.06em] text-[oklch(0.2_0.05_262)]">Salir</span>
            <LogOut className="size-5 text-[oklch(0.2_0.05_262)] transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        )}
      </div>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Lobby (main export)
// ═══════════════════════════════════════════════════════════════════════
export const Lobby = ({ onPlayVsAi, onEditPlayer, onEnterRoom, onBack }) => {
  const profile = useMemo(() => loadProfile(), []);
  const career = useMemo(() => loadCareer(), []);
  const playerName = (profile?.name || "JUGADOR").toUpperCase();
  const recent = (career?.history || []).slice(0, 4);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("voxelcup.mode") || "2v2"; } catch { return "2v2"; } });

  return (
    <main data-testid="lobby-screen" className="relative min-h-screen w-full overflow-hidden">
      <ArenaBackground />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1680px] flex-col gap-4 p-4 lg:p-6">
        <header className="flex items-start justify-between gap-4">
          <div className="vc-rise" style={{ animation: "vc-float 6s ease-in-out infinite" }}>
            <img src="/voxel-cup-logo.png" alt="Voxel Cup by Acido" className="h-28 w-auto drop-shadow-[0_10px_30px_oklch(0.09_0.05_262/0.9)] lg:h-36" />
          </div>
          <PlayerCard profile={profile} career={career} />
        </header>
        <div className="grid flex-1 grid-cols-1 items-end gap-4 lg:grid-cols-[minmax(260px,300px)_1fr_minmax(240px,300px)]">
          <ModeSelector mode={mode} setMode={setMode} />
          <div className="flex h-full flex-col justify-end">
            <ActionPanel mode={mode} onPlayVsAi={onPlayVsAi} onEditPlayer={onEditPlayer} onEnterRoom={onEnterRoom} />
          </div>
          <div className="flex flex-col gap-4">
            <PrizeBanner />
            <RecentMatches recent={recent} playerName={playerName} />
          </div>
        </div>
        <FooterBar onBack={onBack} />
      </div>
    </main>
  );
};

export default Lobby;
