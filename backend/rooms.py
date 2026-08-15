"""Voxel Cup multiplayer rooms.

Host-authoritative relay over FastAPI WebSockets. The backend does NOT simulate
football — it only maintains room state (slots + host) and relays messages:

  * Non-host `input`  → relayed to the host only (tagged with sender slot).
  * Host `state`      → relayed to every other client (host already has its own state).
  * Host `event`      → relayed to every other client.
  * Host `start`      → relayed to every other client; transitions room to `playing`.
  * Host `result`     → relayed to every other client; transitions room to `ended`.
  * `pick_slot`       → server reconciles, broadcasts new `room` state to everyone.
  * `leave` / disc.   → server reverts slot to AI, re-promotes host, broadcasts `room`.

Rooms are kept in memory (dict keyed by 4-letter code). A background task
deletes rooms that have been empty for >5 minutes (ROOM_TTL_SECONDS).
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

logger = logging.getLogger("voxel-cup.rooms")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# 4-letter room codes, no ambiguous characters (no O/0/I/1).
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 4

# Rooms with no connected clients are deleted after this many seconds.
ROOM_TTL_SECONDS = 5 * 60

# Idle room sweep cadence (seconds).
CLEANUP_INTERVAL_SECONDS = 60

VALID_MODES = ("2v2", "3v3", "4v4")
# Field players per team (GK is always AI and additional).
FIELD_PLAYERS = {"2v2": 2, "3v3": 3, "4v4": 4}
FIELD_ROLES = ["DEF", "MID", "FWD"]

DEFAULT_RULES: Dict[str, Any] = {
    "duration": 180,           # match length in seconds (default 3 min)
    "powerups": True,
    "botDifficulty": "medium",
}

# Message types that originate from the host and are relayed to everyone else.
_HOST_BROADCAST_TYPES = {"state", "event", "start", "result"}


# ---------------------------------------------------------------------------
# REST request models
# ---------------------------------------------------------------------------

class RoomCreate(BaseModel):
    mode: str = "3v3"


# ---------------------------------------------------------------------------
# Room
# ---------------------------------------------------------------------------

class Room:
    """A single room: slots, host, state. All WebSocket operations are async."""

    def __init__(self, code: str, mode: str = "3v3"):
        if mode not in VALID_MODES:
            raise ValueError(f"Invalid mode: {mode!r} (expected one of {VALID_MODES})")
        self.code: str = code
        self.mode: str = mode
        self.field_players: int = FIELD_PLAYERS[mode]
        # Slot shape: {team, role, type, name, level, ready, profile, ws}
        self.slots: List[Dict[str, Any]] = []
        self.host_ws: Optional[WebSocket] = None
        # lobby | playing | ended
        self.state: str = "lobby"
        self.created_at: float = time.time()
        self.last_activity: float = time.time()
        self.rules: Dict[str, Any] = dict(DEFAULT_RULES)
        # World snapshots are lossy by design: only the newest one is useful.
        # Keeping a per-recipient latest slot prevents a slow WebSocket from
        # making the host's receive loop queue seconds of obsolete football
        # state behind a TCP connection.
        self._pending_states: Dict[WebSocket, str] = {}
        self._state_flush_tasks: Dict[WebSocket, asyncio.Task] = {}
        # Reliable messages and state flushes can originate in different room
        # tasks. Serialize writes per socket so Starlette never sees concurrent
        # websocket.send_text calls for the same client.
        self._send_locks: Dict[WebSocket, asyncio.Lock] = {}
        self._init_slots()

    # ------------------------------------------------------------------ slots

    def _init_slots(self) -> None:
        """Build the default slot table: per team, 1 AI GK + N AI field slots."""
        for team in ("red", "blue"):
            self.slots.append({
                "team": team, "role": "GK", "type": "ai",
                "name": "BOT", "level": 1, "ready": True,
                "profile": None, "ws": None,
            })
            for i in range(self.field_players):
                role = FIELD_ROLES[min(i, len(FIELD_ROLES) - 1)]
                self.slots.append({
                    "team": team, "role": role, "type": "ai",
                    "name": "BOT", "level": 1, "ready": True,
                    "profile": None, "ws": None,
                })

    def _touch(self) -> None:
        self.last_activity = time.time()

    def is_empty(self) -> bool:
        return all(s["ws"] is None for s in self.slots)

    def is_idle(self) -> bool:
        return (time.time() - self.last_activity) > ROOM_TTL_SECONDS

    def _host_index(self) -> Optional[int]:
        if self.host_ws is None:
            return None
        for i, s in enumerate(self.slots):
            if s["ws"] is self.host_ws:
                return i
        return None

    def _slot_index_for_ws(self, ws: WebSocket) -> Optional[int]:
        for i, s in enumerate(self.slots):
            if s["ws"] is ws:
                return i
        return None

    def is_host(self, ws: WebSocket) -> bool:
        return self.host_ws is not None and self.host_ws is ws

    # --------------------------------------------------------------- protocol

    async def join(self, ws: WebSocket, name: str, profile: Any, level: int) -> bool:
        """Replace the first available AI field slot (non-GK) with this client.

        Returns True on success, False if the room is full.
        First client to join becomes the host.
        """
        for slot in self.slots:
            if slot["role"] == "GK":
                continue  # GK is always AI — humans cannot take this slot.
            if slot["type"] == "ai" and slot["ws"] is None:
                slot["type"] = "human"
                slot["name"] = (name or "Player")[:24]
                slot["level"] = int(level) if level else 1
                slot["profile"] = profile
                slot["ready"] = False
                slot["ws"] = ws
                self._touch()
                if self.host_ws is None:
                    self.host_ws = ws
                    logger.info("Room %s: host assigned to %s (%s)",
                                self.code, slot["name"], slot["team"])
                return True
        return False

    async def leave(self, ws: WebSocket) -> None:
        """Revert the slot held by `ws` to AI; promote a new host if needed."""
        self._forget_outbound(ws)
        idx = self._slot_index_for_ws(ws)
        if idx is None:
            return
        slot = self.slots[idx]
        was_host = self.host_ws is ws
        slot["type"] = "ai"
        slot["name"] = "BOT"
        slot["level"] = 1
        slot["ready"] = True
        slot["profile"] = None
        slot["ws"] = None
        self._touch()
        if was_host:
            self.host_ws = None
            # Promote the next connected client (first available).
            # TODO: replace with "best ping" heuristic when ping tracking lands.
            for s in self.slots:
                if s["ws"] is not None:
                    self.host_ws = s["ws"]
                    logger.info("Room %s: host promoted to slot %s (%s)",
                                self.code, s["role"], s["team"])
                    break

    async def pick_slot(self, ws: WebSocket, team: str, role: str) -> bool:
        """Move the client (ws) to the slot identified by (team, role).

        Slot POSITIONS keep their team/role (set by _init_slots); only the
        occupant data (type/name/level/ready/profile/ws) moves. If the target
        slot is occupied by another human, the two occupants are swapped (so
        neither client is kicked). Blocked while a match is in progress
        (state == "playing").
        """
        if self.state == "playing":
            return False
        if team not in ("red", "blue") or role not in FIELD_ROLES:
            return False
        cur_idx = self._slot_index_for_ws(ws)
        if cur_idx is None:
            return False
        target_idx: Optional[int] = None
        for i, s in enumerate(self.slots):
            if s["team"] == team and s["role"] == role:
                target_idx = i
                break
        if target_idx is None or target_idx == cur_idx:
            return False
        # Swap only the occupant fields; team/role stay anchored to position.
        occ_keys = ("type", "name", "level", "ready", "profile", "ws")
        cur = self.slots[cur_idx]
        tgt = self.slots[target_idx]
        cur_occ = {k: cur[k] for k in occ_keys}
        tgt_occ = {k: tgt[k] for k in occ_keys}
        cur.update(tgt_occ)
        tgt.update(cur_occ)
        self._touch()
        return True

    def get_room_state(self) -> Dict[str, Any]:
        """Return the serializable `room` message broadcast to clients."""
        return {
            "type": "room",
            "code": self.code,
            "mode": self.mode,
            "state": self.state,
            "slots": [
                {
                    "team": s["team"],
                    "role": s["role"],
                    "type": s["type"],
                    "name": s["name"],
                    "level": s["level"],
                    "ready": s["ready"],
                }
                for s in self.slots
            ],
            "host": self._host_index(),
            "rules": self.rules,
        }

    # --------------------------------------------------------------- delivery

    def _send_lock(self, ws: WebSocket) -> asyncio.Lock:
        lock = self._send_locks.get(ws)
        if lock is None:
            lock = asyncio.Lock()
            self._send_locks[ws] = lock
        return lock

    def _forget_outbound(self, ws: WebSocket) -> None:
        """Drop pending disposable state and stop its flusher on disconnect."""
        self._pending_states.pop(ws, None)
        task = self._state_flush_tasks.pop(ws, None)
        current = asyncio.current_task()
        if task is not None and task is not current and not task.done():
            task.cancel()
        self._send_locks.pop(ws, None)

    def queue_state(self, ws: WebSocket, payload: str) -> None:
        """Schedule only the newest state for a client, never a backlog."""
        self._pending_states[ws] = payload
        task = self._state_flush_tasks.get(ws)
        if task is None or task.done():
            self._state_flush_tasks[ws] = asyncio.create_task(
                self._flush_latest_state(ws)
            )

    async def _flush_latest_state(self, ws: WebSocket) -> None:
        """Write coalesced snapshots until the recipient has caught up."""
        try:
            while True:
                payload = self._pending_states.pop(ws, None)
                if payload is None:
                    return
                if not await self._safe_send(ws, payload):
                    return
        finally:
            if self._state_flush_tasks.get(ws) is asyncio.current_task():
                self._state_flush_tasks.pop(ws, None)

    def broadcast_state_except(self, message: Dict[str, Any], exclude_ws: WebSocket) -> None:
        """Coalesce host snapshots per recipient instead of serially awaiting them."""
        payload = json.dumps(message)
        for s in list(self.slots):
            ws = s["ws"]
            if ws is not None and ws is not exclude_ws:
                self.queue_state(ws, payload)

    async def _safe_send(self, ws: WebSocket, payload: str) -> bool:
        try:
            async with self._send_lock(ws):
                await ws.send_text(payload)
            return True
        except Exception:
            # Client likely disconnected; revoke their slot.
            try:
                await self.leave(ws)
            except Exception:
                logger.exception("Failed to revoke slot during send failure")
            return False

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """Send a message to every connected client."""
        payload = json.dumps(message)
        for s in list(self.slots):
            if s["ws"] is not None:
                await self._safe_send(s["ws"], payload)

    async def broadcast_except(self, message: Dict[str, Any], exclude_ws: WebSocket) -> None:
        """Send a message to every connected client EXCEPT `exclude_ws`."""
        payload = json.dumps(message)
        for s in list(self.slots):
            if s["ws"] is not None and s["ws"] is not exclude_ws:
                await self._safe_send(s["ws"], payload)

    async def send_to_host(self, message: Dict[str, Any]) -> bool:
        if self.host_ws is None:
            return False
        return await self._safe_send(self.host_ws, json.dumps(message))

    async def send_to(self, ws: WebSocket, message: Dict[str, Any]) -> bool:
        return await self._safe_send(ws, json.dumps(message))


# ---------------------------------------------------------------------------
# RoomManager
# ---------------------------------------------------------------------------

class RoomManager:
    """In-memory registry of all rooms, keyed by 4-letter code."""

    def __init__(self) -> None:
        self.rooms: Dict[str, Room] = {}
        self._lock = asyncio.Lock()

    def _generate_code(self) -> str:
        while True:
            code = "".join(random.choices(CODE_ALPHABET, k=CODE_LENGTH))
            if code not in self.rooms:
                return code

    async def create_room(self, mode: str = "3v3") -> Room:
        if mode not in VALID_MODES:
            raise ValueError(f"Invalid mode: {mode!r}")
        async with self._lock:
            code = self._generate_code()
            room = Room(code=code, mode=mode)
            self.rooms[code] = room
            logger.info("Created room %s (mode=%s)", code, mode)
            return room

    def get(self, code: str) -> Optional[Room]:
        return self.rooms.get(code.upper())

    async def delete(self, code: str) -> None:
        async with self._lock:
            self.rooms.pop(code.upper(), None)

    async def cleanup_idle(self) -> int:
        """Delete rooms that are both empty AND past their TTL. Returns count."""
        async with self._lock:
            to_delete = [
                code for code, room in self.rooms.items()
                if room.is_empty() and room.is_idle()
            ]
            for code in to_delete:
                self.rooms.pop(code, None)
                logger.info("Expired idle room %s", code)
        return len(to_delete)


# Module-level singleton used by the routes below.
manager = RoomManager()


# ---------------------------------------------------------------------------
# Background cleanup task
# ---------------------------------------------------------------------------

_cleanup_task: Optional[asyncio.Task[None]] = None


async def _cleanup_loop() -> None:
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            await manager.cleanup_idle()
        except Exception:  # noqa: BLE001
            logger.exception("Room cleanup loop error")


async def start_cleanup_task() -> None:
    """Idempotently start the idle-room sweeper. Call from FastAPI startup."""
    global _cleanup_task
    if _cleanup_task is None or _cleanup_task.done():
        _cleanup_task = asyncio.create_task(_cleanup_loop())
        logger.info("Room cleanup task started (interval=%ss, ttl=%ss)",
                    CLEANUP_INTERVAL_SECONDS, ROOM_TTL_SECONDS)


async def stop_cleanup_task() -> None:
    """Cancel the sweeper. Call from FastAPI shutdown."""
    global _cleanup_task
    if _cleanup_task is not None:
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
        _cleanup_task = None


# ---------------------------------------------------------------------------
# Origin check for WebSocket (browsers send Origin; non-browser clients don't)
# ---------------------------------------------------------------------------

def _origin_allowed(websocket: WebSocket) -> bool:
    import os
    origin = websocket.headers.get("origin", "").strip()
    if not origin:
        return True  # non-browser client (curl, websockets.py, tests, etc.)
    allowed = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")]
    if "*" in allowed:
        return True
    return origin in allowed


# ---------------------------------------------------------------------------
# Router: REST endpoints
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api", tags=["rooms"])


@router.post("/rooms")
async def create_room_endpoint(payload: RoomCreate) -> Dict[str, Any]:
    """Create a new room. Returns the 4-letter code."""
    if payload.mode not in VALID_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode {payload.mode!r}; expected one of {VALID_MODES}",
        )
    room = await manager.create_room(payload.mode)
    return {"code": room.code, "mode": room.mode}


@router.get("/rooms/{code}")
async def get_room_endpoint(code: str) -> Dict[str, Any]:
    """Check whether a room exists and return its public state."""
    room = manager.get(code)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    state = room.get_room_state()
    return {
        "code": state["code"],
        "mode": state["mode"],
        "state": state["state"],
        "slots": state["slots"],
        "host": state["host"],
        "rules": state["rules"],
    }


# ---------------------------------------------------------------------------
# Router: WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/room/{code}")
async def room_ws(websocket: WebSocket, code: str) -> None:
    """WebSocket relay endpoint. First inbound message MUST be `join`."""
    await websocket.accept()

    # CORS-style origin gate for browser clients.
    if not _origin_allowed(websocket):
        await websocket.send_text(json.dumps(
            {"type": "error", "error": "origin_not_allowed"}
        ))
        await websocket.close()
        return

    code = code.upper()
    room = manager.get(code)
    if room is None:
        await websocket.send_text(json.dumps(
            {"type": "error", "error": "room_not_found", "code": code}
        ))
        await websocket.close()
        return

    ws = websocket
    joined = False
    try:
        # 1. First message must be `join`.
        try:
            raw = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
        except asyncio.TimeoutError:
            # A silent socket is still open, so close it on handshake timeout.
            await ws.close()
            return
        except WebSocketDisconnect:
            # The peer already closed the socket; sending another close frame
            # produces a noisy "websocket.close after close" server error.
            return
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await ws.send_text(json.dumps(
                {"type": "error", "error": "invalid_json"}
            ))
            await ws.close()
            return

        if msg.get("type") != "join":
            await ws.send_text(json.dumps(
                {"type": "error", "error": "must_join_first"}
            ))
            await ws.close()
            return

        name = msg.get("name") or "Player"
        profile = msg.get("profile")
        level = msg.get("level", 1)
        ok = await room.join(ws, name=name, profile=profile, level=level)
        if not ok:
            await ws.send_text(json.dumps(
                {"type": "error", "error": "room_full"}
            ))
            await ws.close()
            return
        joined = True
        # Send a private 'joined' message to the joining client with their
        # authoritative slot index. The client uses this to determine mySlot
        # and isHost WITHOUT relying on name-matching heuristics (which can
        # mis-assign a guest to the host's slot if names are similar or if
        # the room state hasn't propagated yet).
        my_slot = room._slot_index_for_ws(ws)
        await room.send_to(ws, {"type": "joined", "slot": my_slot})
        # Broadcast the new room state to everyone (including the new joiner).
        await room.broadcast(room.get_room_state())

        # 2. Main relay loop.
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            mtype = msg.get("type")
            room._touch()

            if mtype == "leave":
                break

            elif mtype == "pick_slot":
                team = msg.get("team")
                role = msg.get("role")
                await room.pick_slot(ws, team, role)
                await room.broadcast(room.get_room_state())

            elif mtype == "start":
                # Only the host may start a match.
                if not room.is_host(ws):
                    await room.send_to(ws, {"type": "error", "error": "not_host"})
                    continue
                room.state = "playing"
                await room.broadcast_except(
                    {
                        "type": "start",
                        "seed": msg.get("seed"),
                        "config": msg.get("config", {}),
                        "host": room._host_index(),
                        "rules": room.rules,
                    },
                    exclude_ws=ws,
                )

            elif mtype == "input":
                # Non-host input → relay to host only (tag with sender slot).
                if room.is_host(ws):
                    # Host's own input doesn't need to be relayed.
                    continue
                sender = room._slot_index_for_ws(ws)
                if room.host_ws is not None:
                    payload = dict(msg)
                    payload["from"] = sender
                    await room.send_to_host(payload)

            elif mtype in _HOST_BROADCAST_TYPES:
                # state / event / result — host-to-everyone-else relay.
                if not room.is_host(ws):
                    # Non-host trying to broadcast host-only message: ignore.
                    continue
                if mtype == "result":
                    room.state = "ended"
                if mtype == "state":
                    # State is a stream, not a reliable event. Do not await a
                    # slow guest here: that would stop reading the host socket
                    # and make every later input/state arrive stale.
                    room.broadcast_state_except(msg, exclude_ws=ws)
                else:
                    await room.broadcast_except(msg, exclude_ws=ws)

            else:
                # Unknown message type — silently ignore (forward-compat).
                continue

    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.exception("WebSocket error in room %s: %s", code, exc)
    finally:
        if joined:
            await room.leave(ws)
            # Notify remaining clients of the new room state.
            if not room.is_empty():
                await room.broadcast(room.get_room_state())
            else:
                # Room is now empty — schedule deletion (the sweeper will
                # honor the TTL, but we can drop it immediately if you prefer;
                # keeping the TTL lets a brief reconnect reuse the same code).
                pass
        try:
            await ws.close()
        except Exception:
            pass
