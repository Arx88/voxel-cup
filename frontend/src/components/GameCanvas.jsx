import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Game } from "@/game/engine";
import { HUD } from "./HUD";
import { NetDiagHud } from "./NetDiagHud";
import { HostSync, ClientSync, applyStateToScene } from "@/game/sync";
import { netDiag } from "@/game/diagnostics";

/**
 * Máquina de estados de arranque de partida:
 *   loading -> ready | error
 *
 * Arranque blindado (bug "queda en azul y sólo entra al refrescar"):
 *   - espera a que el contenedor tenga tamaño real antes de crear el WebGL
 *   - vigila que el motor haya dibujado el primer frame; si no, reintenta solo
 *   - si el navegador nos quita el contexto WebGL, rearranca automáticamente
 *
 * P2-SYNC-TEST: modo multiplayer
 *   - Si `roomClient` y `isHost` llegan, el host engine corre la simulación
 *     completa y HostSync transmite state @ 20Hz + aplica inputs remotos.
 *   - Si `roomClient` llega e `isHost === false`, el engine arranca pero
 *     `networkMode = "client"` hace que _loop sólo renderice; ClientSync
 *     aplica el state interpolado a los meshes y manda input local @ 30Hz.
 *   - Si `roomClient` no llega, modo single-player (comportamiento histórico).
 */
const MAX_AUTO_RETRY = 2;

// Re-point the engine's controlled/hero player to the local client's own
// slot. The engine boots with `controlled` = red DEF (the single-player
// hero); in multiplayer a player may occupy any slot, so both host and guest
// must re-target it to their authoritative slot index (rc.mySlot).
const setControlledToMySlot = (localGame, rc) => {
  const slot = rc?.mySlot;
  if (typeof slot !== "number" || !localGame.players?.[slot]) return;
  const myPlayer = localGame.players[slot];
  if (localGame.controlled === myPlayer) return;
  localGame.players.forEach((p) => {
    if (p.controller) p.controller.isLocal = false;
    p.hero = false;
  });
  localGame.controlled = myPlayer;
  localGame.hero = myPlayer;
  myPlayer.hero = true;
  myPlayer.controller = myPlayer.controller || {};
  myPlayer.controller.isLocal = true;
  myPlayer.controller.type = "human";
};

export const GameCanvas = ({ roomClient, isHost }) => {
  const mount = useRef(null);
  const gameRef = useRef(null);
  const autoRetry = useRef(0);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const [errMsg, setErrMsg] = useState("");

  // Refs that survive re-renders so the boot effect can read the latest
  // values without re-running on every prop change.
  const rcRef = useRef(roomClient);
  const isHostRef = useRef(isHost);
  rcRef.current = roomClient;
  isHostRef.current = isHost;

  const retry = useCallback((auto) => {
    if (auto) {
      if (autoRetry.current >= MAX_AUTO_RETRY) return false;
      autoRetry.current += 1;
    } else {
      autoRetry.current = 0;
    }
    setErrMsg("");
    setStatus("loading");
    setAttempt((n) => n + 1);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let localGame = null;
    let raf = 0;
    let watchdog = 0;
    let tries = 0;
    let canvasEl = null;
    let hostSync = null;
    let clientSync = null;

    const onContextLost = (e) => {
      e.preventDefault();
      if (cancelled) return;
      if (!retry(true)) {
        setErrMsg("El navegador cerró el contexto 3D. Reintentá para volver a la cancha.");
        setStatus("error");
      }
    };

    const boot = () => {
      if (cancelled || !mount.current) return;
      // el contenedor puede medir 0 durante la transición de pantallas
      if (mount.current.clientWidth < 2 || mount.current.clientHeight < 2) {
        if (tries++ < 180) { // 180 frames ≈ 3s a 60fps
          raf = requestAnimationFrame(boot);
          return;
        }
      }
      try {
        const rc = rcRef.current;
        const host = isHostRef.current;
        // Choose the renderer path before boot: the guest keeps all scene
        // layers but skips antialiasing and uses a bounded pixel ratio so
        // rendering cannot starve its input/prediction loop.
        localGame = new Game(mount.current, { client: !!rc && !host });
        gameRef.current = localGame;
        if (typeof window !== "undefined") window.__game = localGame;
        canvasEl = localGame.renderer.domElement;
        canvasEl.addEventListener("webglcontextlost", onContextLost);
        localGame._resize();
        setStatus("ready");

        // -------------------------------------------------- P2-SYNC-TEST wiring
        if (rc) {
          if (host) {
            // HOST: engine runs full simulation; HostSync broadcasts state
            // @ 30Hz and applies buffered remote inputs each frame.
            hostSync = new HostSync(localGame, rc);
            // Wire host's onInput callback (buffered by HostSync.onRemoteInput).
            rc.onInput = (input, fromSlot) => hostSync.onRemoteInput(input, fromSlot);
            // Hook into the engine loop so HostSync.update(dt) applies remote
            // inputs every fixed step (broadcast runs on HostSync's own timer).
            localGame._syncHook = (dt) => hostSync.update(dt);
            // Re-point controlled/hero to the host's actual slot (the engine
            // boots with `controlled` = red DEF, but the host may have picked
            // any slot in the lobby).
            setControlledToMySlot(localGame, rc);
            const hostOrigOnRoom = rc.onRoom;
            rc.onRoom = (state) => {
              try { setControlledToMySlot(localGame, rc); } catch (e) { /* noop */ }
              if (hostOrigOnRoom) try { hostOrigOnRoom(state); } catch (e) { /* noop */ }
            };
            // Expose for tests / debugging.
            if (typeof window !== "undefined") window.__hostSync = hostSync;
          } else {
            // CLIENT: engine boots (scene + camera + meshes + input listeners)
            // but `networkMode = "client"` makes _loop skip simulation.
            // ClientSync predicts the local player + interpolates the rest.
            clientSync = new ClientSync(rc, localGame);
            // CRITICAL: replace rc.onState BEFORE draining the buffer.
            rc.onState = (state) => clientSync.onState(state);
            if (rc._stateBuffer && rc._stateBuffer.length > 0) {
              for (const s of rc._stateBuffer) {
                clientSync.onState(s);
              }
              rc._stateBuffer = null;
            }
            localGame.networkMode = "client";
            // The guest must spend its frame budget on prediction, HUD and
            // network/render updates rather than a 2x shadow-map resolution.
            // Keep every visual layer enabled, but use a bounded render scale
            // so slower laptops/mobile GPUs do not turn input into seconds of
            // queued frames.
            localGame.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 0.85));
            // Shadows are a second render pass; disabling only this client
            // keeps the complete scene/HUD/effects visible while removing a
            // large source of frame queueing on integrated/mobile GPUs.
            localGame.renderer.shadowMap.enabled = false;
            localGame._resize();
            // Keyboard/touch edges go out immediately; the 30Hz heartbeat
            // remains active as a loss-tolerant fallback.
            localGame._clientInputChanged = () => clientSync._sendCurrentInput();
            // Point controlled/hero to the guest's own slot (not the host's hero)
            setControlledToMySlot(localGame, rc);
            const origOnRoom = rc.onRoom;
            rc.onRoom = (state) => {
              try { setControlledToMySlot(localGame, rc); } catch (e) { /* noop */ }
              if (origOnRoom) try { origOnRoom(state); } catch (e) { /* noop */ }
            };
            localGame._clientRenderHook = (dt) => {
              // 1. Apply interpolated host state to OTHER players + ball
              //    (skip my slot — my player is predicted locally).
              try {
                const interpolated = clientSync.getInterpolatedState();
                if (interpolated) {
                  applyStateToScene(
                    localGame,
                    interpolated,
                    rc.mySlot,
                    dt,
                    clientSync.latestState
                  );
                }
              } catch (e) {
                console.warn("[ClientSync] applyStateToScene error:", e);
              }
              // 2. Sample local charge for the HUD/aim guide. The input
              // heartbeat is transported by ClientSync's wall-clock timer,
              // so it does not depend on this render callback.
              try {
                clientSync.update(
                  dt,
                  localGame.keys,
                  localGame.stick,
                  localGame.holdShoot,
                  localGame.holdSprint,
                  localGame.charge
                );
              } catch (e) {
                console.warn("[ClientSync] update/sendInput error:", e);
              }
              // Fallback prediction tick: if the browser throttles the
              // interval while this tab is visible, the render hook still
              // advances local input immediately.
              try { clientSync._tickPrediction(); } catch (e) {
                console.warn("[ClientSync] prediction error:", e);
              }
              // 3. The wall-clock timer remains the primary prediction path;
              // this hook is only the fallback for a starved timer.
            };
            if (typeof window !== "undefined") window.__clientSync = clientSync;
          }
        }

        // Feed the diagnostics singleton: game + active sync layer + role.
        // The overlay reads this to compute FPS, ping, input latency, drift,
        // and host simulation rate for BOTH host and guest clients.
        netDiag.attach({
          game: localGame,
          clientSync,
          hostSync,
          isHost: !!host,
        });

        // ¿dibujó de verdad? si no, rearrancamos sin pedirle nada al usuario
        watchdog = window.setTimeout(() => {
          if (cancelled || !localGame) return;
          const gl = localGame.renderer.getContext?.();
          const drew = localGame.time > 0 && !gl?.isContextLost?.();
          if (!drew && !retry(true)) {
            setErrMsg("No pudimos dibujar la cancha en este dispositivo.");
            setStatus("error");
          }
        }, 2500); // 2.5s — más tiempo para swiftshader/dispositivos lentos
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[GameCanvas] engine boot failed:", err);
        if (!retry(true)) {
          setErrMsg(err?.message || "No se pudo iniciar el motor.");
          setStatus("error");
        }
      }
    };

    raf = requestAnimationFrame(boot);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
      canvasEl?.removeEventListener("webglcontextlost", onContextLost);
      // Detach sync callbacks so a stale RoomClient doesn't fire into a
      // disposed engine if the component re-mounts.
      try {
        const rc = rcRef.current;
        if (rc) {
          if (hostSync && rc.onInput) rc.onInput = null;
          if (clientSync && rc.onState) rc.onState = null;
        }
      } catch (e) { /* noop */ }
      try {
        if (localGame) localGame._clientInputChanged = null;
        clientSync?.dispose?.();
        hostSync?.dispose?.();
        localGame?.dispose?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[GameCanvas] dispose warn:", e);
      }
      gameRef.current = null;
      if (typeof window !== "undefined") {
        if (window.__game === localGame) delete window.__game;
        if (window.__hostSync === hostSync) delete window.__hostSync;
        if (window.__clientSync === clientSync) delete window.__clientSync;
      }
      // Detach the disposed engine/sync refs so the diagnostics sampler stops
      // reading stale Three.js objects (it keeps its singleton subscription).
      netDiag.detach();
    };
  }, [attempt, retry]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0a1030]">
      <div data-testid="game-canvas" ref={mount} className="absolute inset-0" />
      {status === "ready" && <HUD gameRef={gameRef} multiplayer={!!roomClient} />}
      {status === "ready" && <NetDiagHud />}

      {status === "loading" && (
        <div
          data-testid="game-loading"
          className="absolute inset-0 z-40 grid place-items-center bg-[#03060f]/85 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-[#ffd21c] animate-spin" strokeWidth={2.6} />
            <span className="display-font text-lg tracking-[0.32em] text-white/85">
              PREPARANDO CANCHA…
            </span>
          </div>
        </div>
      )}

      {status === "error" && (
        <div
          data-testid="game-error"
          className="absolute inset-0 z-40 grid place-items-center bg-[#03060f]/95 px-6"
        >
          <div className="flex flex-col items-center gap-5 max-w-[440px] text-center">
            <span className="display-font text-xl tracking-[0.24em] text-[#ff6b6b]">
              NO PUDIMOS ARRANCAR
            </span>
            <p className="text-white/70 text-sm leading-relaxed">
              {errMsg || "Ocurrió un problema iniciando la partida."}
            </p>
            <button
              data-testid="game-retry"
              onClick={() => retry(false)}
              className="display-font flex items-center gap-2 h-12 px-6 rounded-xl bg-[#ffd21c] text-[#3a2500] tracking-[0.2em] uppercase text-sm transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              <RefreshCw size={16} strokeWidth={3} /> Reintentar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
