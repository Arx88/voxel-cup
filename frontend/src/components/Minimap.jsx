import { useEffect, useRef } from "react";

const FIELD_L = 68;
const FIELD_W = 44;

export const Minimap = ({ gameRef }) => {
  const ref = useRef(null);

  useEffect(() => {
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cvs = ref.current;
      const g = cvs?.getContext("2d");
      const snap = gameRef.current?.snapshot;
      if (!g || !snap) return;
      const W = cvs.width;
      const H = cvs.height;
      g.clearRect(0, 0, W, H);
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 1.6;
      g.strokeRect(6, 6, W - 12, H - 12);
      g.beginPath();
      g.moveTo(W / 2, 6);
      g.lineTo(W / 2, H - 6);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2, H * 0.17, 0, Math.PI * 2);
      g.stroke();
      g.strokeRect(6, H / 2 - H * 0.3, W * 0.1, H * 0.6);
      g.strokeRect(W - 6 - W * 0.1, H / 2 - H * 0.3, W * 0.1, H * 0.6);

      const px = (x) => 6 + ((x + FIELD_L / 2) / FIELD_L) * (W - 12);
      const pz = (z) => 6 + ((z + FIELD_W / 2) / FIELD_W) * (H - 12);

      snap.players.forEach((p) => {
        g.beginPath();
        g.arc(px(p.x), pz(p.z), p.me ? 4 : 3.2, 0, Math.PI * 2);
        g.fillStyle = p.keeper ? "#ffd21c" : p.team === "red" ? "#ff3b47" : "#3b8bff";
        g.fill();
        if (p.me) {
          g.strokeStyle = "#ffd21c";
          g.lineWidth = 1.6;
          g.stroke();
        }
      });
      g.beginPath();
      g.arc(px(snap.ball.x), pz(snap.ball.z), 2.6, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [gameRef]);

  return (
    <canvas
      data-testid="minimap-canvas"
      ref={ref}
      width={300}
      height={150}
      className="w-[300px] h-[150px] rounded-xl bg-[#0a2410]/85 border-2 border-white/25 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
    />
  );
};
