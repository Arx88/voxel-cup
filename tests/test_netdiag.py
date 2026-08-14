"""Self-contained test for the network-diagnostics measurement path.

The in-game NetDiag tool (frontend/src/game/diagnostics.js) measures RTT like
this: the guest stamps each input with its local monotonic clock (`t`), the
host echoes that value verbatim in the next `state` (`ping`), and the guest
subtracts `ping` from its own clock. This test verifies that exact data path
through the backend relay — no browser required:

  1. POST /api/rooms          -> create room, get code
  2. host joins               -> receives authoritative `joined` (slot 0, host)
  3. guest joins              -> receives `joined` with its own slot
  4. guest sends `input`{t}   -> relayed to host only (tagged `from`)
  5. host sends `state`{ping=t} -> relayed to guest only
  6. guest computes RTT       -> asserted small and consistent

It also asserts the fields the overlay depends on (seq, serverTime, acks,
players, ball) survive the relay verbatim.

Run:  python tests/test_netdiag.py
"""

from __future__ import annotations

import asyncio
import json
import os
import statistics
import sys
import threading
import time
import urllib.request
from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Fake env BEFORE importing server (which requires MONGO_URL / DB_NAME).
# ---------------------------------------------------------------------------
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "voxel_cup_test")
os.environ.setdefault("CORS_ORIGINS", "*")

BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
BACKEND_DIR = os.path.abspath(BACKEND_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import uvicorn  # noqa: E402
import websockets  # noqa: E402
from server import app  # noqa: E402


HOST = "127.0.0.1"
PORT = 18871
BASE_HTTP = f"http://{HOST}:{PORT}"
BASE_WS = f"ws://{HOST}:{PORT}"


def _now_ms() -> float:
    return time.perf_counter() * 1000.0


class _UvicornThread(threading.Thread):
    def __init__(self) -> None:
        super().__init__(daemon=True)
        self.config = uvicorn.Config(app, host=HOST, port=PORT, log_level="error")
        self.server = uvicorn.Server(self.config)

    def run(self) -> None:
        self.server.run()

    def stop(self) -> None:
        self.server.should_exit = True


def _wait_http() -> None:
    deadline = time.time() + 10
    last = None
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"{BASE_HTTP}/api/health", timeout=1).read()
            return
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.1)
    raise RuntimeError(f"server did not come up: {last}")


def _post_json(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    req = urllib.request.Request(
        f"{BASE_HTTP}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


async def _join(ws: "websockets.WebSocketClientProtocol", name: str) -> Dict[str, Any]:
    """Send the mandatory `join` handshake and return the private `joined` msg."""
    await ws.send(json.dumps({
        "type": "join",
        "name": name,
        "profile": {"kitId": "classic-home", "number": 10},
        "level": 1,
    }))
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        msg = json.loads(raw)
        if msg.get("type") == "joined":
            return msg
        if msg.get("type") == "error":
            raise RuntimeError(f"join failed for {name}: {msg}")
        # room broadcast can arrive before/after joined — keep reading


async def _recv_typed(ws, want_type: str, timeout: float = 5.0) -> Dict[str, Any]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        msg = json.loads(raw)
        if msg.get("type") == want_type:
            return msg
    raise RuntimeError(f"timed out waiting for {want_type!r}")


async def _scenario() -> Dict[str, Any]:
    created = _post_json("/api/rooms", {"mode": "3v3"})
    code = created["code"]

    host_uri = f"{BASE_WS}/api/ws/room/{code}"
    guest_uri = f"{BASE_WS}/api/ws/room/{code}"

    async with websockets.connect(host_uri) as host_ws, \
               websockets.connect(guest_uri) as guest_ws:
        host_joined = await _join(host_ws, "HOST")
        guest_joined = await _join(guest_ws, "GUEST")

        # The first human field slot is the host (red GK is always AI, so
        # the host lands on slot 1). The guest gets its own distinct slot.
        host_slot = host_joined.get("slot")
        guest_slot = guest_joined.get("slot")
        assert isinstance(host_slot, int), host_joined
        assert isinstance(guest_slot, int) and guest_slot != host_slot, guest_joined

        # Drain any pending `room` broadcasts before the measured exchange.
        rtt_samples: List[float] = []
        for i in range(5):
            t = _now_ms()
            # Guest stamps input with its clock and a seq.
            await guest_ws.send(json.dumps({
                "type": "input",
                "seq": i + 1,
                "ax": 0.0,
                "az": -1.0,
                "buttons": {"shoot": False, "pass": False, "tackle": False,
                            "dash": False, "sprint": False, "release": False},
                "charge": 0.0,
                "t": t,
            }))

            # Host receives the relayed input (with `from` = guest slot) and
            # echoes the guest timestamp back as `ping`.
            relayed = await _recv_typed(host_ws, "input")
            assert relayed.get("from") == guest_slot, relayed
            assert abs(relayed.get("t", 0) - t) < 1e-6, relayed

            state = {
                "type": "state",
                "seq": i + 1,
                "ping": relayed["t"],
                "serverTime": 12.34,
                "serverTick": 740,
                "players": [{"id": j, "x": j, "z": j * 2, "yaw": 0.0,
                             "speed": 0.0, "team": "red" if j < 4 else "blue",
                             "role": "MID", "keeper": False}
                            for j in range(8)],
                "ball": {"x": 1.0, "z": 2.0, "y": 0.36, "vx": 0.0, "vz": 0.0},
                "acks": {guest_slot: i + 1},
            }
            await host_ws.send(json.dumps(state))

            # Guest receives the host state and computes RTT.
            received = await _recv_typed(guest_ws, "state")
            rtt = _now_ms() - received["ping"]
            rtt_samples.append(rtt)
            assert received["seq"] == i + 1
            assert received["serverTime"] == 12.34
            assert received["acks"][str(guest_slot)] == i + 1
            assert len(received["players"]) == 8
            assert received["ball"]["x"] == 1.0

        return {
            "code": code,
            "host_slot": host_slot,
            "guest_slot": guest_slot,
            "rtt_samples": rtt_samples,
            "rtt_mean": statistics.mean(rtt_samples),
            "rtt_max": max(rtt_samples),
        }


def main() -> int:
    server_thread = _UvicornThread()
    server_thread.start()
    try:
        _wait_http()
        result = asyncio.run(_scenario())
    finally:
        server_thread.stop()

    samples = result["rtt_samples"]
    mean = result["rtt_mean"]
    worst = result["rtt_max"]
    print("=" * 60)
    print("NETDIAG relay/RTT path — OK")
    print(f"  room code  : {result['code']}")
    print(f"  host slot  : {result['host_slot']}")
    print(f"  guest slot : {result['guest_slot']}")
    print(f"  RTT samples: {[round(s, 2) for s in samples]} ms")
    print(f"  RTT mean   : {mean:.2f} ms")
    print(f"  RTT worst  : {worst:.2f} ms")
    print("=" * 60)

    # Local relay must be fast and stable; anything over 50ms means the
    # measurement path (or the relay) is broken on loopback.
    if worst > 50:
        print(f"FAIL: loopback RTT too high ({worst:.2f} ms > 50 ms)")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
