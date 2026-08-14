/**
 * diagnostics.js — self-contained Voxel Cup network/input diagnostics.
 *
 * Feeds a live snapshot of multiplayer timing to window.__netDiag (and to any
 * subscribed UI, e.g. NetDiagHud). It does NOT run the game: it only samples
 * counters exposed by engine/sync and computes derived timing.
 *
 * Measured metrics
 *   - loopRate / renderRate : engine loop calls and WebGL renders per second.
 *   - stateRate / inputRate : host snapshots received / inputs sent per second.
 *   - rtt / oneWay         : real round-trip from a guest input timestamp that
 *                            the host echoes back verbatim (no clock sync).
 *   - keyToLocalMove       : wall-clock ms between a movement keydown and the
 *                            first visible local prediction move.
 *   - keyToAck             : wall-clock ms between a movement keydown and the
 *                            host acknowledging the input that followed it.
 *   - ackSeq / mySeq       : last acknowledged input seq vs last sent seq.
 *   - pending              : inputs sent but not yet acknowledged.
 *   - correction / drift   : last positional correction applied from authority,
 *                            and current local-vs-authoritative distance.
 *   - stateGaps            : cumulative missing host snapshots (seq jumps).
 *   - hostRate             : host simulation seconds per real second (detects
 *                            a background-tab / throttled host).
 *
 * Enabled via the `#netdiag` URL hash or by calling toggle() (F3 in game).
 */

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const MOVEMENT = /^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright|stick)$/i;

class NetDiagnostics {
  constructor() {
    this.enabled =
      typeof window !== "undefined" && /[#&]netdiag/.test(window.location.hash);
    this.host = false;
    this.snapshot = { enabled: this.enabled, isHost: false };

    this._game = null;
    this._clientSync = null;
    this._hostSync = null;

    // Raw counters (incremented from engine/sync hooks).
    this._frames = 0;
    this._renders = 0;
    this._preds = 0;
    this._states = 0;
    this._inputs = 0;

    // Sampling baseline.
    this._lastSampleAt = now();
    this._lastFrames = 0;
    this._lastRenders = 0;
    this._lastPreds = 0;
    this._lastStates = 0;
    this._lastInputs = 0;
    this._lastGameTime = 0;

    // Input latency bookkeeping.
    this._keyAt = 0;
    this._pendingLocal = false;
    this._pendingAck = false;
    this._keySeq = null;
    this._sentAt = new Map();
    this.keyToLocalMove = null;
    this.keyToAck = null;

    // RTT (guest clock → host echo → guest clock).
    this.rtt = null;

    // State stream integrity.
    this._lastStateSeq = null;
    this.stateGaps = 0;

    this._subs = new Set();
    this._timer = setInterval(() => this._sample(), 500);
  }

  // ------------------------------------------------------------------ wiring

  attach({ game, clientSync = null, hostSync = null, isHost = false }) {
    this._game = game;
    this._clientSync = clientSync;
    this._hostSync = hostSync;
    this.host = !!isHost;
    this._lastGameTime = game?.time || 0;
    this._sample();
  }

  detach() {
    this._game = null;
    this._clientSync = null;
    this._hostSync = null;
  }

  toggle() {
    this.enabled = !this.enabled;
    this._notify();
  }

  subscribe(fn) {
    this._subs.add(fn);
    fn(this.snapshot);
    return () => this._subs.delete(fn);
  }

  unsubscribe(fn) {
    this._subs.delete(fn);
  }

  getSnapshot() {
    return this.snapshot;
  }

  _notify() {
    for (const fn of this._subs) {
      try {
        fn(this.snapshot);
      } catch (e) {
        /* noop */
      }
    }
  }

  // ---------------------------------------------------- engine/sync callbacks

  markFrame() {
    this._frames += 1;
  }

  markRender() {
    this._renders += 1;
  }

  markPrediction() {
    this._preds += 1;
  }

  markInput(label) {
    if (!MOVEMENT.test(String(label || ""))) return;
    this._keyAt = now();
    this._pendingLocal = true;
    this._pendingAck = true;
    this._keySeq = null;
    this.keyToLocalMove = null;
  }

  markLocalMove() {
    if (!this._pendingLocal) return;
    this._pendingLocal = false;
    this.keyToLocalMove = Math.max(0, now() - this._keyAt);
  }

  onSentInput(seq) {
    this._sentAt.set(seq, now());
    while (this._sentAt.size > 240) {
      const first = this._sentAt.keys().next().value;
      this._sentAt.delete(first);
    }
    if (this._pendingAck && this._keySeq == null) this._keySeq = seq;
  }

  onAck(ack) {
    if (ack == null || this._keySeq == null) return;
    const sentAt = this._sentAt.get(this._keySeq);
    if (sentAt != null && ack >= this._keySeq) {
      this.keyToAck = Math.max(0, now() - sentAt);
      this._pendingAck = false;
      this._keySeq = null;
    }
    // Reap acknowledged send timestamps to bound memory.
    for (const seq of [...this._sentAt.keys()]) {
      if (seq <= ack) this._sentAt.delete(seq);
    }
  }

  onState(state) {
    this._states += 1;
    if (state && typeof state.seq === "number") {
      if (this._lastStateSeq != null && state.seq > this._lastStateSeq + 1) {
        this.stateGaps += state.seq - this._lastStateSeq - 1;
      }
      this._lastStateSeq = state.seq;
    }
    if (state && typeof state.ping === "number") {
      const rtt = Math.max(0, now() - state.ping);
      this.rtt = this.rtt == null ? rtt : this.rtt * 0.7 + rtt * 0.3;
    }
  }

  onSentState() {
    this._inputs += 0; // no-op placeholder: state rate is host-side, not guest
  }

  // ----------------------------------------------------------------- sampling

  _sample() {
    const t = now();
    const dt = Math.max(0.001, (t - this._lastSampleAt) / 1000);
    const cs = this._clientSync;
    const hs = this._hostSync;
    const g = this._game;

    const loopRate = (this._frames - this._lastFrames) / dt;
    const renderRate = (this._renders - this._lastRenders) / dt;
    const predRate = (this._preds - this._lastPreds) / dt;
    const stateRate = cs ? (cs.statesReceived - this._lastStates) / dt : 0;
    const inputRate = cs ? (cs.inputsSent - this._lastInputs) / dt : 0;

    let hostRate = null;
    if (this.host && g) {
      hostRate = (g.time - this._lastGameTime) / dt;
    }

    let drift = null;
    let ackSeq = null;
    let mySeq = null;
    let pending = 0;
    let correction = null;
    if (cs) {
      ackSeq = cs.latestState?.acks?.[cs.rc?.mySlot] ?? null;
      mySeq = cs.seq || 0;
      pending = cs.pendingInputs?.length || 0;
      correction = cs.lastCorrection ?? null;
      const slot = cs.rc?.mySlot;
      const hp = cs.latestState?.players?.[slot];
      const mp = g?.players?.[slot]?.mesh?.position;
      if (hp && mp) {
        drift = Math.hypot((hp.x || 0) - mp.x, (hp.z || 0) - mp.z);
      }
    }

    this.snapshot = {
      enabled: this.enabled,
      isHost: this.host,
      loopRate: round(loopRate),
      renderRate: round(renderRate),
      predRate: round(predRate),
      stateRate: round(stateRate),
      inputRate: round(inputRate),
      hostRate: hostRate == null ? null : round(hostRate, 2),
      rtt: this.rtt == null ? null : Math.round(this.rtt),
      oneWay: this.rtt == null ? null : Math.round(this.rtt / 2),
      keyToLocalMove:
        this.keyToLocalMove == null ? null : Math.round(this.keyToLocalMove),
      keyToAck: this.keyToAck == null ? null : Math.round(this.keyToAck),
      ackSeq,
      mySeq,
      pending,
      correction: correction == null ? null : round(correction, 2),
      drift: drift == null ? null : round(drift, 2),
      stateGaps: this.stateGaps,
      statesReceived: cs?.statesReceived || 0,
      inputsSent: cs?.inputsSent || 0,
      hostSeq: hs?.seq || 0,
    };

    this._lastSampleAt = t;
    this._lastFrames = this._frames;
    this._lastRenders = this._renders;
    this._lastPreds = this._preds;
    this._lastStates = cs?.statesReceived || 0;
    this._lastInputs = cs?.inputsSent || 0;
    this._lastGameTime = g?.time || 0;
    this._notify();
  }

  dispose() {
    clearInterval(this._timer);
    this._subs.clear();
  }
}

function round(v, digits = 1) {
  const f = Math.pow(10, digits);
  return Math.round(Number(v) * f) / f;
}

export const netDiag = new NetDiagnostics();

if (typeof window !== "undefined") {
  window.__netDiag = netDiag;
}
