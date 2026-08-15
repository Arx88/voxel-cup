/**
 * net.js — Voxel Cup multiplayer WebSocket client.
 *
 * Host-authoritative relay client that mirrors the protocol implemented in
 * backend/rooms.py. The backend NEVER simulates football — it only maintains
 * room state (slots + host) and relays messages:
 *
 *   Client → Server:
 *     join            initial handshake (must be the FIRST message)
 *     pick_slot       {team, role} → server reconciles, broadcasts new room state
 *     start           host-only — relayed to all other clients (state → "playing")
 *     input           non-host → relayed to host only (tagged with `from: <slot>`)
 *     state           host-only — relayed to all others (snapshot @20Hz)
 *     event           host-only — relayed to all others (goals, powerups, etc.)
 *     result          host-only — relayed to all others (state → "ended")
 *     leave           graceful disconnect
 *
 *   Server → Client:
 *     room            full room state broadcast (slots, host, mode, rules, state)
 *     start           {seed, config, host, rules}
 *     state           relayed snapshot from host
 *     event           relayed event from host
 *     result          relayed final standings from host
 *     input           (host only) non-host input tagged with `from: <slot>`
 *     error           {error: <reason>}
 *
 * Reconnection: when the WS drops, `connect()` retries up to
 * `MAX_RETRIES` times with exponential backoff. The UI is expected to show
 * "RECONNECTANDO…" while `this.status === 'reconnecting'`.
 */

const BACKEND_URL =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_BACKEND_URL) ||
  ""; // Empty string = same origin (proxy handles /api/* in dev)

const WS_PATH = (code) => `/api/ws/room/${code}`;

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 700;
const MAX_BACKOFF_MS = 8000;
// Snapshots are disposable: preserving old state under TCP congestion makes
// every later input feel delayed. Wait for the socket to drain, then send a
// fresh world instead of building an unbounded stale-state queue.
const MAX_STATE_BUFFERED_BYTES = 128 * 1024;

/** Build the WebSocket URL for a room code. Uses same-origin in dev (proxy),
 *  or BACKEND_URL if explicitly set. */
function buildWsUrl(code) {
  const path = WS_PATH(code);
  if (BACKEND_URL) {
    return httpToWs(BACKEND_URL) + path;
  }
  // Same origin: construct ws:// or wss:// from window.location
  if (typeof window !== "undefined" && window.location) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${path}`;
  }
  return path;
}

export class RoomClient {
  constructor(code, profile) {
    this.code = (code || "").toUpperCase();
    this.profile = profile || null;
    // Connection state
    this.ws = null;
    this.isHost = false;
    this.mySlot = null; // index into slots[]
    this.status = "idle"; // idle | connecting | open | reconnecting | closed | error
    this._retryCount = 0;
    this._reconnectTimer = null;
    this._intentionalClose = false;
    // Latest room state (cached for late subscribers / reconnects)
    this.slots = [];
    this.mode = "3v3";
    this.state = "lobby"; // lobby | playing | ended
    this.rules = {};
    this.hostIndex = null;
    // Public callbacks (assigned by the React component)
    this.onRoom = null; // (roomState) => void
    this.onStart = null; // (config) => void
    this.onState = null; // (snapshot) => void  — from host, 20Hz
    this.onEvent = null; // (event) => void    — from host (goals, powerups, …)
    this.onResult = null; // (standings) => void
    this.onInput = null; // (input, fromSlot) => void — host only, receives non-host input
    this.onClose = null; // () => void
    this.onStatus = null; // (status) => void — connection status changes
    this.onError = null; // (errString) => void
  }

  // -------------------------------------------------------------------- status

  _setStatus(next, extra) {
    this.status = next;
    if (this.onStatus) try { this.onStatus(next, extra); } catch (e) { /* noop */ }
  }

  // -------------------------------------------------------------------- connect

  connect() {
    if (typeof window === "undefined" || !window.WebSocket) {
      this._setStatus("error");
      if (this.onError) try { this.onError("no_websocket_support"); } catch (e) {}
      return;
    }
    this._intentionalClose = false;
    this._setStatus(this._retryCount > 0 ? "reconnecting" : "connecting");
    const url = buildWsUrl(this.code);
    let ws;
    try {
      ws = new window.WebSocket(url);
    } catch (err) {
      this._setStatus("error");
      if (this.onError) try { this.onError("websocket_construct_failed"); } catch (e) {}
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this._retryCount = 0;
      this._setStatus("open");
      // First message MUST be `join`. The server will respond by broadcasting
      // the new room state to everyone (including us).
      this.send({
        type: "join",
        name: this.profile?.name || "Player",
        level: this.profile?.level || 1,
        profile: this.profile || null,
      });
    };

    ws.onmessage = (ev) => this._onMessage(ev);

    ws.onerror = () => {
      // The browser doesn't expose the actual error; we just log and let
      // onclose trigger the reconnect logic.
      if (this.onError) try { this.onError("websocket_error"); } catch (e) {}
    };

    ws.onclose = () => {
      if (this._intentionalClose) {
        this._setStatus("closed");
        if (this.onClose) try { this.onClose(); } catch (e) {}
        return;
      }
      // Unintentional close → try to reconnect.
      this._scheduleReconnect();
    };
  }

  _scheduleReconnect() {
    if (this._retryCount >= MAX_RETRIES) {
      this._setStatus("error");
      if (this.onError) try { this.onError("max_retries_exceeded"); } catch (e) {}
      if (this.onClose) try { this.onClose(); } catch (e) {}
      return;
    }
    this._retryCount += 1;
    this._setStatus("reconnecting");
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, this._retryCount - 1));
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, backoff);
  }

  // -------------------------------------------------------------------- send

  send(msg) {
    if (!this.ws || this.ws.readyState !== window.WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch (e) {
      return false;
    }
  }

  pickSlot(team, role) {
    return this.send({ type: "pick_slot", team, role });
  }

  start(seed, config = {}) {
    // Host-only — the server will reject if we're not the host.
    return this.send({
      type: "start",
      seed: typeof seed === "number" ? seed : Math.floor(Math.random() * 0xffffffff),
      config,
    });
  }

  sendInput(input) {
    // Non-host only — relayed to host. Host's own input never leaves the client.
    return this.send({ type: "input", input });
  }

  sendState(state) {
    if (!this.ws || this.ws.readyState !== window.WebSocket.OPEN) return false;
    if (this.ws.bufferedAmount > MAX_STATE_BUFFERED_BYTES) return false;
    return this.send({ type: "state", state });
  }

  sendEvent(event) {
    return this.send({ type: "event", event });
  }

  sendResult(standings) {
    // Host-only — also transitions room state to "ended".
    return this.send({ type: "result", standings });
  }

  leave() {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      try { this.send({ type: "leave" }); } catch (e) { /* noop */ }
      try { this.ws.close(); } catch (e) { /* noop */ }
      this.ws = null;
    }
    this._setStatus("closed");
    if (this.onClose) try { this.onClose(); } catch (e) {}
  }

  // -------------------------------------------------------------------- receive

  _onMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      return; // ignore non-JSON frames
    }
    if (!msg || typeof msg !== "object" || !msg.type) return;

    switch (msg.type) {
      case "joined": {
        // Authoritative slot assignment from the server. This is sent once
        // right after `join` succeeds, before the first `room` broadcast.
        // We store it so the `room` handler can compute isHost correctly
        // WITHOUT relying on _findMySlot's name-matching heuristic.
        this.mySlot = typeof msg.slot === "number" ? msg.slot : null;
        break;
      }
      case "room": {
        this.slots = Array.isArray(msg.slots) ? msg.slots : [];
        this.mode = msg.mode || this.mode;
        this.state = msg.state || this.state;
        this.rules = msg.rules || {};
        this.hostIndex = msg.host;
        // Determine our own slot. Prefer the authoritative `joined` message
        // (this.mySlot already set). Fall back to _findMySlot ONLY if the
        // server didn't send `joined` (backward-compat with old servers).
        // CRITICAL: _findMySlot no longer falls back to the first human slot
        // (which could be the HOST's slot) — it returns null if no name
        // match is found. This prevents a guest from wrongly thinking
        // they're the host.
        if (this.mySlot == null) {
          const me = this._findMySlot();
          this.mySlot = me?.index ?? null;
        }
        this.isHost = this.hostIndex != null && this.mySlot === this.hostIndex;
        if (this.onRoom) try { this.onRoom(this._publicState()); } catch (e) {}
        break;
      }
      case "start": {
        if (this.onStart) try { this.onStart(msg); } catch (e) {}
        break;
      }
      case "state": {
        if (this.onState) try { this.onState(msg.state); } catch (e) {}
        break;
      }
      case "event": {
        if (this.onEvent) try { this.onEvent(msg.event || msg); } catch (e) {}
        break;
      }
      case "result": {
        if (this.onResult) try { this.onResult(msg.standings || msg); } catch (e) {}
        break;
      }
      case "input": {
        // Host-only: a non-host client's input relayed with `from: <slot>`.
        if (this.onInput) try { this.onInput(msg.input, msg.from); } catch (e) {}
        break;
      }
      case "error": {
        if (this.onError) try { this.onError(msg.error || "unknown"); } catch (e) {}
        break;
      }
      default:
        // Forward-compat: ignore unknown message types.
        break;
    }
  }

  _findMySlot() {
    const myName = (this.profile?.name || "").toUpperCase();
    const myLevel = this.profile?.level || 1;
    if (!this.slots.length) return null;
    // Match by name + level. Do NOT fall back to the first human slot —
    // that could be the HOST's slot, which would make a guest wrongly
    // think they're the host (seeing the ¡ARRANCAR! button and being
    // able to click it). The server sends an authoritative `joined`
    // message with the slot index; this name-matching is only a fallback
    // for old servers that don't send `joined`.
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.type !== "human") continue;
      if (
        (s.name || "").toUpperCase() === myName &&
        Number(s.level || 0) === Number(myLevel)
      ) {
        return { index: i, slot: s };
      }
    }
    return null;
  }

  _publicState() {
    return {
      type: "room",
      code: this.code,
      mode: this.mode,
      state: this.state,
      slots: this.slots,
      host: this.hostIndex,
      rules: this.rules,
    };
  }
}

// ---------------------------------------------------------------- REST helpers

/**
 * Create a new room via POST /api/rooms. Returns {code, mode}.
 * Throws on non-2xx or network error.
 */
export async function createRoom(mode = "3v3") {
  const res = await fetch(`${BACKEND_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`createRoom ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch the public state of a room. Returns null if 404 (room not found).
 */
export async function getRoom(code, opts = {}) {
  const res = await fetch(`${BACKEND_URL}/api/rooms/${encodeURIComponent(code)}`, { signal: opts.signal });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`getRoom ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

/** Build a shareable URL with the room code embedded in the hash. */
export function buildShareLink(code) {
  if (typeof window === "undefined") return `${BACKEND_URL}/#room=${code}`;
  const base = window.location.origin + window.location.pathname;
  return `${base}#room=${code}`;
}

export const BACKEND_BASE_URL = BACKEND_URL;
