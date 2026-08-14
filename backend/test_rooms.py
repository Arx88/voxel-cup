"""Integration test for Voxel Cup multiplayer rooms.

Boots the FastAPI app on a random port with uvicorn (in a daemon thread),
then connects two WebSocket clients and verifies the relay protocol:

  1. POST /api/rooms          → create room, get code
  2. GET  /api/rooms/{code}   → room exists
  3. Alice joins              → becomes host, receives `room` state
  4. Bob joins                → both receive updated `room` state, Alice host
  5. Alice (host) sends state → Bob receives it; Alice does NOT (no echo)
  6. Bob sends input          → Alice (host) receives it; Bob does NOT
  7. Bob sends pick_slot      → both receive updated `room` state
  8. Alice (host) sends start → Bob receives `start`; Alice does NOT
  9. Alice (host) leaves      → Bob promoted to host, receives updated room
 10. Bob leaves               → room cleanup

Run:  python3 test_rooms.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
import time
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Set fake env vars BEFORE importing server (which requires MONGO_URL/DB_NAME).
# ---------------------------------------------------------------------------
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "voxel_cup_test")
os.environ.setdefault("CORS_ORIGINS", "*")

# Make sure the backend dir is on sys.path so `import server` / `import rooms`
# resolve correctly regardless of the current working directory.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import uvicorn  # noqa: E402
import websockets  # noqa: E402
from server import app  # noqa: E402  (triggers rooms router registration)


HOST = "127.0.0.1"
PORT = 18799
BASE_HTTP = f"http://{HOST}:{PORT}"
BASE_WS = f"ws://{HOST}:{PORT}"


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------

class Fail(Exception):
    pass


def http_post(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_HTTP}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"_status": e.code, "_body": e.read().decode("utf-8", "ignore")}


def http_get(path: str) -> Tuple[int, Dict[str, Any]]:
    req = urllib.request.Request(f"{BASE_HTTP}{path}", method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, {"_body": e.read().decode("utf-8", "ignore")}


def wait_for_server(timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_HTTP}/api/", timeout=1.0) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.1)
    raise Fail(f"Server did not come up within {timeout}s")


def find_slot(slots: List[Dict[str, Any]], name: str) -> Optional[int]:
    for i, s in enumerate(slots):
        if s["name"] == name and s["type"] == "human":
            return i
    return None


# ---------------------------------------------------------------------------
# Test scenarios
# ---------------------------------------------------------------------------

async def recv_json(ws, timeout: float = 3.0) -> Dict[str, Any]:
    raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
    return json.loads(raw)


async def drain(ws, timeout: float = 0.3) -> List[Dict[str, Any]]:
    """Drain any pending messages without blocking."""
    msgs: List[Dict[str, Any]] = []
    while True:
        try:
            msgs.append(await recv_json(ws, timeout=timeout))
        except asyncio.TimeoutError:
            break
    return msgs


async def run_test() -> None:
    print("=" * 60)
    print("Voxel Cup multiplayer rooms — integration test")
    print("=" * 60)

    # 1. Create room via REST.
    body = http_post("/api/rooms", {"mode": "3v3"})
    assert body.get("code"), f"create_room failed: {body}"
    code = body["code"]
    assert len(code) == 4, f"code length != 4: {code!r}"
    assert all(c in "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" for c in code), \
        f"code has ambiguous chars: {code!r}"
    assert body["mode"] == "3v3", f"mode mismatch: {body}"
    print(f"[1] POST /api/rooms → code={code}, mode=3v3  OK")

    # 2. GET /api/rooms/{code}.
    status, body = http_get(f"/api/rooms/{code}")
    assert status == 200, f"get_room failed: {status} {body}"
    assert body["code"] == code
    assert body["state"] == "lobby"
    assert body["host"] is None, f"host should be None for empty room: {body}"
    # 3v3 = 2 teams × (1 GK + 3 field) = 8 slots.
    assert len(body["slots"]) == 8, f"expected 8 slots for 3v3, got {len(body['slots'])}"
    print(f"[2] GET /api/rooms/{code} → exists, 8 slots, no host  OK")

    # 2b. GET on a non-existent room returns 404.
    status, _ = http_get("/api/rooms/ZZZZ")
    assert status == 404, f"expected 404 for unknown room, got {status}"
    print(f"[2b] GET /api/rooms/ZZZZ → 404  OK")

    # 3. Alice joins.
    alice_url = f"{BASE_WS}/api/ws/room/{code}"
    async with websockets.connect(alice_url) as alice, \
               websockets.connect(alice_url) as bob:

        await alice.send(json.dumps({
            "type": "join", "name": "Alice", "profile": {"color": "red"},
            "level": 7,
        }))
        msg = await recv_json(alice)
        # The server sends a private authoritative slot assignment before the
        # first room broadcast. Keep the test aligned with the real protocol.
        assert msg["type"] == "joined", f"expected joined assignment, got {msg}"
        assert isinstance(msg.get("slot"), int), f"joined slot missing: {msg}"
        msg = await recv_json(alice)
        assert msg["type"] == "room", f"expected room state, got {msg}"
        assert msg["host"] is not None, "host should be set after Alice joins"
        alice_slot = find_slot(msg["slots"], "Alice")
        assert alice_slot is not None, "Alice not in slots"
        assert msg["slots"][alice_slot]["type"] == "human"
        assert msg["slots"][alice_slot]["level"] == 7
        assert msg["slots"][alice_slot]["role"] != "GK", \
            "Alice should not be in GK slot"
        assert msg["host"] == alice_slot, "Alice should be the host"
        print(f"[3] Alice joined → slot={alice_slot} ({msg['slots'][alice_slot]['team']}/"
              f"{msg['slots'][alice_slot]['role']}), host={msg['host']}  OK")

        # 4. Bob joins. Both Alice and Bob should receive the new room state.
        await bob.send(json.dumps({
            "type": "join", "name": "Bob", "profile": {"color": "blue"},
            "level": 3,
        }))
        bob_joined = await recv_json(bob, timeout=3.0)
        assert bob_joined["type"] == "joined", f"Bob expected joined assignment, got {bob_joined}"
        assert isinstance(bob_joined.get("slot"), int), f"Bob joined slot missing: {bob_joined}"
        bob_msg = await recv_json(bob, timeout=3.0)
        alice_msg = await recv_json(alice, timeout=3.0)
        assert bob_msg["type"] == "room", f"Bob expected room state, got {bob_msg}"
        assert alice_msg["type"] == "room", f"Alice expected room state, got {alice_msg}"
        bob_slot_b = find_slot(bob_msg["slots"], "Bob")
        bob_slot_a = find_slot(alice_msg["slots"], "Bob")
        assert bob_slot_b is not None and bob_slot_a is not None, "Bob missing from slots"
        assert bob_joined["slot"] == bob_slot_b, "joined slot disagrees with room slot"
        assert bob_slot_b == bob_slot_a, "Bob's slot index disagrees between clients"
        assert alice_msg["host"] == alice_slot, "Alice should still be host"
        assert bob_msg["host"] == alice_slot, "Bob should see Alice as host"
        assert bob_msg["slots"][bob_slot_b]["type"] == "human"
        # Alice should still be in her original slot.
        assert find_slot(alice_msg["slots"], "Alice") == alice_slot
        print(f"[4] Bob joined → slot={bob_slot_a} ({alice_msg['slots'][bob_slot_a]['team']}/"
              f"{alice_msg['slots'][bob_slot_a]['role']}), host={alice_msg['host']}  OK")

        # 5. Alice (host) sends a `state` snapshot.
        snapshot = {
            "type": "state", "seq": 1,
            "players": [{"id": 0, "x": 1.0, "z": 2.0, "yaw": 0.0, "anim": "idle"}],
            "ball": {"x": 0.0, "z": 0.0}, "score": [0, 0], "clock": 90.0,
            "events": [],
        }
        await alice.send(json.dumps(snapshot))
        bob_state = await recv_json(bob, timeout=3.0)
        assert bob_state["type"] == "state", f"Bob expected state, got {bob_state}"
        assert bob_state["seq"] == 1
        assert bob_state["score"] == [0, 0]
        # Alice should NOT receive her own state back.
        alice_drain = await drain(alice, timeout=0.4)
        assert all(m.get("type") != "state" for m in alice_drain), \
            f"Alice should not receive her own state: {alice_drain}"
        print(f"[5] Host `state` → Bob received (seq=1), Alice did NOT echo  OK")

        # 6. Bob (non-host) sends `input`.
        input_msg = {
            "type": "input", "seq": 42, "ax": 0.5, "az": -0.3,
            "buttons": {"shoot": False, "pass": True, "tackle": False,
                        "dash": False, "sprint": False},
            "charge": 0.0,
        }
        await bob.send(json.dumps(input_msg))
        alice_in = await recv_json(alice, timeout=3.0)
        assert alice_in["type"] == "input", f"Alice expected input, got {alice_in}"
        assert alice_in["seq"] == 42
        assert alice_in["from"] == bob_slot_a, \
            f"input.from should be Bob's slot ({bob_slot_a}), got {alice_in.get('from')}"
        assert alice_in["ax"] == 0.5 and alice_in["az"] == -0.3
        assert alice_in["buttons"]["pass"] is True
        # Bob should NOT receive his own input back.
        bob_drain = await drain(bob, timeout=0.4)
        assert all(m.get("type") != "input" for m in bob_drain), \
            f"Bob should not receive his own input: {bob_drain}"
        print(f"[6] Bob `input` → relayed to Alice (from={alice_in['from']}), "
              f"Bob did NOT echo  OK")

        # 7. Alice tries to send `input` (host input is not relayed to anyone).
        await alice.send(json.dumps({**input_msg, "seq": 99}))
        bob_drain2 = await drain(bob, timeout=0.4)
        assert all(m.get("type") != "input" for m in bob_drain2), \
            f"Host input should not be relayed: {bob_drain2}"
        print(f"[7] Host `input` → not relayed (no echo to anyone)  OK")

        # 8. Bob sends `pick_slot` to switch to blue team.
        # First, find a blue field slot that's an AI bot (so we can take it).
        target_slot = None
        for i, s in enumerate(alice_msg["slots"]):
            if s["team"] == "blue" and s["role"] != "GK" and s["type"] == "ai":
                target_slot = (s["team"], s["role"])
                break
        assert target_slot is not None, "No blue AI field slot available"
        await bob.send(json.dumps({
            "type": "pick_slot", "team": target_slot[0], "role": target_slot[1],
        }))
        # Both should receive the new room state.
        bob_room = await recv_json(bob, timeout=3.0)
        alice_room = await recv_json(alice, timeout=3.0)
        assert bob_room["type"] == "room" and alice_room["type"] == "room"
        new_bob_slot_b = find_slot(bob_room["slots"], "Bob")
        new_bob_slot_a = find_slot(alice_room["slots"], "Bob")
        assert new_bob_slot_b is not None and new_bob_slot_a is not None
        assert new_bob_slot_b == new_bob_slot_a
        assert bob_room["slots"][new_bob_slot_b]["team"] == "blue", \
            f"Bob should now be on blue: {bob_room['slots'][new_bob_slot_b]}"
        assert bob_room["slots"][new_bob_slot_b]["role"] == target_slot[1]
        bob_slot_a = new_bob_slot_a  # update for later assertions
        print(f"[8] Bob `pick_slot` → moved to blue/{target_slot[1]} "
              f"(slot={new_bob_slot_a})  OK")

        # 9. Alice (host) sends `start`.
        await alice.send(json.dumps({
            "type": "start", "seed": 12345,
            "config": {"mode": "3v3", "duration": 180},
        }))
        bob_start = await recv_json(bob, timeout=3.0)
        assert bob_start["type"] == "start", f"Bob expected start, got {bob_start}"
        assert bob_start["seed"] == 12345
        assert bob_start["config"]["mode"] == "3v3"
        assert bob_start["host"] == alice_slot
        # Alice should NOT receive her own start.
        alice_drain3 = await drain(alice, timeout=0.4)
        assert all(m.get("type") != "start" for m in alice_drain3), \
            f"Alice should not receive her own start: {alice_drain3}"
        # Room state should now be 'playing'.
        status, body = http_get(f"/api/rooms/{code}")
        assert status == 200
        assert body["state"] == "playing", \
            f"room state should be 'playing' after start, got {body['state']}"
        print(f"[9] Host `start` → Bob received (seed=12345), "
              f"room state now 'playing'  OK")

        # 10. Host sends `result` — room should transition to 'ended'.
        result_msg = {
            "type": "result",
            "standings": [
                {"name": "Alice", "team": "red", "role": "DEF",
                 "pr": 220, "goals": 2, "assists": 0, "tackles": 1, "saves": 0,
                 "xp": 220, "coins": 92},
                {"name": "Bob", "team": "blue", "role": "DEF",
                 "pr": 80, "goals": 0, "assists": 1, "tackles": 2, "saves": 0,
                 "xp": 80, "coins": 43},
            ],
            "mvp": "Alice",
        }
        await alice.send(json.dumps(result_msg))
        bob_result = await recv_json(bob, timeout=3.0)
        assert bob_result["type"] == "result", f"Bob expected result, got {bob_result}"
        assert bob_result["mvp"] == "Alice"
        # Alice should NOT receive her own result.
        alice_drain4 = await drain(alice, timeout=0.4)
        assert all(m.get("type") != "result" for m in alice_drain4)
        status, body = http_get(f"/api/rooms/{code}")
        assert body["state"] == "ended", \
            f"room state should be 'ended' after result, got {body['state']}"
        print(f"[10] Host `result` → Bob received (mvp=Alice), "
              f"room state now 'ended'  OK")

        # 11. Alice (host) leaves → Bob should be promoted to host.
        # Use a `leave` message (graceful close).
        await alice.send(json.dumps({"type": "leave"}))
        # Alice's socket should close.
        try:
            await asyncio.wait_for(alice.recv(), timeout=2.0)
        except (websockets.exceptions.ConnectionClosed, asyncio.TimeoutError):
            pass
        # Bob should receive the updated room state with himself as host.
        bob_promo = await recv_json(bob, timeout=3.0)
        assert bob_promo["type"] == "room", f"Bob expected room state, got {bob_promo}"
        assert bob_promo["host"] == bob_slot_a, \
            f"Bob should be promoted to host (slot {bob_slot_a}), got host={bob_promo['host']}"
        # Alice's old slot should be reverted to AI.
        alice_after = find_slot(bob_promo["slots"], "Alice")
        assert alice_after is None, \
            f"Alice's slot should revert to AI BOT, but found: {bob_promo['slots']}"
        print(f"[11] Host Alice left → Bob promoted to host (slot={bob_slot_a})  OK")

        # 12. Bob leaves — room becomes empty.
        await bob.send(json.dumps({"type": "leave"}))
        try:
            await asyncio.wait_for(bob.recv(), timeout=2.0)
        except (websockets.exceptions.ConnectionClosed, asyncio.TimeoutError):
            pass
        print(f"[12] Bob left → room is empty  OK")

    print()
    print("=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Boot uvicorn in a daemon thread, run the test, tear down.
# ---------------------------------------------------------------------------

def main() -> int:
    config = uvicorn.Config(
        app, host=HOST, port=PORT, log_level="warning",
        lifespan="on",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    try:
        wait_for_server(timeout=10.0)
    except Fail as e:
        print(f"FAIL: server startup — {e}", file=sys.stderr)
        return 2

    try:
        asyncio.run(run_test())
    except (AssertionError, Fail) as e:
        print()
        print("=" * 60)
        print(f"TEST FAILED: {e}")
        print("=" * 60)
        return 1
    except Exception as e:
        import traceback
        print()
        print("=" * 60)
        print(f"UNEXPECTED ERROR: {e}")
        traceback.print_exc()
        print("=" * 60)
        return 3
    finally:
        # Best-effort shutdown.
        try:
            server.should_exit = True
        except Exception:
            pass
        thread.join(timeout=2.0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
