import { useEffect, useState } from "react";

const rttColor = (ms) =>
  ms == null ? "rgba(255,255,255,0.5)" : ms < 50 ? "#7dff5a" : ms < 120 ? "#ffd21c" : "#ff5a5a";

const Row = ({ label, value, color }) => (
  <div className="flex items-center justify-between gap-3 text-[10px] leading-none">
    <span className="tracking-[0.12em] text-white/45">{label}</span>
    <span className="font-bold tabular-nums" style={{ color: color || "#ffffff" }}>
      {value}
    </span>
  </div>
);

const fmt = (v, unit = "") => (v == null ? "—" : `${v}${unit}`);

export const NetDiagHud = () => {
  const [s, setS] = useState(null);

  useEffect(() => {
    const netDiag = window.__netDiag;
    if (!netDiag) return undefined;
    const unsub = netDiag.subscribe(setS);
    const onKey = (e) => {
      if (e.key === "F3") {
        e.preventDefault();
        netDiag.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unsub();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!s || !s.enabled) return null;

  const rows = [
    ["LOOP", fmt(s.loopRate, "hz")],
    ["RENDER", fmt(s.renderRate, "hz")],
    ["PREDICCIÓN", fmt(s.predRate, "hz")],
    ["STATES", fmt(s.stateRate, "hz")],
    ["INPUTS", fmt(s.inputRate, "hz")],
  ];
  if (s.isHost) rows.push(["SIM HOST", fmt(s.hostRate, "x")]);
  rows.push(
    ["RTT", fmt(s.rtt, "ms"), rttColor(s.rtt)],
    ["1-WAY", fmt(s.oneWay, "ms"), rttColor(s.oneWay)],
    ["TECLA→MOVE", fmt(s.keyToLocalMove, "ms"), s.keyToLocalMove > 40 ? "#ffd21c" : "#7dff5a"],
    ["TECLA→ACK", fmt(s.keyToAck, "ms"), s.keyToAck > 90 ? "#ff5a5a" : s.keyToAck > 50 ? "#ffd21c" : "#7dff5a"],
    ["ACK/SEQ", `${s.ackSeq ?? "—"}/${s.mySeq ?? "—"}`],
    ["PENDIENTES", fmt(s.pending)],
    ["CORRECCIÓN", fmt(s.correction)],
    ["DRIFT", fmt(s.drift)],
    ["GAPS", fmt(s.stateGaps)]
  );

  return (
    <div
      data-testid="netdiag-hud"
      className="pointer-events-none absolute top-24 right-5 z-40 w-[190px] rounded-xl border border-white/20 bg-[#050a1c]/85 p-2.5 backdrop-blur-md"
      style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}
    >
      <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
        <span className="text-[10px] font-black tracking-[0.18em] text-[#ffd21c]">NET DIAG</span>
        <span className="text-[9px] text-white/35">F3</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map(([label, value, color]) => (
          <Row key={label} label={label} value={value} color={color} />
        ))}
      </div>
    </div>
  );
};

export default NetDiagHud;
