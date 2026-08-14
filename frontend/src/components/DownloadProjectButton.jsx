import { useState } from "react";
import { Download, Loader2, AlertTriangle } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const filenameFrom = (res) => {
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^";]+)"?/);
  if (m) return m[1];
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  return `voxel-cup-${stamp.slice(0, 8)}-${stamp.slice(8, 14)}.zip`;
};

export const DownloadProjectButton = () => {
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);

  const download = async () => {
    if (state === "loading") return;
    setState("loading");
    setError(null);
    try {
      if (!BACKEND_URL) throw new Error("REACT_APP_BACKEND_URL no está configurada");
      const res = await fetch(`${BACKEND_URL}/api/export/zip`, { cache: "no-store" });
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filenameFrom(res);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setError(e.message || "No se pudo generar el ZIP");
      setState("error");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        data-testid="download-source-button"
        onClick={download}
        disabled={state === "loading"}
        className="w-full py-3 rounded-xl bg-[#2f74ff]/90 border-2 border-white/20 text-base font-bold flex items-center justify-center gap-2 hover:bg-[#2f74ff] disabled:opacity-70 disabled:cursor-wait transition-colors"
      >
        {state === "loading" ? (
          <>
            <Loader2 size={20} strokeWidth={3} className="animate-spin" /> EMPAQUETANDO…
          </>
        ) : (
          <>
            <Download size={20} strokeWidth={3} />{" "}
            {state === "done" ? "¡ZIP DESCARGADO!" : "DESCARGAR PROYECTO"}
          </>
        )}
      </button>
      {state === "error" && (
        <p
          data-testid="download-source-error"
          className="text-xs font-bold text-[#ff8080] flex items-center justify-center gap-1 text-center"
        >
          <AlertTriangle size={14} strokeWidth={3} /> {error} — reintentá en unos segundos.
        </p>
      )}
    </div>
  );
};
