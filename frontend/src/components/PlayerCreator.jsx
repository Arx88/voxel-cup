import { useEffect, useMemo, useRef, useState, Children } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Dices,
  Eye,
  Palette,
  Pipette,
  Shirt,
  Smile,
  Sparkles,
  PartyPopper,
  Scissors,
  Wand2,
  GripHorizontal,
} from "lucide-react";
import { AvatarPreview, renderHairThumbs, disposeHairThumbs } from "@/game/avatarPreview";
import {
  HAIR_COLORS,
  SKIN_PRESETS,
  EYE_COLORS,
  FACES,
  ACCESSORIES,
  ACC_COLORS,
  NUMBERS,
  loadProfile,
  saveProfile,
  randomName,
} from "@/game/appearance";
import { KITS, DEFAULT_KIT_ID, getKit } from "@/game/kits";
import { uisfx } from "@/game/uisfx";
import { sfx } from "@/game/audio";
import { SoundToggle } from "./SoundToggle";
import { CREATOR } from "@/constants/testIds";

/* ---------- animación de entrada de cada grilla ---------- */
const gridV = { hidden: {}, show: { transition: { staggerChildren: 0.014 } } };
const itemV = {
  hidden: { opacity: 0, y: 10, scale: 0.85 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 26 } },
};

const CheckBadge = () => (
  <span
    className="absolute -top-1.5 -right-1.5 z-10 grid place-items-center w-[18px] h-[18px] rounded-full bg-[#ffd21c] text-[#1a1200] shadow-[0_2px_8px_rgba(0,0,0,0.55)]"
    style={{ animation: "checkPop 260ms cubic-bezier(0.2,1.7,0.35,1)" }}
  >
    <Check size={12} strokeWidth={4} />
  </span>
);

/* ---------- piezas atómicas ---------- */

const Swatch = ({ color, selected, onClick, testId, label, glow, rare, round }) => (
  <button
    data-testid={testId}
    data-label={label}
    onClick={onClick}
    aria-label={label || color}
    className={`tip relative shrink-0 w-11 h-11 sm:w-12 sm:h-12 ${
      round ? "rounded-full" : "rounded-xl"
    } transition-transform duration-150 hover:-translate-y-[3px] hover:scale-105 active:scale-95 ${
      selected ? "sel-pop" : ""
    }`}
    style={{
      background: round
        ? `radial-gradient(circle at 34% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 26%, transparent 30%), ${color}`
        : color,
      boxShadow: selected
        ? "0 0 0 3px #ffd21c, 0 0 22px rgba(255,210,28,0.5)"
        : glow
        ? `inset 0 -6px 0 rgba(0,0,0,0.22), 0 0 14px ${color}55`
        : "inset 0 -6px 0 rgba(0,0,0,0.22)",
    }}
  >
    {rare && (
      <span className="absolute -top-1.5 -left-1.5 grid place-items-center w-[17px] h-[17px] rounded-full bg-[#0a1430] border border-[#ffd21c]/70 text-[#ffd21c]">
        <Sparkles size={9} strokeWidth={3} />
      </span>
    )}
    {selected && <CheckBadge />}
  </button>
);

const OptionPill = ({ label, sub, selected, onClick, testId }) => (
  <button
    data-testid={testId}
    onClick={onClick}
    className={`display-font relative shrink-0 flex flex-col items-center justify-center min-w-[80px] px-4 rounded-xl border-2 uppercase transition-all duration-150 hover:-translate-y-[3px] active:scale-95 ${
      sub ? "h-[58px]" : "h-11 sm:h-12"
    } ${
      selected
        ? "border-[#ffd21c] bg-[#16295a] text-white sel-pop"
        : "border-white/10 bg-[#0a1330] text-white/60 hover:text-white hover:border-white/30"
    }`}
    style={selected ? { boxShadow: "0 0 20px rgba(255,210,28,0.3)" } : undefined}
  >
    <span className="tracking-[0.12em] text-[12px] leading-none">{label}</span>
    {sub && (
      <span
        className={`mt-1 tracking-[0.16em] text-[9px] leading-none ${
          selected ? "text-[#ffd21c]" : "text-white/35"
        }`}
      >
        {sub}
      </span>
    )}
    {selected && <CheckBadge />}
  </button>
);

const NumberTile = ({ n, selected, onClick, testId }) => (
  <button
    data-testid={testId}
    onClick={onClick}
    className={`display-font relative shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl border-2 text-lg transition-all duration-150 hover:-translate-y-[3px] active:scale-95 ${
      selected
        ? "border-[#ffd21c] bg-[#16295a] text-[#ffd21c] sel-pop"
        : "border-white/10 bg-[#0a1330] text-white/60 hover:text-white hover:border-white/30"
    }`}
    style={selected ? { boxShadow: "0 0 20px rgba(255,210,28,0.3)" } : undefined}
  >
    {n}
    {selected && <CheckBadge />}
  </button>
);

const ThumbButton = ({ url, label, selected, onClick, testId }) => (
  <button
    data-testid={testId}
    data-label={label}
    onClick={onClick}
    className={`tip relative shrink-0 w-[64px] h-[64px] rounded-xl grid place-items-center bg-[#0a1330] border-2 transition-all duration-150 hover:-translate-y-[3px] hover:scale-105 active:scale-95 ${
      selected ? "border-[#ffd21c] sel-pop" : "border-white/10 hover:border-white/25"
    }`}
    style={selected ? { boxShadow: "0 0 20px rgba(255,210,28,0.38)" } : undefined}
  >
    <img src={url} alt={label} className="w-[54px] h-[54px]" draggable={false} />
    {selected && <CheckBadge />}
  </button>
);

const KitPattern = ({ kit }) => {
  const acc = kit.alt;
  const p = kit.pattern;
  return (
    <>
      {p === "stripesV" && (
        <div className="absolute inset-0 flex">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1" style={{ background: i % 2 ? acc : "transparent" }} />
          ))}
        </div>
      )}
      {p === "hoops" && (
        <div className="absolute inset-0 flex flex-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1" style={{ background: i % 2 ? acc : "transparent" }} />
          ))}
        </div>
      )}
      {p === "bandH" && (
        <div className="absolute left-0 right-0" style={{ top: "40%", height: "22%", background: acc }} />
      )}
      {p === "sash" && (
        <div
          className="absolute"
          style={{
            left: "-14%",
            right: "-14%",
            top: "40%",
            height: "20%",
            background: acc,
            transform: "rotate(-34deg)",
          }}
        />
      )}
    </>
  );
};

const isLight = (hex) => {
  const h = hex.replace("#", "");
  return (
    parseInt(h.slice(0, 2), 16) * 0.3 + parseInt(h.slice(2, 4), 16) * 0.59 + parseInt(h.slice(4, 6), 16) * 0.11 > 165
  );
};

const KitCard = ({ kit, number, selected, onClick, testId }) => (
  <button
    data-testid={testId}
    data-label={kit.label}
    onClick={onClick}
    className={`tip relative shrink-0 w-[84px] rounded-xl border-2 overflow-hidden transition-all duration-150 hover:-translate-y-[3px] active:scale-95 ${
      selected ? "border-[#ffd21c] sel-pop" : "border-white/10 hover:border-white/30"
    }`}
    style={selected ? { boxShadow: "0 0 22px rgba(255,210,28,0.42)" } : undefined}
  >
    <div className="relative h-[54px]" style={{ background: kit.shirt }}>
      <KitPattern kit={kit} />
      <span
        className={`absolute inset-0 grid place-items-center display-font text-[17px] ${
          isLight(kit.shirt) ? "text-[#10182e]" : "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
        }`}
      >
        {number}
      </span>
    </div>
    <div className="h-[12px]" style={{ background: kit.shorts }} />
    <div className="h-[6px]" style={{ background: kit.socks }} />
    <div className="display-font h-[18px] grid place-items-center text-[9px] tracking-[0.12em] uppercase bg-[#050c1c] text-white/70">
      {kit.short}
    </div>
    {selected && <CheckBadge />}
  </button>
);

const ColorPicker = ({ value, onChange, active, icon, testId, title }) => (
  <label
    data-label={title}
    className={`tip relative shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl cursor-pointer grid place-items-center border-2 border-dashed transition-all duration-150 hover:-translate-y-[3px] ${
      active ? "border-[#ffd21c] sel-pop" : "border-white/25 hover:border-white/50"
    }`}
    style={{ background: active ? value : "rgba(255,255,255,0.04)" }}
  >
    {icon}
    {active && <CheckBadge />}
    <input
      data-testid={testId}
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    />
  </label>
);

const Section = ({ title, count, value, valueSwatch, hint, children }) => (
  <div className="mb-8 last:mb-2">
    <div className="flex items-center gap-3 mb-4">
      <span className="display-font text-sm tracking-[0.24em] text-white/70 uppercase">{title}</span>
      <span className="display-font grid place-items-center h-[20px] min-w-[24px] px-1.5 rounded-md bg-white/[0.08] text-white/70 text-[11px] tracking-[0.06em]">
        {count}
      </span>
      <span className="flex-1 h-px bg-gradient-to-r from-white/12 to-transparent" />
      {valueSwatch && (
        <span
          className="w-4 h-4 rounded-[5px] shrink-0"
          style={{ background: valueSwatch, boxShadow: `0 0 8px ${valueSwatch}88` }}
        />
      )}
      {value && (
        <span className="display-font text-sm tracking-[0.16em] text-[#ffd21c] uppercase truncate max-w-[170px]">
          {value}
        </span>
      )}
    </div>
    {hint && (
      <p className="display-font -mt-2 mb-4 text-[11px] tracking-[0.16em] text-white/35 uppercase">
        {hint}
      </p>
    )}
    <motion.div variants={gridV} initial="hidden" animate="show" className="flex flex-wrap gap-3">
      {Children.map(children, (c) => (
        <motion.div variants={itemV}>{c}</motion.div>
      ))}
    </motion.div>
  </div>
);

const TABS = [
  { id: "skin", label: "Piel", icon: Palette },
  { id: "hair", label: "Peinado", icon: Scissors },
  { id: "face", label: "Cara", icon: Smile },
  { id: "acc", label: "Extras", icon: Sparkles },
  { id: "kit", label: "Camiseta", icon: Shirt },
];

const TabChip = ({ id, label, Icon, active, onClick }) => (
  <button
    data-testid={CREATOR.tab(id)}
    onClick={onClick}
    className={`display-font relative shrink-0 flex items-center gap-2 h-12 px-3.5 sm:px-4 rounded-t-xl uppercase tracking-[0.14em] text-[12px] sm:text-[13px] transition-colors ${
      active ? "text-[#ffd21c] bg-white/[0.04]" : "text-white/45 hover:text-white/85 hover:bg-white/[0.03]"
    }`}
  >
    <Icon size={16} strokeWidth={2.8} className="shrink-0" />
    <span className="whitespace-nowrap">{label}</span>
    {active && (
      <motion.span
        layoutId="creator-tab-underline"
        className="absolute left-2.5 right-2.5 bottom-0 h-[3px] rounded-full bg-[#ffd21c]"
        style={{ boxShadow: "0 0 14px rgba(255,210,28,0.85)" }}
      />
    )}
  </button>
);

const BODY_SUBS = { normal: "EQUILIBRADO", slim: "ÁGIL", tank: "FUERTE", tall: "AÉREO", short: "ESCURRIDIZO" };
void BODY_SUBS;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ---------- modo de layout ---------- */

const readMode = () => {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= 1180) return "desktop";
  if (w < 768 && h < 520) return "landscape";
  if (w < 820) return "mobile";
  return "tablet";
};

const useMode = () => {
  const [mode, setMode] = useState(readMode);
  useEffect(() => {
    const on = () => setMode(readMode());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return mode;
};

/* ---------- pantalla ---------- */

export const PlayerCreator = ({ onPlay, onBack, purpose = "play" }) => {
  const stage = useRef(null);
  const preview = useRef(null);
  const [p, setP] = useState(loadProfile);
  const [rolling, setRolling] = useState(false);
  const [tab, setTab] = useState("skin");
  const [sheetOpen, setSheetOpen] = useState(false);
  // El modo de partido (2v2 / 3v3 / 4v4) se elige exclusivamente desde el
  // Lobby (ModeSelector), persistido en localStorage bajo "voxelcup.mode" y
  // leído por el engine vía getActiveMode(). PlayerCreator no lo toca.
  const mode = useMode();
  const isMobile = mode === "mobile";

  const thumbs = useMemo(() => renderHairThumbs({ skin: p.skin, hairColor: p.hairColor }), [p.skin, p.hairColor]);
  const kit = getKit(p.kitId);
  const skinLabel = SKIN_PRESETS.find((s) => s.color === p.skin)?.label || "CUSTOM";
  const hairLabel = thumbs.find((t) => t.id === p.hairStyle)?.label || "";
  const faceLabel = FACES.find((f) => f.id === p.face)?.label || "";
  const accLabel = ACCESSORIES.find((a) => a.id === p.accessory)?.label || "";

  useEffect(() => {
    // Re-crear el AvatarPreview cuando cambia el modo (mobile/landscape/tablet/desktop)
    // porque cada modo renderiza el viewer en un div diferente. Si no re-creamos,
    // el canvas queda colgado del div anterior (que se desmonta) y desaparece.
    const av = new AvatarPreview(stage.current);
    preview.current = av;
    return () => {
      av.dispose();
      disposeHairThumbs();
    };
  }, [mode]);

  useEffect(() => {
    preview.current?.setProfile(p);
  }, [p]);

  const set = (patch, sound = "ui") => {
    uisfx.click(sound);
    setP((prev) => ({ ...prev, ...patch }));
  };

  const roll = () => {
    if (rolling) return;
    setRolling(true);
    uisfx.dice();
    setTimeout(() => {
      setP((prev) => ({ ...prev, name: randomName(prev.name) }));
      setRolling(false);
    }, 420);
  };

  const surprise = () => {
    uisfx.dice();
    const s = pick(SKIN_PRESETS);
    setP((prev) => ({
      ...prev,
      skin: s.color,
      face: s.face || pick(FACES).id,
      eyeColor: s.eye || pick(EYE_COLORS),
      hairStyle: pick(thumbs).id,
      hairColor: pick(HAIR_COLORS),
      accessory: pick(ACCESSORIES).id,
      accColor: pick(ACC_COLORS),
      number: pick(NUMBERS),
      kitId: pick(KITS).id,
      name: prev.name || randomName(""),
    }));
  };

  const play = () => {
    const final = { ...p, name: (p.name || "").trim() || randomName(""), kitId: p.kitId || DEFAULT_KIT_ID };
    saveProfile(final);
    sfx.whistle();
    onPlay(final);
  };

  const save = () => {
    const final = { ...p, name: (p.name || "").trim() || randomName(""), kitId: p.kitId || DEFAULT_KIT_ID };
    saveProfile(final);
    uisfx.click();
    onBack();
  };

  const numberGrid = (prefix) =>
    NUMBERS.map((n, i) => (
      <NumberTile
        key={n}
        n={n}
        selected={p.number === n}
        testId={`${prefix}${i}`}
        onClick={() => set({ number: n }, "number")}
      />
    ));

  const sections = {
    skin: (
      <>
        <Section
          title="Piel humana"
          count={SKIN_PRESETS.filter((s) => !s.rare).length}
          value={skinLabel}
          valueSwatch={p.skin}
        >
          {SKIN_PRESETS.filter((s) => !s.rare).map((s, i) => (
            <Swatch
              key={s.id}
              color={s.color}
              label={s.label}
              selected={p.skin === s.color}
              testId={CREATOR.skin(i)}
              onClick={() => set({ skin: s.color }, "skin")}
            />
          ))}
        </Section>
        <Section title="Pieles raras" count={SKIN_PRESETS.filter((s) => s.rare).length}>
          {SKIN_PRESETS.filter((s) => s.rare).map((s, i) => (
            <Swatch
              key={s.id}
              color={s.color}
              label={s.label}
              glow
              rare
              selected={p.skin === s.color}
              testId={CREATOR.skin(6 + i)}
              onClick={() => set({ skin: s.color }, "skin")}
            />
          ))}
        </Section>
      </>
    ),
    hair: (
      <>
        <Section title="Estilo" count={thumbs.length} value={hairLabel}>
          {thumbs.map((t, i) => (
            <ThumbButton
              key={t.id}
              url={t.url}
              label={t.label}
              selected={p.hairStyle === t.id}
              testId={CREATOR.hairOption(i)}
              onClick={() => set({ hairStyle: t.id }, "hair")}
            />
          ))}
        </Section>
        <Section
          title="Color de cabello"
          count={HAIR_COLORS.length + 1}
          valueSwatch={p.hairColor}
          value={p.hairColor.toUpperCase()}
        >
          {HAIR_COLORS.map((c, i) => (
            <Swatch
              key={c}
              color={c}
              label={c.toUpperCase()}
              selected={p.hairColor === c}
              testId={CREATOR.hairColor(i)}
              onClick={() => set({ hairColor: c }, "haircolor")}
            />
          ))}
          <ColorPicker
            title="COLOR LIBRE"
            value={p.hairColor}
            active={!HAIR_COLORS.includes(p.hairColor)}
            onChange={(v) => set({ hairColor: v }, "haircolor")}
            testId="creator-haircolor-custom"
            icon={<Pipette size={18} className="text-white/80" strokeWidth={2.6} />}
          />
        </Section>
      </>
    ),
    face: (
      <>
        <Section title="Expresión" count={FACES.length} value={faceLabel}>
          {FACES.map((f, i) => (
            <OptionPill
              key={f.id}
              label={f.label}
              selected={p.face === f.id}
              testId={CREATOR.face(i)}
              onClick={() => set({ face: f.id }, "face")}
            />
          ))}
        </Section>
        <Section
          title="Color de ojos"
          count={EYE_COLORS.length + 1}
          valueSwatch={p.eyeColor}
          value={p.eyeColor.toUpperCase()}
        >
          {EYE_COLORS.map((c, i) => (
            <Swatch
              key={c}
              color={c}
              round
              glow
              label={c.toUpperCase()}
              selected={p.eyeColor === c}
              testId={CREATOR.eye(i)}
              onClick={() => set({ eyeColor: c }, "eye")}
            />
          ))}
          <ColorPicker
            title="OJOS LIBRES"
            value={p.eyeColor}
            active={!EYE_COLORS.includes(p.eyeColor)}
            onChange={(v) => set({ eyeColor: v }, "eye")}
            testId="creator-eye-custom"
            icon={<Eye size={18} className="text-white/80" strokeWidth={2.6} />}
          />
        </Section>
      </>
    ),
    acc: (
      <>
        <Section title="Accesorio" count={ACCESSORIES.length} value={accLabel}>
          {ACCESSORIES.map((a, i) => (
            <OptionPill
              key={a.id}
              label={a.label}
              selected={p.accessory === a.id}
              testId={CREATOR.accessory(i)}
              onClick={() => set({ accessory: a.id }, "ui")}
            />
          ))}
        </Section>
        <Section title="Color del accesorio" count={ACC_COLORS.length + 1} valueSwatch={p.accColor}>
          {ACC_COLORS.map((c, i) => (
            <Swatch
              key={c}
              color={c}
              label={c.toUpperCase()}
              selected={p.accColor === c}
              testId={CREATOR.accColor(i)}
              onClick={() => set({ accColor: c }, "ui")}
            />
          ))}
          <ColorPicker
            title="COLOR LIBRE"
            value={p.accColor}
            active={!ACC_COLORS.includes(p.accColor)}
            onChange={(v) => set({ accColor: v }, "ui")}
            testId="creator-acccolor-custom"
            icon={<Pipette size={18} className="text-white/80" strokeWidth={2.6} />}
          />
        </Section>
      </>
    ),
    kit: (
      <>
        <Section title="Equipación" count={KITS.length} value={kit.label} valueSwatch={kit.shirt}>
          {KITS.map((k, i) => (
            <KitCard
              key={k.id}
              kit={k}
              number={p.number}
              selected={(p.kitId || DEFAULT_KIT_ID) === k.id}
              testId={CREATOR.kit(i)}
              onClick={() => set({ kitId: k.id }, "shirt")}
            />
          ))}
        </Section>
        <Section
          title="Número dorsal"
          count={NUMBERS.length}
          value={`#${p.number}`}
          hint="Se imprime en la espalda y en la ficha"
        >
          {numberGrid("creator-number-")}
        </Section>
      </>
    ),
  }[tab];

  /* ---------- bloques ---------- */

  const [hintVisible, setHintVisible] = useState(true);

  const viewer = (
    <div
      data-testid="creator-viewer"
      className="relative w-full h-full min-h-0 overflow-hidden rounded-[22px] md:rounded-[26px] border border-white/[0.10] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(150,190,255,0.15)]"
      style={{ background: "#030918" }}
      onPointerDown={() => setHintVisible(false)}
    >
      <div
        className="creator-stage-bg"
        aria-hidden
        style={{ backgroundImage: `url(${process.env.PUBLIC_URL || ""}/stadium-scene.png)` }}
      />
      <div className="creator-stage-atmo" aria-hidden />
      <div
        data-testid={CREATOR.stage}
        ref={stage}
        className="absolute inset-0 z-[2] cursor-grab active:cursor-grabbing"
      />
      <div className="creator-vignette absolute inset-0 pointer-events-none z-[3]" />

      {/* Único hint de rotación, bajo el pedestal, se desvanece tras interactuar */}
      <AnimatePresence>
        {hintVisible && (
          <motion.div
            key="rotate-hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.25 } }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-6 z-[5] px-4 py-2 rounded-full bg-[#040a18]/70 backdrop-blur-md border border-white/[0.10]"
          >
            <span className="display-font text-sm tracking-[0.24em] text-white/75">
              ARRASTRÁ PARA GIRAR
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const summary = (
    <div
      data-testid="creator-summary"
      className="shrink-0 grid grid-cols-[auto_minmax(0,1fr)] gap-3 items-stretch"
    >
      <button
        data-testid={CREATOR.preview}
        data-label="FESTEJO DE GOL"
        onClick={() => {
          uisfx.pop();
          sfx.crowdRoar?.();
          preview.current?.celebrate();
        }}
        className="tip display-font flex items-center gap-2 h-[60px] px-5 rounded-2xl bg-[#050c1e]/75 backdrop-blur-md border border-white/[0.09] text-white text-sm tracking-[0.20em] transition-all hover:border-[#ffd21c]/70 hover:-translate-y-0.5 active:scale-95"
      >
        <PartyPopper size={18} strokeWidth={2.8} className="text-[#ffd21c]" /> FESTEJO
      </button>
      <div
        data-testid="creator-nameplate"
        className="display-font flex items-center gap-3 h-[60px] pl-3 pr-4 rounded-2xl bg-[#050c1e]/75 backdrop-blur-md border border-white/[0.09] overflow-hidden"
      >
        <span
          className="relative grid place-items-center w-11 h-11 shrink-0 rounded-lg text-lg text-white overflow-hidden"
          style={{ background: kit.shirt, boxShadow: `0 0 16px ${kit.shirt}88` }}
        >
          <KitPattern kit={kit} />
          <span className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{p.number}</span>
        </span>
        <span className="flex flex-col leading-none min-w-0 gap-1.5">
          <span className="text-white/95 text-base sm:text-lg tracking-[0.14em] uppercase truncate">
            {p.name || "SIN NOMBRE"}
          </span>
          <span className="text-[13px] tracking-[0.18em] text-white/50 uppercase truncate">
            {kit.label}
          </span>
        </span>
      </div>
    </div>
  );

  const nameRow = (
    <div className="flex gap-3 shrink-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-2">
          <span className="display-font text-sm tracking-[0.24em] text-white/70">NOMBRE</span>
          <span className="display-font text-xs tracking-[0.16em] text-white/40">
            {(p.name || "").length}/14
          </span>
        </div>
        <input
          data-testid={CREATOR.name}
          value={p.name}
          maxLength={14}
          onChange={(e) => setP((prev) => ({ ...prev, name: e.target.value.toUpperCase() }))}
          placeholder="NOMBRE…"
          className="display-font w-full h-[56px] sm:h-[60px] px-5 rounded-xl bg-[#030918]/85 border-2 border-[#2f74ff]/25 text-white text-lg sm:text-xl tracking-[0.12em] placeholder:text-white/25 outline-none transition-all focus:border-[#ffd21c] focus:shadow-[0_0_26px_rgba(255,210,28,0.22)]"
        />
      </div>
      <motion.button
        data-testid={CREATOR.dice}
        onClick={roll}
        animate={rolling ? { rotate: [0, 180, 360], scale: [1, 1.12, 1] } : { rotate: 0 }}
        transition={{ duration: 0.42 }}
        data-label="NOMBRE AL AZAR"
        className="tip shrink-0 self-end grid place-items-center w-[56px] h-[56px] sm:w-[60px] sm:h-[60px] rounded-xl bg-[#0a1330]/85 border-2 border-white/12 text-white transition-colors hover:border-[#ffd21c] active:scale-95"
      >
        <Dices size={24} strokeWidth={2.6} />
      </motion.button>
      <motion.button
        data-testid="creator-random-button"
        onClick={surprise}
        whileTap={{ scale: 0.92, rotate: -8 }}
        data-label="JUGADOR SORPRESA"
        className="tip shrink-0 self-end grid place-items-center w-[56px] h-[56px] sm:w-[60px] sm:h-[60px] rounded-xl bg-gradient-to-b from-[#4a2f8f] to-[#26165a] border-2 border-[#c56bff]/45 text-[#e6c6ff] transition-all hover:border-[#c56bff] hover:shadow-[0_0_22px_rgba(197,107,255,0.45)] active:scale-95"
      >
        <Wand2 size={24} strokeWidth={2.6} />
      </motion.button>
    </div>
  );

  const optionsCard = (
    <div className="flex-1 min-h-0 rounded-2xl bg-[#030a1c]/75 border border-white/[0.09] overflow-hidden backdrop-blur-md flex flex-col shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
      <div className="overflow-x-auto no-bar border-b border-white/[0.09] bg-black/25 shrink-0">
        <div className="flex px-1">
          {TABS.map((t) => (
            <TabChip
              key={t.id}
              id={t.id}
              label={t.label}
              Icon={t.icon}
              active={tab === t.id}
              onClick={() => {
                uisfx.click();
                setTab(t.id);
              }}
            />
          ))}
        </div>
      </div>
      <div className="relative flex-1 min-h-[220px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.18 }}
            className="panel-scroll absolute inset-0 overflow-y-auto px-4 sm:px-5 py-5"
          >
            {sections}
          </motion.div>
        </AnimatePresence>
        <div className="absolute bottom-0 left-0 right-2 h-7 bg-gradient-to-t from-[#030a1c] to-transparent pointer-events-none" />
      </div>
    </div>
  );

  const nameTrim = (p.name || "").trim();
  const nameValid = nameTrim.length >= 2;

  const isEdit = purpose === "edit";

  const cta = (
    <div className="flex flex-col gap-2 shrink-0">
      <motion.button
        data-testid={isEdit ? "creator-save" : CREATOR.play}
        onClick={isEdit ? save : play}
        disabled={!nameValid}
        whileHover={nameValid ? { y: -3 } : undefined}
        whileTap={nameValid ? { scale: 0.985 } : undefined}
        className={`display-font relative w-full h-[52px] sm:h-[64px] lg:h-[76px] rounded-2xl flex items-center justify-center text-[#3a2500] text-[22px] sm:text-[26px] lg:text-[32px] uppercase overflow-hidden border-b-[4px] sm:border-b-[5px] transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd21c] ${
          nameValid ? "border-[#b06f00] opacity-100" : "border-[#7c5b1c] opacity-60 cursor-not-allowed"
        }`}
        style={{
          background: nameValid
            ? "linear-gradient(180deg,#ffdf62,#ffab00)"
            : "linear-gradient(180deg,#c9b46b,#8f7530)",
          animation: nameValid ? "softPulse 2.6s ease-in-out infinite" : "none",
        }}
      >
        {nameValid && (
          <span
            className="absolute top-0 bottom-0 w-16 bg-white/30 pointer-events-none"
            style={{ animation: "sheen 3.4s linear infinite" }}
          />
        )}
        <span className="relative tracking-[0.02em]">{isEdit ? "GUARDAR" : "¡A JUGAR!"}</span>
        {isEdit ? (
          <span className="absolute right-4 sm:right-6 grid place-items-center w-10 h-10 sm:w-[52px] sm:h-[52px] rounded-full bg-white shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)]">
            <Check size={28} strokeWidth={3.5} className="text-[#3a2500]" />
          </span>
        ) : (
          <span className="absolute right-4 sm:right-6 grid place-items-center w-10 h-10 sm:w-[52px] sm:h-[52px] rounded-full bg-white shadow-[inset_0_-4px_0_rgba(0,0,0,0.18)]">
            <svg viewBox="0 0 32 32" className="w-7 h-7 sm:w-10 sm:h-10">
              <circle cx="16" cy="16" r="15" fill="#ffffff" />
              <polygon points="16,8 21,11.6 19,17.6 13,17.6 11,11.6" fill="#12182b" />
              <path d="M16 1 L16 6" stroke="#12182b" strokeWidth="1.6" />
              <path d="M2.4 12 L9.6 13.6" stroke="#12182b" strokeWidth="1.6" />
              <path d="M29.6 12 L22.4 13.6" stroke="#12182b" strokeWidth="1.6" />
              <path d="M7 27 L11.4 20.4" stroke="#12182b" strokeWidth="1.6" />
              <path d="M25 27 L20.6 20.4" stroke="#12182b" strokeWidth="1.6" />
              <circle cx="16" cy="16" r="15" fill="none" stroke="#12182b" strokeWidth="1.6" />
            </svg>
          </span>
        )}
      </motion.button>
      {!nameValid && (
        <span
          data-testid="creator-cta-hint"
          className="display-font text-sm tracking-[0.18em] text-[#ffd21c]/85 text-center"
        >
          {isEdit ? "Poné un nombre (mínimo 2 letras) para guardar" : "Poné un nombre (mínimo 2 letras) para empezar"}
        </span>
      )}
    </div>
  );

  const header = (
    <div className="shrink-0 flex items-center gap-4 sm:gap-5 px-4 sm:px-8 xl:px-12 pt-6 sm:pt-10 pb-4 sm:pb-6">
      <button
        data-testid={CREATOR.back}
        onClick={() => {
          uisfx.click();
          onBack();
        }}
        aria-label="Volver"
        className="grid place-items-center w-12 h-12 sm:w-[56px] sm:h-[56px] shrink-0 rounded-2xl bg-[#08122c]/70 border border-white/12 text-white transition-all hover:border-[#ffd21c] hover:-translate-y-0.5 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffd21c]"
      >
        <ArrowLeft size={24} strokeWidth={3} />
      </button>
      <div className="min-w-0">
        <h1
          className="display-font uppercase leading-[0.88] text-white text-4xl sm:text-5xl xl:text-6xl tracking-[0.005em]"
          style={{
            textShadow:
              "0 3px 0 rgba(0,0,0,0.5), 0 8px 0 rgba(0,0,0,0.25), 0 0 46px rgba(90,150,255,0.42)",
          }}
        >
          CREÁ TU{" "}
          <span
            className="text-[#ffd21c]"
            style={{
              textShadow:
                "0 3px 0 rgba(90,48,0,0.7), 0 8px 0 rgba(0,0,0,0.32), 0 0 38px rgba(255,195,20,0.65)",
            }}
          >
            JUGADOR
          </span>
        </h1>
        <p className="mt-3 text-white/60 text-sm sm:text-base tracking-[0.14em] uppercase truncate">
          {isEdit ? "Editá tu personaje y guardá los cambios" : "Personalizá cada detalle antes de saltar a la cancha"}
        </p>
      </div>
      <SoundToggle className="ml-auto shrink-0" />
    </div>
  );

  /* ---------- móvil: visor fijo + bottom sheet ---------- */

  if (isMobile) {
    return (
      <div
        data-testid={CREATOR.root}
        className="creator-root absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#020610] via-[#020610cc] to-transparent">
          {header}
        </div>
        <div className="absolute inset-x-3 top-0 h-[52svh] pt-[104px] pb-2">{viewer}</div>

        <motion.div
          data-testid="creator-sheet"
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[26px] bg-[#030a1c]/95 backdrop-blur-xl border-t border-white/12 shadow-[0_-24px_60px_rgba(0,0,0,0.6)]"
          animate={{ height: sheetOpen ? "84svh" : "50svh" }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.12}
          onDragEnd={(e, info) => {
            if (info.offset.y < -40 || info.velocity.y < -320) setSheetOpen(true);
            else if (info.offset.y > 40 || info.velocity.y > 320) setSheetOpen(false);
          }}
        >
          <button
            data-testid="creator-sheet-handle"
            onClick={() => setSheetOpen((v) => !v)}
            className="shrink-0 w-full grid place-items-center pt-2.5 pb-1 text-white/30 hover:text-white/60 transition-colors"
            aria-label="Expandir panel"
          >
            <GripHorizontal size={26} strokeWidth={2.4} />
          </button>
          <div className="px-3 pb-2 shrink-0">{summary}</div>
          <div className="px-3 pb-2 shrink-0">{nameRow}</div>
          <div className="flex-1 min-h-0 px-3 pb-2 flex flex-col">{optionsCard}</div>
          <div className="shrink-0 px-3 pt-1 pb-[max(12px,env(safe-area-inset-bottom))]">{cta}</div>
        </motion.div>
      </div>
    );
  }

  /* ---------- landscape móvil comprimido ---------- */

  if (mode === "landscape") {
    return (
      <div data-testid={CREATOR.root} className="creator-root absolute inset-0 flex overflow-hidden">
        <div className="relative w-[38%] min-w-[220px] p-2.5 pl-3">{viewer}</div>
        <div className="flex-1 min-w-0 flex flex-col gap-2 py-2.5 pr-3">
          <div className="flex items-center gap-3">
            <button
              data-testid={CREATOR.back}
              onClick={() => {
                uisfx.click();
                onBack();
              }}
              aria-label="Volver"
              className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-[#08122c]/70 border border-white/12 text-white active:scale-95"
            >
              <ArrowLeft size={22} strokeWidth={3} />
            </button>
            <h1 className="display-font uppercase text-white text-[20px] leading-none">
              CREA TU <span className="text-[#ffd21c]">JUGADOR</span>
            </h1>
            <SoundToggle className="ml-auto" />
          </div>
          {nameRow}
          <div className="flex-1 min-h-0 flex flex-col">{optionsCard}</div>
          {cta}
        </div>
      </div>
    );
  }

  /* ---------- tablet ---------- */

  if (mode === "tablet") {
    return (
      <div data-testid={CREATOR.root} className="creator-root absolute inset-0 flex flex-col overflow-hidden">
        {header}
        <div className="flex-1 min-h-0 flex flex-col gap-3 px-4 sm:px-8 pb-4">
          <div className="h-[38vh] min-h-[280px] shrink-0">{viewer}</div>
          {summary}
          {nameRow}
          <div className="flex-1 min-h-[220px] flex flex-col">{optionsCard}</div>
          {cta}
        </div>
      </div>
    );
  }

  /* ---------- desktop ---------- */

  return (
    <div data-testid={CREATOR.root} className="creator-root absolute inset-0 flex flex-col overflow-hidden">
      {header}
      <div className="flex-1 min-h-0 w-full mx-auto max-w-[1680px] px-4 lg:px-10 xl:px-14 pb-8 lg:pb-10 grid gap-6 lg:gap-8 xl:gap-10 grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
        <div className="flex flex-col gap-4 min-h-0 min-w-0">
          <div className="flex-1 min-h-[420px]">{viewer}</div>
          {summary}
        </div>
        <div className="flex flex-col gap-4 min-h-0 min-w-0">
          {nameRow}
          {optionsCard}
          {cta}
        </div>
      </div>
    </div>
  );
};
