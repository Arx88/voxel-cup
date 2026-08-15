import * as THREE from "three";
import { FIELD } from "./config";
import { netDiag } from "./diagnostics";

/**
 * sync.js — Voxel Cup host-client synchronization layer.
 *
 * Connects the host-authoritative engine (engine.js) to the relay-only
 * WebSocket client (net.js). The backend NEVER simulates football — it only
 * relays messages. So the entire simulation runs on the HOST's browser:
 *
 *   HOST (engine runs):
 *     - Engine._loop() simulates physics, AI, ball, etc. every frame.
 *     - HostSync.update(dt) is called every frame from the engine loop:
 *         1. Applies buffered remote inputs to the corresponding agent
 *            controllers (so the engine moves remote humans' players).
 *         2. Broadcasts a state snapshot at 20Hz via roomClient.sendState().
 *     - roomClient.onInput(input, fromSlot) buffers the latest input from
 *       each non-host client (overwrites the previous buffer for that slot).
 *     - When the match ends, sendResult() broadcasts the final standings.
 *
 *   CLIENT (engine does NOT simulate):
 *     - Engine boots (scene + camera + meshes + input listeners) but
 *       `game.networkMode = "client"` makes the engine._loop early-return
 *       after rendering — no physics, no AI.
 *     - ClientSync.onState(state) buffers received snapshots (1s window).
 *     - ClientSync.update(dt, ...) is called every frame from a render hook:
 *         1. Sends local input at 30Hz via roomClient.sendInput().
 *         2. (The render hook reads getInterpolatedState() and writes
 *            positions/rotations directly to the Three.js meshes.)
 *     - Interpolation delay: 50ms behind real time (smooths jitter without
 *       adding a full tenth of a second to every remote interaction).
 *
 * Slot ↔ player mapping:
 *   rooms.py slots are ordered [red GK, red DEF, red MID, red FWD,
 *   blue GK, blue DEF, blue MID, blue FWD] for 3v3 — same order as
 *   engine.players (built by _initEntities iterating team then formation).
 *   So slot index === engine.players index. We rely on this 1:1 mapping.
 */

// ============================================================ HOST SIDE ====

/**
 * HostSync: hooks into the engine loop to broadcast state at 20Hz and
 * apply buffered remote inputs to the corresponding agent controllers.
 */
export class HostSync {
  /**
   * @param {Game} game — the engine instance (must already be booted).
   * @param {RoomClient} roomClient — connected WebSocket client (host side).
   */
  constructor(game, roomClient) {
    this.game = game;
    this.rc = roomClient;
    this.seq = 0;
    /** @type {Map<number, object>} slotIndex -> latest input */
    this.inputBuffer = new Map();
    /** @type {Map<number, number>} slotIndex -> last applied input seq */
    this.lastAppliedSeq = new Map();
    /** Set of slot indices we've already marked as remote-human */
    this._markedSlots = new Set();
    // Timestamp (guest monotonic clock) echoed back in the next state so the
    // guest can measure a real round-trip without clock synchronization.
    this._pingT = null;
    // Keep a ping per guest. A single shared ping meant that, with 3+ people
    // in a room, one guest could measure another guest's RTT and project its
    // prediction with the wrong delivery age.
    this._pingBySlot = new Map();
    // Broadcast is DECOUPLED from the engine/render loop. A dedicated 30Hz
    // timer sends the latest authoritative snapshot so a throttled render
    // (background tab, slow GPU, software WebGL) can never starve the guest's
    // state stream. `_sendState` reads the current world state, which the
    // fixed-timestep loop keeps advancing in real time via its catch-up.
    this._broadcastTimer = setInterval(() => {
      try {
        this._sendState();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[HostSync] broadcast error:", e);
      }
    }, 1000 / 30);
  }

  /**
   * Called every fixed sim step from the engine loop (via game._syncHook).
   * 1. Re-mark remote humans in case slots changed (cheap if no change).
   * 2. Apply buffered remote inputs to agent controllers so the engine's
   *    _updateRemoteHuman() sees them this same step.
   *
   * Broadcasting intentionally lives on its own timer (see constructor), not
   * here — tying it to the loop made the host's state rate collapse to its
   * render rate whenever the frame budget was exceeded.
   */
  update(dt) {
    try {
      this._markRemoteHumans();
      this._applyRemoteInputs();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[HostSync] update error:", e);
    }
  }

  /** Stop the broadcast timer (called when the match unmounts). */
  dispose() {
    if (this._broadcastTimer) {
      clearInterval(this._broadcastTimer);
      this._broadcastTimer = null;
    }
  }

  /**
   * For each human slot (except the host's own), flip the corresponding
   * engine player's controller to type="human", isLocal=false, isRemote=true.
   * This makes _updateRemoteHuman(p, dt) drive that player instead of updateAI.
   * Idempotent — safe to call every frame.
   */
  _markRemoteHumans() {
    const slots = this.rc?.slots || [];
    const mySlot = this.rc?.mySlot;
    for (let i = 0; i < slots.length; i++) {
      if (i === mySlot) continue;
      const slot = slots[i];
      if (!slot || slot.type !== "human") continue;
      if (slot.role === "GK") continue; // GKs are always AI
      const player = this.game.players[i];
      if (!player?.controller) continue;
      if (!this._markedSlots.has(i)) {
        player.controller.type = "human";
        player.controller.isLocal = false;
        player.controller.isRemote = true;
        player.controller.clientId = slot.name || `remote#${i}`;
        this._markedSlots.add(i);
      }
    }
    // Un-mark slots that are no longer human (e.g. client left)
    for (const i of this._markedSlots) {
      const slot = slots[i];
      const stillHuman = slot && slot.type === "human" && slot.role !== "GK" && i !== mySlot;
      if (!stillHuman) {
        const player = this.game.players[i];
        if (player?.controller) {
          player.controller.type = "ai";
          player.controller.isLocal = false;
          player.controller.isRemote = false;
          player.controller.clientId = null;
          // Clear input so AI doesn't read stale values
          player.controller.input.ax = 0;
          player.controller.input.az = 0;
          player.controller.input.shoot = false;
          player.controller.input.pass = false;
          player.controller.input.tackle = false;
          player.controller.input.dash = false;
          player.controller.input.sprint = false;
        }
        this._markedSlots.delete(i);
      }
    }
  }

  /**
   * Build a minimal state snapshot from the engine and broadcast it.
   * The server doesn't introspect the payload — it's a verbatim JSON relay.
   *
   * P3-CAREER-POSTMATCH: when matchEnded is true, also include `playerStats`,
   * `prSnapshot`, `winner`, and `stats` (team aggregates). These are needed
   * by the client's HUD to render the post-match standings + MVP card. We
   * only send them once (when matchEnded flips true), so the wire cost is
   * minimal. After that, the regular minimal snapshot continues to flow.
   */
  _sendState() {
    const g = this.game;
    if (!g?.players || !g?.ball) return;
    const matchEnded = !!g.snapshot?.matchEnded;
    const state = {
      type: "state",
      seq: ++this.seq,
      // Echo the latest guest input timestamp so clients measure RTT.
      ping: this._pingT,
      // Authoritative simulation clock. Clients use this to estimate how old
      // a received position is before reconciling their local prediction.
      serverTime: Number(g.time) || 0,
      serverTick: Math.round((Number(g.time) || 0) * 60),
      players: g.players.map((p) => ({
        id: p.formationIdx,
        team: p.team,
        role: p.baseRole,
        keeper: !!p.keeper,
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        y: p.mesh.position.y,
        yaw: p.mesh.rotation.y,
        speed: p.speed || 0,
        anim: (p.speed || 0) > 5 ? "run" : "idle",
        // Animation state: send flags so the client can drive animatePlayer
        // with the right pose (slide, celebrate, dive, squash).
        slide: p.slide > 0,
        celebrate: !!p.celebrate,
        squash: p.squash || 0,
        dive: p.diveT > 0 ? p.diveKind : null,
        diveSide: p.diveSide || 1,
        // HUD per-player state: the guest renders its own stamina / charge /
        // cooldown / super-meter HUD from these, mirroring the host sim.
        stamina: p.controller?.stamina ?? 1,
        superMeter: p.controller?.superMeter ?? 0,
        hasBall: !!g._hasBall?.(p),
        charging: p === g.controlled ? !!g.holdShoot : !!(p.controller?.input?.shoot),
        power: p === g.controlled ? (g.charge || 0) : (Number(p.controller?.input?.charge) || 0),
        cdTackle: Math.max(0, Math.min(1, (p.controller?.tackleCooldown ?? 0) / 1.15)),
        cdDash: Math.max(0, Math.min(1, (p.controller?.dashCooldown ?? 0) / 1.0)),
      })),
      ball: {
        x: g.ball.mesh.position.x,
        z: g.ball.mesh.position.z,
        y: g.ball.mesh.position.y,
        // Ball rotation: send the spin so the client can rotate the ball mesh
        // visually (the host engine doesn't rotate the mesh either, but the
        // user expects to see spin — we synthesize it from velocity on both
        // sides for consistency).
        vx: g.ball.vel.x,
        vz: g.ball.vel.z,
      },
      score: g.snapshot?.score || { red: 0, blue: 0 },
      clock: g.snapshot?.clock || 0,
      half: g.snapshot?.half || 1,
      halfLabel: g.snapshot?.halfLabel || "PRIMER TIEMPO",
      halftime: !!g.snapshot?.halftime,
      halftimeCount: g.snapshot?.halftimeCount || 0,
      paused: !!g.snapshot?.paused,
      pauses: g.snapshot?.pauses || null,
      stats: g.snapshot?.stats || { red: {}, blue: {} },
      goals: g.snapshot?.goals || [],
      heroStats: g.snapshot?.heroStats || {},
      matchEnded,
      kickoffCount: g.snapshot?.kickoffCount || 0,
      kickoffGo: g.snapshot?.kickoffGo || 0,
      // Goal celebration state: send so the client can render the goal
      // banner + trigger confetti/FX. These are set by the engine when a
      // goal is scored and cleared after goalCooldown expires.
      goalText: g.snapshot?.goalText || null,
      goalScorer: g.snapshot?.goalScorer || null,
      goalScorerName: g.snapshot?.goalScorerName || null,
      goalScorerNumber: g.snapshot?.goalScorerNumber || null,
      goalScorerHero: !!g.snapshot?.goalScorerHero,
      goalCooldown: g.goalCooldown || 0,
      celebrateTeam: g.celebrateTeam || null,
      // Hitstop / slowmo / flash for visual feedback (client can apply
      // the same time-scale so the freeze-feel matches the host).
      hitstop: g.hitstop || 0,
      slowmo: g.slowmo || 0,
      flash: g.flash || 0,
      superFx: g.superShotFx?.t || 0,
      shotKind: g.shotKind || "normal",
      // HUD global state (power-up chips, toast, ball-holder bar + ratings).
      // The host engine already computes these into g.snapshot each frame.
      chips: g.snapshot?.chips || [],
      toast: g.snapshot?.toast || null,
      ballHolder: g.snapshot?.ballHolder || null,
      ballHolderRating: g.snapshot?.ballHolderRating ?? null,
      playerRatings: g.snapshot?.playerRatings || { red: [], blue: [] },
      prSnapshot: g.snapshot?.prSnapshot || [],
      // Power-ups 3D en cancha: el cliente los refleja desde el host.
      powerups: (g.powerups?.items || []).map((it) => ({
        type: it.type,
        x: it.x,
        z: it.z,
        life: it.life,
        t: it.t,
      })),
    };
    // Echo the last input seq applied per remote slot so guests can drop
    // acknowledged inputs and replay only the unacked ones.
    if (this.lastAppliedSeq.size > 0) {
      state.acks = Object.fromEntries(this.lastAppliedSeq);
    }
    if (this._pingBySlot.size > 0) {
      state.pings = Object.fromEntries(this._pingBySlot);
    }
    // P3: include full stats once on match end so clients can render the
    // post-match screen (standings + MVP + team aggregates).
    if (matchEnded) {
      state.winner = g.snapshot?.winner || null;
      state.playerStats = g.snapshot?.playerStats || {};
      state.prSnapshot = g.snapshot?.prSnapshot || [];
      state.stats = g.snapshot?.stats || { red: {}, blue: {} };
    }
    this.rc.sendState(state);
  }

  /**
   * Called by RoomClient.onInput(input, fromSlot) — buffers the latest input
   * for the given slot. Overwrites any previous buffered input for that slot.
   */
  onRemoteInput(input, fromSlot) {
    if (fromSlot == null) return;
    if (typeof input?.t === "number") {
      this._pingT = input.t;
      this._pingBySlot.set(fromSlot, input.t);
    }
    this.inputBuffer.set(fromSlot, input);
  }

  /**
   * Write buffered remote inputs to the corresponding agent controllers.
   * Called every frame BEFORE the engine's simulation step.
   * The engine's _updateRemoteHuman(p, dt) then reads controller.input to
   * move the player.
   */
  _applyRemoteInputs() {
    for (const [slot, input] of this.inputBuffer) {
      const player = this.game.players[slot];
      if (!player?.controller) continue;
      // Only write to controllers we've marked as remote-human.
      if (!player.controller.isRemote) continue;
      const inp = player.controller.input;
      inp.ax = Number(input?.ax) || 0;
      inp.az = Number(input?.az) || 0;
      const btn = input?.buttons || {};
      inp.shoot = !!btn.shoot;
      inp.pass = !!btn.pass;
      inp.tackle = !!btn.tackle;
      inp.dash = !!btn.dash;
      inp.sprint = !!btn.sprint;
      inp.release = !!btn.release;
      inp.charge = Number(input?.charge) || 0;
      if (typeof input?.seq === "number") {
        this.lastAppliedSeq.set(slot, input.seq);
      }
    }
    this.inputBuffer.clear();
  }

  /**
   * Called when the match ends — broadcasts final standings + MVP to all
   * clients via roomClient.sendResult(). The server transitions the room
   * state to "ended" on receipt.
   */
  sendResult() {
    const g = this.game;
    if (!g?.players) return;
    const ps = g.snapshot?.playerStats || {};
    const standings = g.players
      .filter((p) => !p.keeper)
      .map((p) => {
        const key = `${p.team}-${p.formationIdx}`;
        const s = ps[key] || {};
        return {
          name:
            p.controller?.isLocal || p.hero
              ? g._profileName || "JUGADOR"
              : p.controller?.isRemote
              ? p.controller.clientId || `REMOTE#${p.formationIdx}`
              : p.baseRole || `#${p.number}`,
          team: p.team,
          role: p.baseRole,
          pr: Math.max(0, p.controller?.pr || 0),
          goals: s.goals || 0,
          assists: s.assists || 0,
          tackles: s.tacklesWon || 0,
          saves: s.saves || 0,
          passes: s.passes || 0,
          shots: s.shots || 0,
        };
      })
      .sort((a, b) => b.pr - a.pr);
    const mvp = standings[0]?.name || "";
    this.rc.sendResult({ type: "result", standings, mvp });
  }
}

// ========================================================== CLIENT SIDE ====

/**
 * ClientSync: client-side prediction + input replay + interpolation.
 *
 * ARCHITECTURE:
 *   - The guest PREDICTS their own player locally (_movePlayer) for instant
 *     input response, and sends input @30Hz with seq numbers.
 *   - The host echoes the last input seq it processed per slot (`state.acks`).
 *   - On every received state, reconciliation drops the acked inputs, builds
 *     a replay target from the host's authoritative position, then pays the
 *     error down at a bounded visual speed. The mesh is never snapped on a
 *     network callback, so local input remains responsive and corrections are
 *     visible as natural steering rather than rubber-banding.
 *   - OTHER players + the ball are interpolated from host snapshots.
 */
export class ClientSync {
  /**
   * @param {RoomClient} roomClient — connected WebSocket client (non-host).
   * @param {Game} game — engine instance (scene/camera/ball references only;
   * the client never simulates).
   */
  constructor(roomClient, game) {
    this.rc = roomClient;
    this.game = game;
    /** Local shot-charge tracker (0..1) — the client engine skips the sim
     *  loop, so it never advances game.charge. Mirrors the host's 1.6/s ramp. */
    this._charge = 0;
    this._lastCharge = 0;
    this._chargeStartedAt = 0;
    this._wasHoldingShoot = false;
    this._releasePending = false;
    this._releaseUntil = 0;
    /** Inputs sent but not yet acknowledged by the host (for replay). */
    this.pendingInputs = [];
    // Reconciliation is deliberately rendered as a bounded correction rather
    // than a position snap. The guest keeps its local prediction responsive;
    // the error is paid down over a few frames while the host remains
    // authoritative.
    this._reconcileError = new THREE.Vector3();
    this._reconcileYawError = 0;
    /** @type {{state: object, timestamp: number}[]} */
    this.stateBuffer = [];
    // State packets may be queued by TCP for a short while on a weak link.
    // Never let an older packet rewind the visual timeline after a newer
    // authoritative tick was already accepted.
    this._lastAcceptedStateSeq = -1;
    this._lastAcceptedServerTick = -1;
    this._oneWayMs = null;
    this.inputInterval = 1 / 30; // 30Hz replay cadence
    this.seq = 0;
    /** Latest received state (for fallback when buffer < 2) */
    this.latestState = null;
    /** Counters for debugging / test assertions */
    this.statesReceived = 0;
    this.inputsSent = 0;
    this.predictions = 0;
    /** Reconciliation stats */
    this.reconciliations = 0;
    this.lastDrift = 0;
    /** Interpolation delay (ms behind real time) for OTHER players + ball.
     *  A little over two 30Hz snapshots keeps the visual timeline continuous
     *  through normal Wi-Fi jitter. The local player is predicted separately
     *  and is therefore unaffected by this delay. */
    this.interpDelayMs = 85;
    this.maxExtrapolationMs = 100;
    // Input transport is wall-clock driven instead of render-frame driven.
    // A software-rendered or background guest can have a slow rAF while its
    // controls remain responsive and continue sending a 30Hz heartbeat.
    this._inputTimer = setInterval(() => this._sendCurrentInput(), 1000 / 30);
    this._lastPredictionAt = null;
    this._predictionTimer = setInterval(() => this._tickPrediction(), 1000 / 60);
  }

  /**
   * Called by RoomClient.onState(state) — buffers the snapshot for
   * interpolation AND reconciles the local player (acks + input replay).
   */
  onState(state) {
    if (!state) return;
    const timestamp =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    // WebSocket normally preserves ordering, but a stale snapshot can still
    // arrive after reconnect/buffering boundaries. Applying it would make a
    // player or the ball visibly jump backwards. Sequence is preferred; the
    // simulation tick is a safe fallback for older hosts.
    const seq = Number(state.seq);
    const serverTick = Number(state.serverTick);
    if (Number.isFinite(seq) && seq <= this._lastAcceptedStateSeq) return;
    if (!Number.isFinite(seq) && Number.isFinite(serverTick) && serverTick <= this._lastAcceptedServerTick) return;
    if (Number.isFinite(seq)) this._lastAcceptedStateSeq = seq;
    if (Number.isFinite(serverTick)) this._lastAcceptedServerTick = serverTick;

    netDiag.onState(state);
    this.statesReceived++;
    this.latestState = state;

    // State.pings carries this guest's own monotonic input timestamp. It is a
    // real RTT sample, so half of it is a much better short projection than
    // trying to compare performance.now() clocks from different browsers.
    const mySlot = this.rc?.mySlot;
    const echoedPing = typeof mySlot === "number"
      ? state.pings?.[mySlot] ?? state.ping
      : state.ping;
    if (Number.isFinite(echoedPing)) {
      const rtt = timestamp - echoedPing;
      if (rtt >= 0 && rtt < 2000) {
        const sample = Math.min(160, rtt * 0.5);
        this._oneWayMs = this._oneWayMs == null
          ? sample
          : this._oneWayMs * 0.8 + sample * 0.2;
      }
    }

    const serverTime = Number(state.serverTime);
    this.stateBuffer.push({
      state,
      timestamp,
      serverTime: Number.isFinite(serverTime) ? serverTime : null,
    });
    // Trim buffer to ~1s of history. Keep at least 2 for interpolation.
    const cutoff = timestamp - 1000;
    while (this.stateBuffer.length > 2 && this.stateBuffer[0].timestamp < cutoff) {
      this.stateBuffer.shift();
    }
    // Hard cap at 60 entries (~2s at 30Hz) to bound memory.
    if (this.stateBuffer.length > 60) {
      this.stateBuffer.splice(0, this.stateBuffer.length - 60);
    }
    // Reconcile our predicted player against this authoritative state.
    this._reconcile(state);
  }

  /**
   * Reconciliation: the host is authoritative, but the guest predicts their
   * own player locally for instant response. Every received state we:
   *   1. drop inputs the host already processed (seq <= state.acks[slot]),
   *   2. build a replay target from the host's position,
   *   3. apply that target through a bounded visual correction.
   * The target is applied gradually, so correction converges without
   * teleporting the visible player.
   *
   * @param {object} state — authoritative state from host
   */
  _reconcile(state) {
    if (!this.game) return;
    const mySlot = this.rc?.mySlot;
    if (typeof mySlot !== "number") return;
    const players = state.players;
    if (!Array.isArray(players) || !players[mySlot]) return;
    const localPlayer = this.game.players[mySlot];
    if (!localPlayer?.mesh) return;

    const hostP = players[mySlot];
    const dx = (hostP.x || 0) - localPlayer.mesh.position.x;
    const dz = (hostP.z || 0) - localPlayer.mesh.position.z;
    this.lastDrift = Math.sqrt(dx * dx + dz * dz);

    // 1. Drop inputs the host has already processed.
    const ack = state.acks != null ? Number(state.acks[mySlot]) : NaN;
    if (!Number.isNaN(ack)) {
      netDiag.onAck(ack);
      while (this.pendingInputs.length && this.pendingInputs[0].seq <= ack) {
        this.pendingInputs.shift();
      }
    }

    // 2. Build a predicted target from the authoritative base without
    // touching the visible player. The previous implementation moved the
    // real mesh to the host position on every packet, which caused visible
    // rubber-banding even when input replay was correct.
    const currentPos = localPlayer.mesh.position.clone();
    const currentYaw = localPlayer.mesh.rotation.y;
    const hostYaw = typeof hostP.yaw === "number" ? hostP.yaw : currentYaw;
    const hostSpeed = Number(hostP.speed) || 0;
    const replayPos = new THREE.Vector3(Number(hostP.x) || 0, Number(hostP.y) || 0, Number(hostP.z) || 0);
    const replayVel = new THREE.Vector3(
      Math.sin(hostYaw) * hostSpeed,
      0,
      Math.cos(hostYaw) * hostSpeed
    );
    let replayYaw = hostYaw;

    // The position in a state is already old by the time it arrives. Project
    // it through the measured one-way delivery age before replaying
    // unacknowledged inputs; otherwise every packet would pull a running
    // guest backwards by one network round-trip and create rubber-banding.
    if (this._oneWayMs != null) {
      const age = Math.max(0, Math.min(0.16, this._oneWayMs / 1000));
      replayPos.x += replayVel.x * age;
      replayPos.z += replayVel.z * age;
    }

    // One packet represents a sampled input state, so replay at the same
    // 30Hz cadence as the wire. Cap only the simulation work; packets remain
    // pending until the host acknowledges them.
    // Replay the complete unacknowledged command history (the queue is
    // bounded to 90 packets). Replaying only the last 30 commands made a
    // delayed connection lose the first second of movement and then correct
    // the guest toward an incomplete target.
    const replayInputs = this.pendingInputs.slice(-120);
    let previousSentAt = replayInputs.length
      ? Number(replayInputs[0].sentAt) - this.inputInterval * 1000
      : 0;
    let replayBudget = 0.25;
    for (const pending of replayInputs) {
      const sentAt = Number(pending.sentAt);
      let replayDt = this.inputInterval;
      if (Number.isFinite(sentAt) && Number.isFinite(previousSentAt)) {
        replayDt = Math.max(1 / 120, Math.min(0.05, (sentAt - previousSentAt) / 1000));
      }
      previousSentAt = Number.isFinite(sentAt) ? sentAt : previousSentAt + replayDt * 1000;
      replayDt = Math.min(replayDt, replayBudget);
      if (replayDt <= 0) break;
      replayYaw = this._simulateNetworkMove(
        localPlayer,
        replayPos,
        replayVel,
        replayYaw,
        pending,
        replayDt
      ).yaw;
      replayBudget -= replayDt;
    }

    // Do not copy the visible mesh on every authoritative packet. That was
    // the direct source of the guest's "teleport / rubber-band" feel. Small
    // disagreement is paid down by predictLocalPlayer() at a bounded rate;
    // only a genuine reset (goal, kickoff, respawn) is large enough to snap.
    const correctionX = replayPos.x - currentPos.x;
    const correctionZ = replayPos.z - currentPos.z;
    const correction = Math.hypot(correctionX, correctionZ);
    const hardReset = correction > 6;
    this.lastCorrection = correction;
    this.lastDrift = correction;
    if (hardReset) {
      localPlayer.mesh.position.copy(replayPos);
      localPlayer.vel.copy(replayVel);
      localPlayer.speed = Math.hypot(replayVel.x, replayVel.z);
      localPlayer.mesh.rotation.y = replayYaw;
      localPlayer.heading = replayYaw;
      this._reconcileError.set(0, 0, 0);
      this._reconcileYawError = 0;
    } else {
      this._reconcileError.set(correctionX, 0, correctionZ);
      this._reconcileYawError = this._shortAngle(replayYaw - currentYaw);
      if (localPlayer.vel?.lerp) localPlayer.vel.lerp(replayVel, 0.18);
      localPlayer.speed = Math.hypot(localPlayer.vel?.x || 0, localPlayer.vel?.z || 0);
    }
    this._authoritativeY = replayPos.y;
    this._hasAuthority = true;
    this.reconciliations++;
  }

  _shortAngle(angle) {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  /** Simulate only the normal movement path for input replay. It mirrors the
   * engine's acceleration curve but has no VFX/audio side effects. */
  _simulateNetworkMove(p, pos, vel, yaw, input, dt) {
    const rawX = Number(input?.ax) || 0;
    const rawZ = Number(input?.az) || 0;
    const len = Math.hypot(rawX, rawZ);
    const dirX = len > 1 ? rawX / len : rawX;
    const dirZ = len > 1 ? rawZ / len : rawZ;
    const moving = dirX * dirX + dirZ * dirZ > 0.0001;
    const sprint = !!input?.buttons?.sprint;
    const effects = this.game?.effects?.[p.team] || {};
    const mul = effects.bolt > 0 ? 1.3 : effects.slow > 0 ? 0.58 : 1;
    const base = (p.keeper ? 8 : 11.6) * mul;
    const max = sprint ? base * 1.5 : base;
    const prevSpeed = Math.hypot(vel.x, vel.z);
    const reversing = moving && vel.x * dirX + vel.z * dirZ < 0;
    let accel;
    if (!moving) accel = 32;
    else if (reversing) accel = 22;
    else if (sprint) accel = 8 + (prevSpeed / Math.max(max, 0.001)) * 10;
    else accel = 14 + (prevSpeed / Math.max(max, 0.001)) * 8;
    const k = 1 - Math.exp(-accel * dt);
    vel.x += (dirX * max - vel.x) * k;
    vel.z += (dirZ * max - vel.z) * k;
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    pos.x = Math.max(-FIELD.L / 2 - 2, Math.min(FIELD.L / 2 + 2, pos.x));
    pos.z = Math.max(-FIELD.W / 2 - 2, Math.min(FIELD.W / 2 + 2, pos.z));
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 0.6) yaw = Math.atan2(vel.x, vel.z);
    return { yaw, speed };
  }

  /**
   * Predict the local player's movement using current input.
   * Called from a wall-clock client tick. This gives instant response even
   * when WebGL briefly drops below the display refresh rate — the guest does
   * not wait for a host round-trip to see their own movement.
   *
   * @param {number} dt — frame delta in seconds
   */
  _tickPrediction() {
    if (!this.game || this.game.networkMode !== "client") return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this._lastPredictionAt == null) {
      this._lastPredictionAt = now;
      return;
    }
    // A throttled timer can wake with a 100–300ms gap. Simulate that elapsed
    // time in fixed substeps instead of clamping it to 50ms (which made a
    // guest move at a fraction of the host's speed under render pressure).
    const elapsed = Math.max(0, Math.min((now - this._lastPredictionAt) / 1000, 0.5));
    this._lastPredictionAt = now;
    if (elapsed <= 0) return;
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 60)));
    const step = elapsed / steps;
    for (let i = 0; i < steps; i++) this.predictLocalPlayer(step);
    this.predictions += 1;
    netDiag.markPrediction();
  }

  predictLocalPlayer(dt) {
    if (!this.game || this.game.paused || this.game.matchEnded) return;
    const mySlot = this.rc?.mySlot;
    if (typeof mySlot !== "number") return;
    const p = this.game.players[mySlot];
    if (!p?.mesh) return;

    // Resolve movement through the engine's camera basis, exactly like the
    // host-side local controller. This also supports POV, arrows and stick
    // input instead of hard-coding WASD as world axes.
    const dir = this.game._inputDir
      ? this.game._inputDir(p)
      : new THREE.Vector3(
          (this.game.keys?.d ? 1 : 0) - (this.game.keys?.a ? 1 : 0),
          0,
          (this.game.keys?.s ? 1 : 0) - (this.game.keys?.w ? 1 : 0)
        );
    const dtSafe = Math.max(0, Math.min(Number(dt) || 0, 0.05));
    const sprint = !!(this.game.holdSprint || this.game.keys?.shift) &&
                   (p.controller?.stamina > 0.02 || this.game._eff?.(p.team, "bolt"));

    // Predict the same acceleration curve as the host without running the
    // host-only VFX/collision side effects on every guest timer tick. Slides
    // and dashes remain authoritative and are corrected by the next state.
    try {
      if (p.slide > 0 || p.dashT > 0) {
        this.game._movePlayer(p, dir, sprint, dtSafe);
      } else {
        const nextPos = p.mesh.position.clone();
        const nextVel = p.vel.clone();
        const result = this._simulateNetworkMove(
          p,
          nextPos,
          nextVel,
          p.mesh.rotation.y,
          { ax: dir.x, az: dir.z, buttons: { sprint } },
          dtSafe
        );
        p.mesh.position.copy(nextPos);
        p.vel.copy(nextVel);
        p.speed = result.speed;
      }
    } catch (e) {
      // Prediction is visual-only; the host remains authoritative.
    }

    // First visible move after a movement keydown feeds the input-latency
    // measurement in the diagnostics overlay.
    if (dir.lengthSq() > 0.01 && p.speed > 0.4) netDiag.markLocalMove();

    // Update heading to face movement direction
    if (dir.lengthSq() > 0.01) {
      const wantYaw = Math.atan2(dir.x, dir.z);
      // Smoothly turn toward movement direction
      let diff = wantYaw - p.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.mesh.rotation.y += diff * (1 - Math.exp(-12 * dtSafe));
      p.heading = p.mesh.rotation.y;
    }

    // Pay down the latest authority error at a bounded speed. Small errors
    // disappear quickly; a large collision correction cannot teleport the
    // player across the field in one network frame.
    if (this._reconcileError.lengthSq() > 0.000001) {
      const errorLen = this._reconcileError.length();
      const gain = 1 - Math.exp(-14 * dtSafe);
      const maxStep = 12 * dtSafe;
      const amount = Math.min(gain, maxStep / Math.max(errorLen, 0.0001));
      p.mesh.position.x += this._reconcileError.x * amount;
      p.mesh.position.z += this._reconcileError.z * amount;
      this._reconcileError.multiplyScalar(1 - amount);
    }
    if (Math.abs(this._reconcileYawError) > 0.0001) {
      const gain = 1 - Math.exp(-14 * dtSafe);
      const step = this._reconcileYawError * gain;
      p.mesh.rotation.y += step;
      p.heading = p.mesh.rotation.y;
      this._reconcileYawError -= step;
    }
    if (typeof this._authoritativeY === "number" && Math.abs(this._authoritativeY - p.mesh.position.y) > 0.02) {
      p.mesh.position.y += (this._authoritativeY - p.mesh.position.y) * (1 - Math.exp(-18 * dtSafe));
    }

    // Animate the local player (running legs, etc.)
    const animatePlayer = getAnimatePlayerFn();
    if (animatePlayer && p.mesh.userData.legL) {
      const bpos = this.game.ball?.mesh?.position || { x: 0, z: 0 };
      let lookYaw = 0;
      try {
        let a = Math.atan2(bpos.x - p.mesh.position.x, bpos.z - p.mesh.position.z) - p.mesh.rotation.y;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        lookYaw = Math.max(-0.95, Math.min(0.95, a));
      } catch (e) { /* noop */ }
      try {
        animatePlayer(p.mesh, p.speed, dtSafe, p.slide > 0, {
          lookYaw,
          squash: p.squash || 0,
        });
      } catch (e) { /* noop */ }
    }

    // Instante local del HUD de tiro: la barra de carga responde al botón
    // sin esperar el eco del host (el estado del host se pisa con el valor
    // local igualmente, así que no hay conflicto). También reflejamos la
    // carga en game.charge para que la flecha de dirección/fuerza del
    // cliente use el valor local en tiempo real.
    this.game.charge = this._charge || 0;
    if (this.game.snapshot) {
      this.game.snapshot.charging = !!this.game.holdShoot;
      this.game.snapshot.power = this._charge || 0;
    }
  }

  _animateLocalPlayer(dt) {
    const slot = this.rc?.mySlot;
    const p = typeof slot === "number" ? this.game?.players?.[slot] : null;
    if (!p?.mesh?.userData?.legL) return;
    const bpos = this.game?.ball?.mesh?.position || { x: 0, z: 0 };
    let lookYaw = 0;
    try {
      let a = Math.atan2(bpos.x - p.mesh.position.x, bpos.z - p.mesh.position.z) - p.mesh.rotation.y;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      lookYaw = Math.max(-0.95, Math.min(0.95, a));
    } catch (e) { /* noop */ }
    try {
      animatePlayer(p.mesh, p.speed || 0, Math.max(0, Math.min(Number(dt) || 0, 0.05)), p.slide > 0, {
        lookYaw,
        squash: p.squash || 0,
      });
    } catch (e) { /* noop */ }
  }

  /**
   * Called from the client render hook to sample charge/HUD state. Input
   * transport itself runs from the wall-clock 30Hz timer above; the render
   * hook separately reads getInterpolatedState() for remote meshes.
   *
   * @param {number} dt — frame delta in seconds
   * @param {object} keys — game.keys (keydown state, lowercased)
   * @param {{x:number,y:number}} stick — game.stick (gamepad)
   * @param {boolean} holdShoot — game.holdShoot
   * @param {boolean} holdSprint — game.holdSprint
   * @param {number} charge — game.charge (0..1)
   */
  update(dt, keys, stick, holdShoot, holdSprint, charge) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this._sampleCharge(!!holdShoot, now);
    this._animateLocalPlayer(dt);
    // The transport timer reads the live game state, so key transitions do
    // not have to wait for the next rendered frame to be transmitted.
  }

  _sampleCharge(holdShoot, now) {
    if (holdShoot) {
      if (!this._wasHoldingShoot) this._chargeStartedAt = now;
      // Use wall-clock time rather than render frames. A slow guest tab must
      // not turn a 700ms hold into a weak 0.2-power shot.
      this._charge = Math.min(1, Math.max(0, (now - this._chargeStartedAt) / 1000 * 1.6));
      this._lastCharge = this._charge;
      this._releasePending = false;
    } else if (this._wasHoldingShoot) {
      // Keep the release reliable even if the button is released between two
      // render frames. The host must receive the final charge, not a zero.
      this._lastCharge = this._charge;
      this._releasePending = true;
      // Keep the edge in at least four heartbeat windows. A second packet
      // generated by keyup (or a packet already queued in the relay) must not
      // overwrite the release before the host's simulation consumes it.
      this._releaseUntil = now + 140;
    }
    this._wasHoldingShoot = !!holdShoot;
    if (this.game) {
      this.game.charge = this._charge || 0;
      if (this.game.snapshot) {
        this.game.snapshot.charging = !!holdShoot;
        this.game.snapshot.power = this._charge || 0;
      }
    }
  }

  _sendCurrentInput() {
    if (!this.game || this.game.networkMode !== "client") return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const holdShoot = !!this.game.holdShoot;
    this._sampleCharge(holdShoot, now);
    const release = !holdShoot && (this._releasePending || now < this._releaseUntil);
    const packetCharge = holdShoot ? this._charge : release ? this._lastCharge : 0;
    const ok = this._sendInput(
      this.game.keys,
      this.game.stick,
      holdShoot,
      !!this.game.holdSprint,
      packetCharge,
      release
    );
    if (ok && release && now >= this._releaseUntil) {
      this._releasePending = false;
      this._lastCharge = 0;
      this._charge = 0;
    }
  }

  _sendInput(keys, stick, holdShoot, holdSprint, charge, release = false) {
    const k = keys || {};
    const s = stick || { x: 0, y: 0 };
    // Send world-space direction resolved by the same camera basis used for
    // local prediction. Fallback keeps this class usable in unit tests.
    const controlled = this.game?.controlled;
    const worldDir = controlled && this.game?._inputDir
      ? this.game._inputDir(controlled)
      : new THREE.Vector3(((k.d ? 1 : 0) - (k.a ? 1 : 0)) || s.x || 0, 0, ((k.s ? 1 : 0) - (k.w ? 1 : 0)) || s.y || 0);
    const ax = worldDir.x;
    const az = worldDir.z;
    const input = {
      type: "input",
      seq: ++this.seq,
      ax,
      az,
      buttons: {
        shoot: !!holdShoot,
        pass: !!k.q,
        tackle: !!k.e,
        dash: !!k.f,
        sprint: !!holdSprint || !!k.shift,
        release: !!release,
      },
      charge: Number(charge) || 0,
      // Guest monotonic timestamp — echoed back by the host for RTT.
      t: typeof performance !== "undefined" ? performance.now() : Date.now(),
    };
    const ok = this.rc.sendInput(input);
    if (ok) {
      this.inputsSent++;
      // Keep the input until the host acks it (used by _reconcile to replay
      // unacked inputs from the host's authoritative position).
      this.pendingInputs.push({
        seq: this.seq,
        ax,
        az,
        buttons: input.buttons,
        charge: input.charge,
        release: !!release,
        // Input edges can be sent immediately in addition to the 30Hz
        // heartbeat. Keep their real send time so reconciliation does not
        // replay two adjacent edge packets as two full 33ms movement steps.
        sentAt: input.t,
      });
      if (this.pendingInputs.length > 90) {
        this.pendingInputs.splice(0, this.pendingInputs.length - 90);
      }
      netDiag.onSentInput(this.seq);
    }
    return ok;
  }

  dispose() {
    if (this._inputTimer) {
      clearInterval(this._inputTimer);
      this._inputTimer = null;
    }
    if (this._predictionTimer) {
      clearInterval(this._predictionTimer);
      this._predictionTimer = null;
    }
  }

  /**
   * Get the interpolated state for rendering behind the host timeline.
   * Returns null if the buffer doesn't have at least 2 states yet.
   * Falls back to the latest state if interpolation isn't possible.
   *
   * CRITICAL: never returns null if latestState exists — the client render
   * hook relies on a non-null return to apply state to meshes. Returning
   * null would leave the meshes at their initial positions (frozen).
   */
  getInterpolatedState() {
    // Always fall back to latestState if interpolation isn't possible.
    if (this.stateBuffer.length < 2) {
      return this.latestState;
    }
    const newest = this.stateBuffer[this.stateBuffer.length - 1];
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    // Interpolate on the host simulation clock, not on local arrival times.
    // A Wi-Fi packet that arrives 40ms late must not stretch the visual
    // timeline and make every remote player stutter. We estimate the current
    // host tick from the newest packet and then sample a small stable buffer
    // behind it.
    if (Number.isFinite(newest.serverTime)) {
      const elapsedSinceNewest = Math.max(0, Math.min(250, now - newest.timestamp)) / 1000;
      const renderServerTime = newest.serverTime + elapsedSinceNewest - this.interpDelayMs / 1000;
      for (let i = 0; i < this.stateBuffer.length - 1; i++) {
        const s1 = this.stateBuffer[i];
        const s2 = this.stateBuffer[i + 1];
        if (!Number.isFinite(s1.serverTime) || !Number.isFinite(s2.serverTime)) continue;
        if (s1.serverTime <= renderServerTime && renderServerTime <= s2.serverTime) {
          const span = s2.serverTime - s1.serverTime || 1 / 60;
          const t = Math.max(0, Math.min(1, (renderServerTime - s1.serverTime) / span));
          return this._lerpStates(s1.state, s2.state, t);
        }
      }
      if (renderServerTime < this.stateBuffer[0].serverTime) {
        return this.stateBuffer[0].state;
      }
      const age = Math.max(0, Math.min(
        this.maxExtrapolationMs / 1000,
        renderServerTime - newest.serverTime
      ));
      return age > 0 ? this._extrapolateState(newest.state, age) : newest.state;
    }

    // Backward-compatible fallback for old hosts that do not include the
    // simulation clock. This path still uses local arrival timestamps.
    const renderAt = now - this.interpDelayMs;
    for (let i = 0; i < this.stateBuffer.length - 1; i++) {
      const s1 = this.stateBuffer[i];
      const s2 = this.stateBuffer[i + 1];
      if (s1.timestamp <= renderAt && renderAt <= s2.timestamp) {
        const span = s2.timestamp - s1.timestamp || 1;
        const t = Math.max(0, Math.min(1, (renderAt - s1.timestamp) / span));
        return this._lerpStates(s1.state, s2.state, t);
      }
    }
    const age = Math.max(0, Math.min(
      this.maxExtrapolationMs / 1000,
      (renderAt - newest.timestamp) / 1000
    ));
    return age > 0 ? this._extrapolateState(newest.state, age) : newest.state;
  }

  _extrapolateState(state, dt) {
    if (!state) return state;
    const players = Array.isArray(state.players)
      ? state.players.map((p) => {
          if (!p || !Number.isFinite(p.yaw) || !Number.isFinite(p.speed)) return p;
          return {
            ...p,
            x: (Number(p.x) || 0) + Math.sin(p.yaw) * p.speed * dt,
            z: (Number(p.z) || 0) + Math.cos(p.yaw) * p.speed * dt,
          };
        })
      : state.players;
    const ball = state.ball
      ? {
          ...state.ball,
          x: (Number(state.ball.x) || 0) + (Number(state.ball.vx) || 0) * dt,
          z: (Number(state.ball.z) || 0) + (Number(state.ball.vz) || 0) * dt,
        }
      : state.ball;
    return { ...state, players, ball };
  }

  /**
   * Linear interpolation between two states. Lerps player positions and
   * ball position; carries forward the rest (score, clock, etc.) from s2.
   */
  _lerpStates(s1, s2, t) {
    if (!s1 || !s2) return s2 || s1 || null;
    const p1 = Array.isArray(s1.players) ? s1.players : [];
    const p2 = Array.isArray(s2.players) ? s2.players : [];
    const players = p2.map((p2p, i) => {
      const p1p = p1[i];
      if (!p1p) return p2p;
      return {
        ...p2p,
        x: p1p.x + (p2p.x - p1p.x) * t,
        z: p1p.z + (p2p.z - p1p.z) * t,
        y: (p1p.y || 0) + ((p2p.y || 0) - (p1p.y || 0)) * t,
        // Turning across -PI/PI must take the short arc. Linear interpolation
        // here was the subtle "spin then snap" seen on remote players.
        yaw: this._lerpAngle(Number(p1p.yaw), Number(p2p.yaw), t),
      };
    });
    const b1 = s1.ball || {};
    const b2 = s2.ball || {};
    return {
      ...s2,
      players,
      ball: {
        x: (b1.x || 0) + ((b2.x || 0) - (b1.x || 0)) * t,
        z: (b1.z || 0) + ((b2.z || 0) - (b1.z || 0)) * t,
        y: (b1.y || 0) + ((b2.y || 0) - (b1.y || 0)) * t,
        // Carry forward velocity from s2 (latest) for ball rotation synthesis.
        // Velocity doesn't need interpolation — it's used for visual spin only.
        vx: b2.vx || 0,
        vz: b2.vz || 0,
      },
    };
  }

  _lerpAngle(from, to, t) {
    if (!Number.isFinite(from)) return Number.isFinite(to) ? to : 0;
    if (!Number.isFinite(to)) return from;
    let delta = to - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * t;
  }
}

// ============================================== CLIENT RENDER HELPERS ====

// Import animatePlayer at module level. sync.js and player.js don't have a
// circular dependency (player.js doesn't import sync.js), so this is safe.
import { animatePlayer } from "./player";

// Track previous goal state so we can fire FX (confetti, sparks) only on
// the rising edge of goalCooldown (i.e., when a new goal just happened).
let _prevGoalCooldown = 0;

/**
 * Apply a received (interpolated) state to the engine's Three.js scene.
 * Writes positions/rotations to player and ball meshes; does NOT run any
 * simulation. Called every frame from the client render hook.
 *
 * All players (including the local player) are rendered from host state —
 * the host is the single source of truth, so there is no local prediction to
 * preserve. `localSlot` is accepted for backwards compatibility only.
 *
 * @param {Game} game — engine instance (networkMode === "client")
 * @param {object} state — interpolated state from ClientSync.getInterpolatedState()
 * @param {number|null} localSlot — optional slot index to skip (pass null to apply to all)
 * @param {object|null} latestState — newest authoritative state, used for
 *   local HUD/possession so a render buffer never adds delay to the ball leash
 */
export function applyStateToScene(game, state, localSlot = null, renderDt = 1 / 60, latestState = null) {
  if (!game || !state) return;
  const dt = Math.max(0, Math.min(Number(renderDt) || 1 / 60, 0.05));
  const players = state.players;
  if (Array.isArray(players)) {
    if (!Array.isArray(game.players) || game.players.length === 0) return;
    const bpos = game.ball?.mesh?.position || { x: 0, z: 0 };
    for (let i = 0; i < players.length && i < game.players.length; i++) {
      // SKIP the local player — it's predicted separately
      if (i === localSlot) continue;
      const p = game.players[i];
      const sp = players[i];
      if (!p || !sp) continue;
      if (!p.mesh) continue;
      if (typeof sp.x === "number") p.mesh.position.x = sp.x;
      if (typeof sp.z === "number") p.mesh.position.z = sp.z;
      if (typeof sp.y === "number") p.mesh.position.y = sp.y;
      if (typeof sp.yaw === "number") p.mesh.rotation.y = sp.yaw;
      p.speed = sp.speed || 0;
      if (typeof sp.yaw === "number") p.heading = sp.yaw;
      p.slide = sp.slide ? 0.5 : 0;
      p.squash = sp.squash || 0;
      if (p.mesh.userData.legL) {
        let lookYaw = 0;
        try {
          let a = Math.atan2(bpos.x - p.mesh.position.x, bpos.z - p.mesh.position.z) - p.mesh.rotation.y;
          while (a > Math.PI) a -= Math.PI * 2;
          while (a < -Math.PI) a += Math.PI * 2;
          lookYaw = Math.max(-0.95, Math.min(0.95, a));
        } catch (e) { /* noop */ }
        try {
          animatePlayer(p.mesh, p.speed, dt, sp.slide, {
            lookYaw,
            squash: sp.squash || 0,
            dive: sp.dive,
            diveSide: sp.diveSide,
          });
        } catch (e) { /* noop */ }
      }
    }
  }
  if (state.ball && game.ball?.mesh) {
    if (typeof state.ball.x === "number") game.ball.mesh.position.x = state.ball.x;
    if (typeof state.ball.z === "number") game.ball.mesh.position.z = state.ball.z;
    if (typeof state.ball.y === "number") game.ball.mesh.position.y = state.ball.y;
    // Synthesize ball rotation from velocity (rolling forward).
    const vx = state.ball.vx || 0;
    const vz = state.ball.vz || 0;
    game.ball.vel.x = vx;
    game.ball.vel.z = vz;
    game.ball.vel.y = 0;
    const shadow = game.ball.shadow;
    if (shadow) {
      shadow.position.x = game.ball.mesh.position.x;
      shadow.position.z = game.ball.mesh.position.z;
      const yFactor = Math.max(0.25, Math.min(1, 1 - ((game.ball.mesh.position.y || 0.36) - 0.36) / 4));
      shadow.scale.set(yFactor, yFactor, 1);
      shadow.material.opacity = 0.32 * yFactor;
    }
    const speed = Math.sqrt(vx * vx + vz * vz);
    if (speed > 0.5) {
      const r = 0.36;
      const dtRot = dt;
      game.ball.mesh.rotation.x += (vz / r) * dtRot;
      game.ball.mesh.rotation.z -= (vx / r) * dtRot;
    }
  }
  if (game.snapshot) {
    if (state.score) game.snapshot.score = state.score;
    if (typeof state.clock === "number") game.snapshot.clock = state.clock;
    if (typeof state.half === "number") game.snapshot.half = state.half;
    if (typeof state.halfLabel === "string") game.snapshot.halfLabel = state.halfLabel;
    if (typeof state.halftime === "boolean") game.snapshot.halftime = state.halftime;
    if (typeof state.halftimeCount === "number") game.snapshot.halftimeCount = state.halftimeCount;
    if (typeof state.paused === "boolean") game.snapshot.paused = state.paused;
    if (state.pauses !== undefined) game.snapshot.pauses = state.pauses;
    if (state.stats) game.snapshot.stats = state.stats;
    if (Array.isArray(state.goals)) game.snapshot.goals = state.goals;
    if (state.heroStats) game.snapshot.heroStats = state.heroStats;
    if (typeof state.matchEnded === "boolean") game.snapshot.matchEnded = state.matchEnded;
    if (typeof state.kickoffCount === "number") game.snapshot.kickoffCount = state.kickoffCount;
    if (typeof state.kickoffGo === "number") game.snapshot.kickoffGo = state.kickoffGo;
    game.snapshot.ball = state.ball || game.snapshot.ball;
    // Power-ups 3D: el cliente refleja los items del host.
    if (Array.isArray(state.powerups) && game.powerups?.syncItems) {
      try { game.powerups.syncItems(state.powerups); } catch (e) { /* noop */ }
    }
    // Minimapa: los jugadores se dibujan desde snapshot.players (el host los
    // calcula cada frame; el cliente los reconstruye desde el estado recibido).
    if (Array.isArray(state.players)) {
      game.snapshot.players = state.players.map((sp, i) => ({
        x: sp?.x ?? 0,
        z: sp?.z ?? 0,
        team: sp?.team || "red",
        keeper: !!sp?.keeper,
        me: i === localSlot,
      }));
    }
    // HUD global (chips de power-ups, toast, barra de posesión + ratings).
    if (Array.isArray(state.chips)) {
      const localTeam = typeof localSlot === "number" ? state.players?.[localSlot]?.team : "red";
      // Host snapshots label chips from the host/red perspective. Rebase the
      // mine/rival flag for a blue guest so its HUD and aura match its own
      // team instead of showing every power-up as an opponent effect.
      game.snapshot.chips = state.chips.map((chip) =>
        localTeam === "blue" ? { ...chip, mine: !chip.mine } : chip
      );
    }
    if (typeof state.superFx === "number") game.snapshot.superFx = state.superFx;
    if (typeof state.flash === "number") game.snapshot.flash = state.flash;
    if (typeof state.slowmo === "number") game.snapshot.slowmo = state.slowmo > 0;
    if (typeof state.shotKind === "string") game.shotKind = state.shotKind;
    if (state.toast !== undefined) game.snapshot.toast = state.toast;
    if (state.ballHolder !== undefined) game.snapshot.ballHolder = state.ballHolder;
    if (state.ballHolderRating !== undefined) game.snapshot.ballHolderRating = state.ballHolderRating;
    if (state.playerRatings) game.snapshot.playerRatings = state.playerRatings;
    if (Array.isArray(state.prSnapshot)) game.snapshot.prSnapshot = state.prSnapshot;
    // HUD del jugador local: stamina, super, cooldowns y posesión vienen del
    // host (su sim es la fuente de verdad).
    if (typeof localSlot === "number" && (latestState?.players?.[localSlot] || state.players?.[localSlot])) {
      // Position/ball rendering stays on the interpolated timeline, but the
      // local player's possession and cooldown HUD should reflect the newest
      // packet. In particular this lets _updateClientVisuals leash a held ball
      // to the predicted player immediately instead of waiting 85ms more.
      const sp = latestState?.players?.[localSlot] || state.players[localSlot];
      const localPlayer = game.players?.[localSlot];
      if (typeof sp.stamina === "number") {
        game.snapshot.stamina = sp.stamina;
        // Keep the prediction's sprint gate in step with the authoritative
        // controller; previously the guest stayed at stamina=1 forever.
        if (localPlayer?.controller) localPlayer.controller.stamina = sp.stamina;
      }
      if (typeof sp.superMeter === "number") {
        game.snapshot.superMeter = sp.superMeter;
        if (localPlayer?.controller) localPlayer.controller.superMeter = sp.superMeter;
      }
      if (localPlayer?.controller) {
        if (typeof sp.cdTackle === "number") localPlayer.controller.tackleCooldown = Math.max(0, sp.cdTackle * 1.15);
        if (typeof sp.cdDash === "number") localPlayer.controller.dashCooldown = Math.max(0, sp.cdDash * 1.0);
        localPlayer.controller.input.charge = Number(sp.power) || 0;
      }
      game.snapshot.hasBall = !!sp.hasBall;
      game.snapshot.charging = !!sp.charging;
      game.snapshot.power = Number(sp.power) || 0;
      game.snapshot.cd = {
        tackle: Number(sp.cdTackle) || 0,
        dash: Number(sp.cdDash) || 0,
      };
      game.snapshot.superReady = Number(sp.superMeter) >= 1;
      game.snapshot.tackleReady = Number(sp.cdTackle) <= 0;
    }
    if (state.goalText !== undefined) game.snapshot.goalText = state.goalText;
    if (state.goalScorer !== undefined) game.snapshot.goalScorer = state.goalScorer;
    if (state.goalScorerName !== undefined) game.snapshot.goalScorerName = state.goalScorerName;
    if (state.goalScorerNumber !== undefined) game.snapshot.goalScorerNumber = state.goalScorerNumber;
    if (state.goalScorerHero !== undefined) game.snapshot.goalScorerHero = state.goalScorerHero;
    if (typeof state.goalCooldown === "number") game.goalCooldown = state.goalCooldown;
    if (typeof state.goalCooldown === "number" && state.goalCooldown > 0) game.snapshot.goalText = state.goalText || game.snapshot.goalText;
    if (state.goalCooldown && state.goalCooldown > 0 && _prevGoalCooldown <= 0) {
      const scorer = state.goalScorer;
      if (scorer && game.fx) {
        try {
          const HALF_L = 42;
          const cols = scorer === "red" ? ["#ff2d3c", "#ffd21c", "#ffffff"] : ["#2f74ff", "#ffd21c", "#ffffff"];
          const x = scorer === "red" ? HALF_L - 6 : -HALF_L + 6;
          const bp = state.ball;
          game.fx.confetti(x, 0, cols, 170);
          if (bp) game.fx.sparks(bp.x, 1.2, bp.z, cols[0], 22, 13);
        } catch (e) { /* noop */ }
      }
    }
    _prevGoalCooldown = state.goalCooldown || 0;
    if (state.matchEnded) {
      if (state.winner) game.snapshot.winner = state.winner;
      if (state.playerStats) game.snapshot.playerStats = state.playerStats;
      if (Array.isArray(state.prSnapshot)) game.snapshot.prSnapshot = state.prSnapshot;
      if (state.stats) game.snapshot.stats = state.stats;
      if (state.winner) game.snapshot.winner = state.winner;
    }
  }
}

// Helper to get animatePlayer (used by ClientSync.predictLocalPlayer)
function getAnimatePlayerFn() {
  return animatePlayer;
}
