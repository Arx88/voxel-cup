import { useState } from "react";
import { sfx } from "../game/audio";

// Barrita de stamina — minimalista, abajo a la derecha
const StaminaBar = ({ stamina }) => {
  const pct = Math.round((stamina || 0) * 100);
  const color = pct < 25 ? "#ff4d4d" : pct < 50 ? "#ffd21c" : "#7dff5a";
  return (
    <div
      className="pointer-events-none flex items-center gap-2"
      style={{ minWidth: 120 }}
    >
      <span className="text-[9px] font-bold tracking-wider text-white/50">STAM</span>
      <div className="flex-1 h-2 rounded-full bg-black/50 overflow-hidden border border-white/10">
        <div
          className="h-full rounded-full transition-all duration-100"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
      </div>
    </div>
  );
};

export const ActionWheel = ({ gameRef, s }) => {
  const g = () => gameRef.current;
  const [activeEmote, setActiveEmote] = useState(null);

  const emotes = [
    { i: 0, glyph: "\u{1F446}", k: "1", label: "PEDIR BALÓN" },
    { i: 1, glyph: "\u2757", k: "2", label: "PATEAR" },
    { i: 2, glyph: "\u{1F621}", k: "3", label: "ENOJO" },
    { i: 3, glyph: "\u{1F44F}", k: "4", label: "BIEN" },
  ];

  const handleEmote = (idx) => {
    sfx.ui();
    g()?.playEmote(idx);
    setActiveEmote(idx);
    setTimeout(() => setActiveEmote((cur) => (cur === idx ? null : cur)), 1800);
  };

  return (
    <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
      {/* Barra de stamina — sola, minimalista */}
      <div
        className="pointer-events-auto px-3 py-1.5 rounded-lg bg-[#0a1530]/80 border border-white/10 backdrop-blur-sm"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
      >
        <StaminaBar stamina={s.stamina} />
      </div>

      {/* Emojis rediseñados — pill horizontal con labels */}
      <div
        className="pointer-events-auto flex items-center gap-1 px-1.5 py-1 rounded-full bg-[#0a1530]/80 border border-white/10 backdrop-blur-sm"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
      >
        {emotes.map(({ i, glyph, k, label }) => (
          <button
            key={i}
            data-testid={`emote-button-${k}`}
            onClick={() => handleEmote(i)}
            title={label}
            className={`relative w-8 h-8 rounded-full grid place-items-center text-[15px] transition-all duration-150 active:scale-90 ${
              activeEmote === i
                ? "bg-[#3d8bff]/40 scale-110"
                : "bg-white/5 hover:bg-white/10"
            }`}
          >
            {glyph}
            {/* badge con la tecla */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#101a33] border border-white/30 text-[8px] font-bold text-white/70 grid place-items-center leading-none"
            >
              {k}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
