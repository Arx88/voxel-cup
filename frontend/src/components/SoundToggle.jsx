import { Volume2, VolumeX } from "lucide-react";
import { setMuted, isMuted } from "@/game/audio";
import { music } from "@/game/music";
import { uisfx } from "@/game/uisfx";
import { useState } from "react";
import { SPLASH } from "@/constants/testIds";

export const SoundToggle = ({ className = "" }) => {
  const [muted, setM] = useState(isMuted());

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setM(next);
    if (next) {
      music.stop();
    } else {
      music.start();
      uisfx.click();
    }
  };

  return (
    <button
      data-testid={SPLASH.soundToggle}
      onClick={toggle}
      aria-label={muted ? "Activar sonido" : "Silenciar"}
      className={`z-40 w-12 h-12 grid place-items-center rounded-xl bg-[#0d1734]/85 border-2 border-white/15 backdrop-blur-md text-white transition-all duration-200 hover:border-[#2f74ff] hover:-translate-y-0.5 active:scale-95 ${className}`}
    >
      {muted ? <VolumeX size={22} strokeWidth={2.6} /> : <Volume2 size={22} strokeWidth={2.6} />}
    </button>
  );
};
