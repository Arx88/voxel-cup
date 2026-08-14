import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Copy,
  Check,
  Users,
  WifiOff,
  Loader2,
  RefreshCw,
  Crown,
  Bot,
  Play,
  AlertTriangle,
} from "lucide-react";
import { uisfx } from "@/game/uisfx";
import { sfx } from "@/game/audio";
import { loadProfile } from "@/game/appearance";
import { SoundToggle } from "./SoundToggle";
import { RoomClient, buildShareLink, getRoom } from "@/game/net";

// ----------------------------------------------------------------- constants

const TEAM_META = {
  red: { label: "EQUIPO ROJO", color: "#ff2d3c", glow: "rgba(255,45,60,0.45)" },
  blue: { label: "EQUIPO AZUL", color: "#2f74ff", glow: "rgba(47,116,255,0.45)" },
};

const ROLE_META = {
  GK: { label: "ARQ" },
  DEF: { label: "DEF" },
  MID: { label: "MED" },
  FWD: { label: "ATA" },
};

// ----------------------------------------------------------------- helpers

const fmtCode = (code) => (code || "").toUpperCase();
const splitCode = (code) => fmtCode(code).split("");

// ----------------------------------------------------------------- component

export const RoomScreen = ({ code, mode, isHostInitial, onBack, onStart, onChangeMode }) => {
  const profile = useMemo(() => loadProfile(), []);
  const clientRef = useRef(null);
  const startedRef = useRef(false); // P2-SYNC-TEST: skip leave() on unmount if match started
  const [room, setRoom] = useState(null); // last broadcast room state
  const [conn, setConn] = useState("connecting"); // connecting | open | reconnecting | closed | error
  const [errMsg, setErrMsg] = useState("");
  const [copied, setCopied] = useState(false);       // code copied
  const [copiedLink, setCopiedLink] = useState(false); // share link copied

  // ----------------------------------------------------------- wire up client
  useEffect(() => {
    if (!code) return;
    const client = new RoomClient(code, {
      name: profile?.name || "Player",
      level: profile?.level || 1,
      profile,
    });
    client.onRoom = (state) => setRoom(state);
    client.onStatus = (status) => {
      setConn(status);
      if (status === "error" && client.status === "error") {
        setErrMsg("NO SE PUDO CONECTAR A LA SALA.");
      } else if (status === "open" || status === "reconnecting") {
        setErrMsg("");
      }
    };
    client.onError = (reason) => {
      if (reason === "room_not_found") {
        setErrMsg("LA SALA YA NO EXISTE. VOLVÉ AL VESTÍBULO.");
      } else if (reason === "room_full") {
        setErrMsg("SALA LLENA. NO HAY LUGAR PARA MÁS JUGADORES.");
      } else if (reason === "must_join_first") {
        setErrMsg("PROTOCOLO INVÁLIDO (must_join_first).");
      }
    };
    client.onClose = () => {
      // Only fires after intentional leave() — handled by onBack navigation.
    };
    // P2-SYNC-TEST: when the host's `start` message is relayed to us (non-host
    // client), hand the RoomClient up to App so GameCanvas can use it for
    // receiving state snapshots + sending local input.
    client.onStart = (msg) => {
      // Non-host client received the 'start' relay from the server.
      // This means the HOST clicked ¡ARRANCAR! — we MUST transition to
      // the game automatically. The startedRef guard prevents double-entry
      // if the server somehow sends 'start' twice, but we always transition
      // on the first call.
      if (startedRef.current) return;
      startedRef.current = true;
      uisfx.pop?.();
      sfx.whistle?.();
      // Pre-buffer state messages so GameCanvas doesn't miss the first few
      // snapshots while it's mounting + booting WebGL. GameCanvas will
      // replace client.onState with its own handler (ClientSync.onState)
      // and drain this buffer.
      //
      // The buffer-push handler is defensive: if GameCanvas already replaced
      // onState (race condition), this handler won't be called. If GameCanvas
      // already nulled _stateBuffer, we fall back to a no-op (GameCanvas's
      // own handler is now active). This prevents silent state loss.
      if (!client._stateBuffer) client._stateBuffer = [];
      client.onState = (state) => {
        // Only push if the buffer still exists. Once GameCanvas takes over,
        // it replaces this handler with clientSync.onState directly.
        if (client._stateBuffer) client._stateBuffer.push(state);
      };
      // Hand the RoomClient up to App so GameCanvas can use it for receiving
      // state snapshots + sending local input. App will switch to "game" stage.
      onStart?.({
        seed: msg?.seed,
        config: msg?.config,
        room,
        client, // ownership transfers to App — cleanup must NOT call leave()
      });
    };
    clientRef.current = client;
    client.connect();
    return () => {
      // P2-SYNC-TEST: if the match started, the RoomClient is now owned by
      // App.js / GameCanvas — don't close it here. Only leave on user VOLVER.
      if (!startedRef.current) {
        client.leave();
      }
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ----------------------------------------------------------- derived state
  const mySlotIndex = room ? clientRef.current?.mySlot : null;
  const amHost = !!room && clientRef.current?.isHost;
  const slots = room?.slots || [];
  const state = room?.state || "lobby";
  const humans = slots.filter((s) => s.type === "human" && s.role !== "GK");
  const humansCount = humans.length;
  const canStart = amHost && humansCount >= 2 && state === "lobby";
  const allReady = humans.length > 0 && humans.every((s) => s.ready !== false ? true : false);
  // Note: backend sets ready:false on join and never flips it automatically;
  // for now we treat "≥2 humans" as ready-to-start.

  const redSlots = slots.filter((s) => s.team === "red");
  const blueSlots = slots.filter((s) => s.team === "blue");

  // ----------------------------------------------------------- actions

  const handlePickSlot = (team, role) => {
    if (!clientRef.current) return;
    if (state === "playing") return;
    uisfx.click();
    clientRef.current.pickSlot(team, role);
  };

  const handleSwitchTeam = () => {
    if (!clientRef.current || !room) return;
    const me = clientRef.current.mySlot;
    if (me == null) return;
    const mySlot = slots[me];
    if (!mySlot) return;
    const oppTeam = mySlot.team === "red" ? "blue" : "red";
    // Find the first AI slot in the opposite team (excluding GK).
    const target = slots.find(
      (s) => s.team === oppTeam && s.role !== "GK" && s.type === "ai"
    );
    if (!target) {
      // No free slot — try to swap with any non-GK human in the opposite team.
      const swapTarget = slots.find(
        (s) => s.team === oppTeam && s.role !== "GK" && s.type === "human" && s !== mySlot
      );
      if (swapTarget) {
        uisfx.pop();
        clientRef.current.pickSlot(oppTeam, swapTarget.role);
      }
      return;
    }
    uisfx.pop();
    clientRef.current.pickSlot(oppTeam, target.role);
  };

  const handleStart = () => {
    if (!clientRef.current || !canStart) return;
    // Safety: only the HOST should be able to start. canStart already
    // checks amHost, but double-check isHost on the RoomClient to prevent
    // any race condition where the UI says host but the client doesn't.
    if (!clientRef.current.isHost) {
      // eslint-disable-next-line no-console
      console.warn("[RoomScreen] handleStart called but client is not host — ignoring");
      return;
    }
    uisfx.pop();
    sfx.whistle?.();
    const seed = Math.floor(Math.random() * 0xffffffff);
    const config = {
      mode: room.mode,
      rules: room.rules,
      hostSlot: clientRef.current.mySlot,
      // Pass along the player's appearance so the host engine can spawn
      // remote human players with the right look.
      profile,
    };
    // P2-SYNC-TEST: mark started BEFORE calling client.start() so the
    // useEffect cleanup doesn't call leave() when App switches us out.
    startedRef.current = true;
    clientRef.current.start(seed, config);
    // Host's onStart also receives the RoomClient — App passes it to
    // GameCanvas with isHost=true so HostSync can broadcast state + apply
    // remote inputs.
    onStart?.({ seed, config, room, client: clientRef.current });
  };

  const handleBack = () => {
    if (!clientRef.current) return;
    uisfx.click();
    clientRef.current.leave();
    onBack?.();
  };

  const handleChangeMode = (newMode) => {
    if (!amHost) return;
    if (newMode === room.mode) return;
    uisfx.click();
    onChangeMode?.(newMode);
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(fmtCode(code));
      setCopied(true);
      uisfx.pop();
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      // Fallback for browsers without clipboard API.
      const ta = document.createElement("textarea");
      ta.value = fmtCode(code);
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); } catch (_) {}
      document.body.removeChild(ta);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const copyLink = async () => {
    const link = buildShareLink(code);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      uisfx.pop();
      setTimeout(() => setCopiedLink(false), 1800);
    } catch (e) {
      /* no-op */
    }
  };

  // ----------------------------------------------------------- slot rendering

  const SlotCard = ({ slot, idx }) => {
    const isHuman = slot.type === "human";
    const isMe = idx === mySlotIndex;
    const isHostSlot = idx === room?.host;
    const role = ROLE_META[slot.role] || { label: slot.role };
    const teamMeta = TEAM_META[slot.team] || TEAM_META.red;
    const clickable = !isHuman && slot.role !== "GK" && state === "lobby";
    return (
      <button
        data-testid={`room-slot-${slot.team}-${slot.role}`}
        onClick={() => clickable && handlePickSlot(slot.team, slot.role)}
        disabled={!clickable}
        className={`relative w-full flex items-center gap-2.5 sm:gap-3 px-3 py-2.5 rounded-xl border transition-all overflow-hidden text-left ${
          isMe
            ? "border-[#ffd21c] bg-[#16295a]/80 shadow-[0_0_22px_rgba(255,210,28,0.30)]"
            : isHuman
            ? "border-white/20 bg-[#0a1330]/80"
            : "border-white/8 bg-[#070e26]/60 hover:border-white/25"
        } ${clickable ? "cursor-pointer hover:-translate-y-[2px] active:scale-[0.985]" : "cursor-default"}`}
      >
        {/* Team color rail */}
        <span
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[4px]"
          style={{ background: teamMeta.color, boxShadow: `0 0 10px ${teamMeta.glow}` }}
        />
        {/* Role chip */}
        <span
          className="display-font grid place-items-center w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-lg text-[12px] tracking-[0.04em]"
          style={{
            background: isHuman ? teamMeta.color : "rgba(255,255,255,0.06)",
            color: isHuman ? "#fff" : "rgba(255,255,255,0.6)",
            boxShadow: isHuman ? `inset 0 -3px 0 rgba(0,0,0,0.32), 0 0 12px ${teamMeta.glow}` : "inset 0 -3px 0 rgba(0,0,0,0.32)",
          }}
        >
          {role.label}
        </span>
        {/* Name + level */}
        <span className="min-w-0 flex-1 flex flex-col leading-none gap-1.5">
          <span
            className={`display-font uppercase truncate text-sm sm:text-base tracking-[0.06em] ${
              isHuman ? "text-white" : "text-white/55"
            }`}
          >
            {isHuman ? slot.name : "BOT"}
          </span>
          <span className="display-font text-[11px] tracking-[0.14em] uppercase text-white/50">
            {isHuman ? `NIVEL ${slot.level || 1}` : "IA"}
          </span>
        </span>
        {/* Right-side badges */}
        <span className="flex items-center gap-1.5 shrink-0">
          {isHostSlot && (
            <span
              title="Host"
              className="grid place-items-center w-6 h-6 rounded-md bg-[#ffd21c]/15 border border-[#ffd21c]/40 text-[#ffd21c]"
            >
              <Crown size={13} strokeWidth={2.6} />
            </span>
          )}
          {isMe && (
            <span className="display-font text-[9px] tracking-[0.16em] uppercase text-[#ffd21c] px-1.5 py-0.5 rounded-md bg-[#ffd21c]/12 border border-[#ffd21c]/30">
              TÚ
            </span>
          )}
          {!isHuman && slot.role !== "GK" && (
            <span className="grid place-items-center w-6 h-6 rounded-md bg-white/[0.05] border border-white/10 text-white/40">
              <Bot size={12} strokeWidth={2.4} />
            </span>
          )}
        </span>
      </button>
    );
  };

  const TeamColumn = ({ team }) => {
    const meta = TEAM_META[team];
    const list = team === "red" ? redSlots : blueSlots;
    return (
      <div
        data-testid={`room-team-${team}`}
        className="relative flex-1 min-w-0 rounded-2xl border border-white/[0.10] bg-[#070e26]/70 backdrop-blur-md overflow-hidden"
        style={{ boxShadow: "0 18px 44px -22px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" }}
      >
        <span
          aria-hidden
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }}
        />
        <div
          className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.08]"
          style={{ background: `linear-gradient(180deg, ${meta.color}22, transparent)` }}
        >
          <span
            className="grid place-items-center w-9 h-9 rounded-lg text-white"
            style={{ background: meta.color, boxShadow: `inset 0 -3px 0 rgba(0,0,0,0.32), 0 0 12px ${meta.glow}` }}
          >
            <Users size={18} strokeWidth={2.6} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="display-font uppercase text-white text-base sm:text-lg tracking-[0.10em] leading-none">
              {meta.label}
            </div>
            <div className="display-font text-[10px] tracking-[0.18em] uppercase text-white/45 mt-1">
              {list.filter((s) => s.type === "human" && s.role !== "GK").length} humano
              {list.filter((s) => s.type === "human" && s.role !== "GK").length === 1 ? "" : "s"} ·{" "}
              {list.filter((s) => s.role !== "GK").length} en cancha
            </div>
          </div>
        </div>
        <div className="p-2.5 sm:p-3 flex flex-col gap-2">
          {list.map((slot, i) => {
            const realIdx = slots.indexOf(slot);
            return <SlotCard key={`${slot.team}-${slot.role}-${i}`} slot={slot} idx={realIdx} />;
          })}
        </div>
      </div>
    );
  };

  // ----------------------------------------------------------- big code block

  const codeChars = splitCode(code);

  const codeBlock = (
    <div
      data-testid="room-code-block"
      className="relative rounded-2xl border border-[#ffd21c]/30 bg-[#0a0e1f]/85 backdrop-blur-md overflow-hidden"
      style={{ boxShadow: "0 22px 60px -22px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,210,28,0.18)" }}
    >
      <span
        aria-hidden
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: "linear-gradient(90deg, transparent, #ffd21c, transparent)" }}
      />
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex flex-col items-center gap-3">
        <span className="display-font text-[11px] tracking-[0.28em] uppercase text-white/55">
          Código de sala
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {codeChars.map((ch, i) => (
            <motion.span
              key={i}
              initial={{ y: -10, opacity: 0, rotateX: 35 }}
              animate={{ y: 0, opacity: 1, rotateX: 0 }}
              transition={{ delay: 0.05 * i, type: "spring", stiffness: 280, damping: 22 }}
              className="display-font grid place-items-center w-12 h-14 sm:w-16 sm:h-20 rounded-xl text-3xl sm:text-5xl text-[#ffd21c]"
              style={{
                background: "linear-gradient(160deg, #1a2348, #0a1330)",
                boxShadow:
                  "inset 0 -4px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 22px rgba(255,210,28,0.18)",
                textShadow: "0 0 18px rgba(255,210,28,0.45)",
              }}
            >
              {ch}
            </motion.span>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 mt-1">
          <button
            data-testid="room-copy-code"
            onClick={copyCode}
            className="display-font flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/[0.06] border border-white/12 text-white text-[11px] tracking-[0.18em] uppercase hover:border-[#ffd21c]/60 hover:text-[#ffd21c] transition-all active:scale-95"
          >
            {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} strokeWidth={2.6} />}
            {copied ? "Copiado" : "Copiar código"}
          </button>
          <button
            data-testid="room-copy-link"
            onClick={copyLink}
            className="display-font flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#ffd21c]/12 border border-[#ffd21c]/40 text-[#ffd21c] text-[11px] tracking-[0.18em] uppercase hover:bg-[#ffd21c]/20 transition-all active:scale-95"
          >
            {copiedLink ? <Check size={13} strokeWidth={3} /> : <Copy size={13} strokeWidth={2.6} />}
            {copiedLink ? "Link copiado" : "Copiar link"}
          </button>
        </div>
      </div>
      {/* Connected players strip */}
      <div
        data-testid="room-players-status"
        className="px-4 sm:px-6 py-2.5 border-t border-white/[0.08] flex items-center justify-between gap-2"
        style={{ background: "rgba(0,0,0,0.22)" }}
      >
        <span className="display-font flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase text-white/55">
          <Users size={13} strokeWidth={2.6} className="text-[#8ab6ff]" />
          {humansCount} jugador{humansCount === 1 ? "" : "es"} conectado{humansCount === 1 ? "" : "s"}
        </span>
        <span
          className={`display-font text-[11px] tracking-[0.18em] uppercase ${
            humansCount >= 2 ? "text-[#20d47a]" : "text-[#ffd21c]/85"
          }`}
        >
          {humansCount >= 2 ? "TODOS LISTOS" : "ESPERANDO JUGADORES…"}
        </span>
      </div>
    </div>
  );

  // ----------------------------------------------------------- mode selector
  const modeSelector = (
    <div
      data-testid="room-mode-selector"
      className="flex flex-col gap-2"
    >
      <div className="display-font text-[10px] tracking-[0.22em] uppercase text-white/55">
        Modo{amHost ? "" : " · solo el host puede cambiar"}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {["2v2", "3v3", "4v4"].map((m) => {
          const active = (room?.mode || mode) === m;
          const disabled = !amHost || state === "playing";
          return (
            <button
              key={m}
              data-testid={`room-mode-${m}`}
              onClick={() => handleChangeMode(m)}
              disabled={disabled}
              className={`display-font px-2 py-2 rounded-lg border-2 text-sm tracking-wider transition-all ${
                active
                  ? "bg-[#ffd21c] border-[#ffd21c] text-[#101a33] shadow-[0_3px_0_#b87400]"
                  : "bg-[#101a33]/70 border-white/15 text-white hover:border-white/40"
              } ${disabled && !active ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ----------------------------------------------------------- header
  const header = (
    <div className="shrink-0 flex items-center gap-3 sm:gap-4 px-4 sm:px-8 xl:px-12 pt-5 sm:pt-7 pb-3 sm:pb-4">
      <button
        data-testid="room-back"
        onClick={handleBack}
        aria-label="Volver al vestíbulo"
        className="grid place-items-center w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-[#08122c]/70 border border-white/12 text-white transition-all hover:border-[#ffd21c] hover:-translate-y-0.5 active:scale-95"
      >
        <ArrowLeft size={22} strokeWidth={3} />
      </button>
      <div className="min-w-0 flex-1">
        <h1
          className="display-font uppercase leading-[0.88] text-white text-2xl sm:text-3xl xl:text-4xl tracking-[0.005em]"
          style={{
            textShadow:
              "0 3px 0 rgba(0,0,0,0.5), 0 8px 0 rgba(0,0,0,0.25), 0 0 46px rgba(90,150,255,0.42)",
          }}
        >
          SALA <span className="text-[#ffd21c]">{fmtCode(code)}</span>
        </h1>
        <p className="mt-1.5 text-white/55 text-[11px] sm:text-sm tracking-[0.16em] uppercase truncate flex items-center gap-2">
          {amHost ? (
            <>
              <Crown size={12} className="text-[#ffd21c]" strokeWidth={2.6} /> HOST
            </>
          ) : (
            <>
              <Users size={12} className="text-[#8ab6ff]" strokeWidth={2.6} /> EN ESPERA
            </>
          )}
        </p>
      </div>
      {/* Connection indicator */}
      <div
        data-testid="room-conn-status"
        className={`display-font flex items-center gap-2 px-3 py-2 rounded-xl border text-[10px] tracking-[0.18em] uppercase ${
          conn === "open"
            ? "border-[#20d47a]/40 bg-[#20d47a]/10 text-[#20d47a]"
            : conn === "reconnecting" || conn === "connecting"
            ? "border-[#ffd21c]/40 bg-[#ffd21c]/10 text-[#ffd21c]"
            : "border-[#ff2d3c]/40 bg-[#ff2d3c]/10 text-[#ff8a8a]"
        }`}
      >
        {conn === "open" ? (
          <span className="w-2 h-2 rounded-full bg-[#20d47a] shadow-[0_0_10px_#20d47a]" />
        ) : conn === "reconnecting" ? (
          <Loader2 size={12} className="animate-spin" strokeWidth={3} />
        ) : conn === "connecting" ? (
          <Loader2 size={12} className="animate-spin" strokeWidth={3} />
        ) : (
          <WifiOff size={12} strokeWidth={3} />
        )}
        <span>
          {conn === "open"
            ? "CONECTADO"
            : conn === "reconnecting"
            ? "RECONNECTANDO…"
            : conn === "connecting"
            ? "CONECTANDO…"
            : "DESCONECTADO"}
        </span>
      </div>
      <SoundToggle className="shrink-0" />
    </div>
  );

  // ----------------------------------------------------------- CTA bar
  const ctaBar = (
    <div className="shrink-0 px-4 sm:px-8 xl:px-12 pb-5 sm:pb-6 pt-2">
      <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <button
          data-testid="room-switch-team"
          onClick={handleSwitchTeam}
          disabled={state === "playing"}
          className="display-font flex items-center justify-center gap-2 h-12 px-5 rounded-xl bg-[#0a1330] border-2 border-white/15 text-white text-[12px] tracking-[0.18em] uppercase hover:border-[#2f74ff] hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={15} strokeWidth={2.6} /> Cambiar equipo
        </button>
        <div className="flex-1 hidden sm:block" />
        {amHost ? (
          <motion.button
            data-testid="room-start"
            onClick={handleStart}
            disabled={!canStart}
            whileHover={canStart ? { y: -2 } : undefined}
            whileTap={canStart ? { scale: 0.985 } : undefined}
            className={`display-font relative flex items-center justify-center gap-3 h-12 sm:h-14 px-7 sm:px-10 rounded-xl border-b-[4px] text-[18px] sm:text-[20px] uppercase tracking-[0.04em] overflow-hidden transition-opacity ${
              canStart
                ? "text-[#3a2500] border-[#b06f00] opacity-100"
                : "text-[#3a2500]/70 border-[#7c5b1c] opacity-60 cursor-not-allowed"
            }`}
            style={{
              background: canStart
                ? "linear-gradient(180deg,#ffdf62,#ffab00)"
                : "linear-gradient(180deg,#c9b46b,#8f7530)",
              animation: canStart ? "softPulse 2.6s ease-in-out infinite" : "none",
            }}
          >
            {canStart && (
              <span
                className="absolute top-0 bottom-0 w-16 bg-white/30 pointer-events-none"
                style={{ animation: "sheen 3.4s linear infinite" }}
              />
            )}
            <Play size={20} strokeWidth={3} className="relative" />
            <span className="relative">¡Arrancar!</span>
          </motion.button>
        ) : (
          <div
            data-testid="room-wait-host"
            className="display-font flex items-center gap-2 h-12 sm:h-14 px-6 rounded-xl bg-[#0a1330]/80 border border-white/12 text-white/55 text-[12px] tracking-[0.18em] uppercase"
          >
            <Loader2 size={14} className="animate-spin text-[#ffd21c]" strokeWidth={3} />
            Esperá al host
          </div>
        )}
      </div>
      {!amHost && (
        <p className="display-font mt-2 text-center text-[10px] tracking-[0.20em] uppercase text-white/40">
          El host arranca el partido cuando haya 2+ jugadores
        </p>
      )}
      {amHost && !canStart && (
        <p className="display-font mt-2 text-center text-[10px] tracking-[0.20em] uppercase text-[#ffd21c]/80">
          Necesitás al menos 2 jugadores humanos para arrancar
        </p>
      )}
    </div>
  );

  // ----------------------------------------------------------- reconnect overlay
  const showReconnect = conn === "reconnecting" || conn === "error";

  return (
    <div
      data-testid="room-screen"
      className="room-root absolute inset-0 overflow-hidden vox-noise"
      style={{
        background:
          "radial-gradient(circle at 50% 25%, #12387f 0%, #0a1c49 38%, #050b20 72%, #03060f 100%)",
      }}
    >
      <div className="absolute inset-0 vox-grid opacity-40" />

      <div className="relative z-10 h-full w-full flex flex-col">
        {header}

        <div className="flex-1 min-h-0 overflow-y-auto flow-scroll px-4 sm:px-8 xl:px-12 pb-3">
          <div className="max-w-[1200px] mx-auto grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
            {/* Left: code + mode + status */}
            <div className="flex flex-col gap-4">
              {codeBlock}
              {modeSelector}
              {errMsg && (
                <div
                  data-testid="room-error"
                  className="display-font flex items-start gap-2 px-3 py-2.5 rounded-xl border border-[#ff2d3c]/50 bg-[#ff2d3c]/10 text-[#ff8a8a] text-[11px] tracking-[0.10em]"
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" strokeWidth={2.6} />
                  <span>{errMsg}</span>
                </div>
              )}
            </div>

            {/* Right: two team columns */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <TeamColumn team="red" />
              <TeamColumn team="blue" />
            </div>
          </div>
        </div>

        {ctaBar}
      </div>

      {/* ---------- Reconnecting overlay ---------- */}
      <AnimatePresence>
        {showReconnect && (
          <motion.div
            key="reconnect-overlay"
            data-testid="room-reconnect-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 z-40 grid place-items-center px-4"
            style={{ background: "rgba(3,6,15,0.78)", backdropFilter: "blur(8px)" }}
          >
            <div className="flex flex-col items-center gap-4 text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                className="grid place-items-center w-16 h-16 rounded-2xl border-2 border-[#ffd21c]/40 bg-[#ffd21c]/10"
              >
                <RefreshCw size={28} className="text-[#ffd21c]" strokeWidth={2.6} />
              </motion.div>
              <div className="display-font text-xl sm:text-2xl tracking-[0.18em] uppercase text-white">
                {conn === "error" ? "CONEXIÓN PERDIDA" : "RECONNECTANDO…"}
              </div>
              <p className="display-font text-[11px] tracking-[0.18em] uppercase text-white/55 max-w-[320px]">
                {conn === "error"
                  ? "No pudimos reconectar a la sala. Volvé al vestíbulo e intentá de nuevo."
                  : "La conexión se cayó. Estamos reconectando…"}
              </p>
              {conn === "error" && (
                <button
                  data-testid="room-error-back"
                  onClick={handleBack}
                  className="display-font flex items-center gap-2 h-11 px-5 rounded-xl bg-[#ffd21c] text-[#3a2500] text-[12px] tracking-[0.18em] uppercase hover:-translate-y-0.5 active:scale-95 transition-all"
                >
                  <ArrowLeft size={15} strokeWidth={3} /> Volver al vestíbulo
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RoomScreen;
