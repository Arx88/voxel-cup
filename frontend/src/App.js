import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import "@/App.css";
import "@/flow.css";
import { GameCanvas } from "@/components/GameCanvas";
import { Splash } from "@/components/Splash";
import { Onboarding } from "@/components/Onboarding";
import { PlayerCreator } from "@/components/PlayerCreator";
import { Lobby } from "@/components/Lobby";
import { RoomScreen } from "@/components/RoomScreen";
import { HealthBanner } from "@/components/HealthBanner";
import { hasProfile } from "@/game/appearance";
import { music } from "@/game/music";
import { KickoffCountdown } from "@/components/KickoffCountdown";
import { HalftimeScreen } from "@/components/HalftimeScreen";

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.4 },
};

function CountdownPreview() {
  const [t, setT] = useState(3.0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v <= -0.7 ? 3.0 : v - 0.05)), 50);
    return () => clearInterval(id);
  }, []);
  const count = Math.max(0, t);
  const go = t <= 0 ? 0.7 : 0;
  return (
    <div className="absolute inset-0" style={{ background: "url(/stadium-scene.png) center/cover" }}>
      <KickoffCountdown count={count} go={go} />
    </div>
  );
}

function App() {
  const isCdTest = typeof window !== "undefined" && window.location.hash === "#cdtest";
  const isHtTest = typeof window !== "undefined" && window.location.hash === "#httest";
  const returning = hasProfile();
  const deepLink = typeof window !== "undefined" && window.location.hash === "#creator";
  const [stage, setStage] = useState(deepLink ? "creator" : "splash");
  const [seed, setSeed] = useState(0);
  // PlayerCreator purpose: "play" cuando se entra para arrancar partido,
  // "edit" cuando se entra desde "MI JUGADOR" para solo editar y guardar.
  const [creatorPurpose, setCreatorPurpose] = useState("play");

  // Multiplayer room state (code + mode + host flag) shared between Lobby and
  // RoomScreen. Set by Lobby before transitioning to "room"; consumed by
  // RoomScreen to wire up the WebSocket client.
  const [roomInfo, setRoomInfo] = useState({ code: "", mode: "3v3", isHost: false });

  // P2-SYNC-TEST: the live RoomClient transferred from RoomScreen → GameCanvas
  // when the match starts. Host side broadcasts state @ 20Hz; client side
  // sends input @ 30Hz and renders interpolated snapshots.
  const [roomClient, setRoomClient] = useState(null);
  const [isHost, setIsHost] = useState(false);

  // Escuchar evento de SALIR del partido para volver al Lobby (antes iba al
  // PlayerCreator — el lobby ahora cumple ese rol de menú principal).
  useEffect(() => {
    const onExitMatch = () => {
      music.start?.();
      // P2-SYNC-TEST: cerrar el RoomClient al salir del partido.
      try { roomClient?.leave?.(); } catch (e) { /* noop */ }
      setRoomClient(null);
      setIsHost(false);
      setStage("lobby");
    };
    window.addEventListener("voxelcup:exit-match", onExitMatch);
    return () => window.removeEventListener("voxelcup:exit-match", onExitMatch);
  }, [roomClient]);

  const afterSplash = useCallback(() => {
    // Fresh users see the onboarding carousel first; returning users land
    // directly in the lobby. Both paths eventually reach "lobby".
    setStage(returning ? "lobby" : "onboarding");
  }, [returning]);

  const startMatch = () => {
    music.stop();
    setSeed((s) => s + 1);
    setStage("game");
  };

  // ---- Lobby callbacks ----
  const enterRoom = useCallback((code, mode, isHost) => {
    setRoomInfo({ code, mode, isHost });
    setStage("room");
  }, []);

  const quickPlayVsAi = useCallback(() => {
    music.stop();
    setCreatorPurpose("play");
    setStage("creator");
  }, []);

  const editPlayer = useCallback(() => {
    setCreatorPurpose("edit");
    setStage("creator");
  }, []);

  // ---- Room callbacks ----
  const leaveRoom = useCallback(() => {
    setStage("lobby");
  }, []);

  // P2-SYNC-TEST: RoomScreen hands us the live RoomClient (host or non-host)
  // when the match starts. We pass it down to GameCanvas along with the
  // isHost flag so the sync layer can wire up HostSync or ClientSync.
  const startRoomMatch = useCallback((payload) => {
    music.stop();
    if (payload?.client) {
      setRoomClient(payload.client);
      setIsHost(!!roomInfo.isHost);
    }
    setSeed((s) => s + 1);
    setStage("game");
  }, [roomInfo.isHost]);

  // Host wants to change mode — leave the current room and create a new one
  // with the new mode. The Lobby's CREAR SALA flow handles this naturally.
  const changeRoomMode = useCallback(() => {
    setStage("lobby");
  }, []);

  if (isCdTest) return <CountdownPreview />;

  if (isHtTest) {
    const mock = {
      score: { red: 2, blue: 3 },
      halftime: true,
      matchEnded: false,
      halftimeCount: 10,
    };
    return (
      <div className="absolute inset-0" style={{ background: "url(/stadium-scene.png) center/cover" }}>
        <HalftimeScreen s={mock} />
      </div>
    );
  }

  return (
    <div className="App relative w-screen h-screen overflow-hidden bg-[#03060f]">
      <AnimatePresence mode="wait">
        {stage === "splash" && (
          <motion.div key="splash" {...fade} className="absolute inset-0">
            <Splash onDone={afterSplash} short={returning} />
          </motion.div>
        )}
        {stage === "onboarding" && (
          <motion.div key="onboarding" {...fade} className="absolute inset-0">
            <Onboarding onDone={() => setStage("lobby")} />
          </motion.div>
        )}
        {stage === "lobby" && (
          <motion.div key="lobby" {...fade} className="absolute inset-0">
            <Lobby
              onPlayVsAi={quickPlayVsAi}
              onEditPlayer={editPlayer}
              onEnterRoom={enterRoom}
              onBack={() => setStage(returning ? "lobby" : "onboarding")}
            />
          </motion.div>
        )}
        {stage === "room" && (
          <motion.div key={`room-${roomInfo.code}`} {...fade} className="absolute inset-0">
            <RoomScreen
              code={roomInfo.code}
              mode={roomInfo.mode}
              isHostInitial={roomInfo.isHost}
              onBack={leaveRoom}
              onStart={startRoomMatch}
              onChangeMode={changeRoomMode}
            />
          </motion.div>
        )}
        {stage === "creator" && (
          <motion.div key="creator" {...fade} className="absolute inset-0">
            <PlayerCreator
              onPlay={startMatch}
              onBack={() => setStage("lobby")}
              purpose={creatorPurpose}
            />
          </motion.div>
        )}
        {stage === "game" && (
          <motion.div key={`game-${seed}`} {...fade} className="absolute inset-0">
            <GameCanvas roomClient={roomClient} isHost={isHost} />
          </motion.div>
        )}
      </AnimatePresence>
      <HealthBanner stage={stage} />
    </div>
  );
}

export default App;
