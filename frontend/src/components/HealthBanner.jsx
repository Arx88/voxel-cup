import { useEffect, useState } from "react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Pantallas donde el backend es relevante (multiplayer / status check).
// En single-player (splash, onboarding, creator, game) el juego funciona
// 100% sin backend y el cartel solo molesta — lo ocultamos.
const MULTIPLAYER_STAGES = new Set(["lobby", "room"]);

export const HealthBanner = ({ stage }) => {
  const [health, setHealth] = useState({ state: "checking", detail: "" });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      // Si no hay backend configurado, no molestamos al usuario con un cartel.
      // El juego funciona 100% sin backend (solo es para status checks).
      if (!BACKEND_URL) {
        if (alive) setHealth({ state: "ok", detail: "" });
        return;
      }
      try {
        const res = await fetch(`${BACKEND_URL}/api/health`, { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        if (data.status === "ok") setHealth({ state: "ok", detail: `API ok · db ${data.db}` });
        else setHealth({ state: "degraded", detail: `MongoDB no responde: ${String(data.mongo).slice(0, 90)}` });
      } catch (e) {
        if (alive) setHealth({ state: "down", detail: "API no responde en :8001 — corré ./setup.sh o make dev" });
      }
    };
    check();
    const id = setInterval(check, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // En pantallas single-player nunca mostramos el banner.
  if (!MULTIPLAYER_STAGES.has(stage)) return null;
  if (health.state === "ok") return null;

  const styles = {
    checking: "bg-[#101a33]/90 border-white/25 text-white/80",
    degraded: "bg-[#4a3400]/90 border-[#ffd21c]/60 text-[#ffe14d]",
    down: "bg-[#4a0d13]/90 border-[#ff5f6d]/60 text-[#ff9aa2]",
  }[health.state];

  const Icon = health.state === "checking" ? Loader2 : health.state === "degraded" ? Wifi : WifiOff;

  return (
    <div
      data-testid="health-banner"
      className={`pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl border-2 backdrop-blur-md text-xs font-bold max-w-[90vw] ${styles}`}
    >
      <Icon size={16} strokeWidth={3} className={health.state === "checking" ? "animate-spin" : ""} />
      <span data-testid="health-banner-text">
        {health.state === "checking" ? "Verificando backend…" : health.detail}
      </span>
    </div>
  );
};
