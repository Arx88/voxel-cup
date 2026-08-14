import { POWERUPS } from "../game/powerups";
import { POWERUP_ICONS } from "../game/powerupIcons";

const SEG = 12;

const Cartridge = ({ type, mine, t }) => {
  const def = POWERUPS[type];
  if (!def) return null;
  const iconSrc = POWERUP_ICONS[!mine && type === "ice" ? "freeze" : type] || POWERUP_ICONS.boot;
  const color = mine ? def.color : "#ff2f52";
  const filled = Math.ceil(Math.max(0, Math.min(1, t)) * SEG);
  const dying = t <= 0.25 && type !== "boot";
  const seconds = type === "boot" ? "∞" : Math.max(1, Math.ceil((def.dur || 0) * t));

  return (
    <div
      data-testid={`powerup-chip-${type}`}
      className="relative"
      style={{
        animation: `pwrSlam 340ms cubic-bezier(.15,1.75,.35,1) both${dying ? ", pwrBlink 380ms steps(2,end) infinite" : ""}`,
        filter: `drop-shadow(0 12px 26px ${color}66) drop-shadow(0 0 22px ${color}aa)`,
      }}
    >
      {/* borde biselado arcade */}
      <div
        className="flex items-stretch gap-0"
        style={{
          clipPath: "polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)",
          background: "#02040d",
          padding: "4px",
        }}
      >
        <div
          className="flex items-stretch"
          style={{
            clipPath: "polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)",
            background: `linear-gradient(140deg, ${color}55 0%, #0b1428 55%, #05070f 100%)`,
            boxShadow: `inset 0 0 0 3px ${color}, inset 0 20px 26px -16px #ffffff55, inset 0 -18px 26px -18px ${color}80`,
          }}
        >
          {/* bloque icono grande */}
          <div
            className="relative grid place-items-center w-[86px] overflow-hidden"
            style={{
              background: `radial-gradient(circle at 50% 40%, ${color}44 0%, #05091a 70%)`,
              boxShadow: `inset 0 0 0 2px #ffffff18`,
            }}
          >
            <img
              src={iconSrc}
              alt=""
              className="w-[74px] h-[74px] object-contain"
              style={{
                imageRendering: "pixelated",
                filter: `drop-shadow(0 3px 0 rgba(0,0,0,0.55)) drop-shadow(0 0 14px ${color}cc)`,
                animation: "pwrIconFloat 1.4s ease-in-out infinite",
              }}
            />
            <span
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 4px)",
              }}
            />
            <span
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: `inset 0 0 24px ${color}80`,
              }}
            />
          </div>

          <div className="pl-3 pr-4 py-[8px] min-w-[168px] flex flex-col justify-between">
            <div className="flex items-center gap-[6px] leading-none">
              {!mine && (
                <span
                  className="text-[10px] font-black tracking-[0.18em] px-[6px] py-[2px] bg-[#ff2f52] text-[#05070f]"
                  style={{ clipPath: "polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)" }}
                >
                  RIVAL
                </span>
              )}
              <span
                className="text-[15px] font-black tracking-[0.09em] whitespace-nowrap uppercase"
                style={{
                  color: "#ffffff",
                  textShadow: `0 0 12px ${color}ff, 0 2px 0 rgba(0,0,0,0.75)`,
                  WebkitTextStroke: `1px ${color}`,
                }}
              >
                {def.label}
              </span>
            </div>

            {/* fila con etiqueta ACTIVO + segundos */}
            <div className="flex items-center justify-between mt-[6px]">
              <span
                className="text-[9px] font-black tracking-[0.24em] px-[6px] py-[2px]"
                style={{
                  background: color,
                  color: "#05070f",
                  clipPath: "polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%)",
                  animation: dying ? "" : "pwrTagPulse 900ms ease-in-out infinite",
                }}
              >
                {mine ? "ACTIVO" : "EN CONTRA"}
              </span>
              <span
                className="text-[13px] font-black tabular-nums"
                style={{
                  color,
                  textShadow: `0 0 8px ${color}cc`,
                }}
              >
                {seconds}s
              </span>
            </div>

            {/* barra segmentada arcade */}
            <div className="mt-[7px] flex gap-[3px] h-[10px]">
              {Array.from({ length: SEG }).map((_, i) => (
                <span
                  key={i}
                  className="flex-1"
                  style={{
                    background: i < filled ? color : "#ffffff10",
                    boxShadow: i < filled ? `0 0 8px ${color}, inset 0 -3px 0 rgba(0,0,0,0.35), inset 0 2px 0 rgba(255,255,255,0.35)` : "inset 0 0 0 1px rgba(255,255,255,0.05)",
                    transition: "background 120ms linear",
                    clipPath: "polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* brillo que barre */}
      <span
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{
          clipPath: "polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)",
        }}
      >
        <span
          className="absolute top-0 -left-full h-full w-1/2"
          style={{
            background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.42), transparent)",
            animation: "pwrSheen 2.4s ease-in-out infinite",
          }}
        />
      </span>
    </div>
  );
};

export const PowerupBar = ({ chips }) => (
  <div data-testid="powerup-chips" className="mt-4 flex flex-wrap justify-center gap-[10px]">
    {chips.map((c) => (
      <Cartridge key={`${c.type}-${c.mine}`} type={c.type} mine={c.mine} t={c.t} />
    ))}
  </div>
);
