"""Live E2E test for the in-game NetDiag overlay.

This is the final verification step the unit tests (test_netdiag.py) and the
collector test (test_netdiag_browser.py) cannot cover: two REAL Chromium
clients — one host, one guest — connected through the actual backend relay,
playing a real multiplayer match, with the NetDiagHud overlay rendered on top
of the WebGL scene on BOTH clients.

Flow driven through the real UI (no mocks):
  1. both contexts get a saved profile (localStorage) so they land in the Lobby
  2. host clicks "Crear sala"     -> POST /api/rooms -> RoomScreen (isHost)
  3. guest clicks "Unirse con código" -> types the code -> RoomScreen (guest)
  4. host clicks "¡Arrancar!"     -> backend relays `start` -> both go to game
  5. WebGL boots on both; the overlay appears (enabled via the `#netdiag` hash)
  6. guest presses a movement key so real input + ack + RTT flow

Assertions (real, not synthetic):
  - overlay DOM visible on host AND guest (bounding box > 0, not display:none)
  - host:  isHost=true, hostRate sampled
  - guest: isHost=false, stateRate>0, inputRate>0, mySeq>0, ackSeq advances,
           rtt measured from the host's `ping` echo

Prereqs: frontend dev server on :5173 and backend on :8002 (both running).

Run:  python tests/test_netdiag_live.py
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

FRONTEND = "http://localhost:5173"


def _ready(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def _profile_init_script(name: str) -> str:
    profile = {
        "name": name,
        "level": 5,
        "kitId": "classic-home",
        "number": 10,
        "hairStyle": "bowl",
        "hairColor": "#4a2c17",
        "skin": "#e8aa6a",
        "shirt": "#1f5fe0",
        "face": "normal",
        "eyeColor": "#141419",
        "accessory": "none",
        "accColor": "#ffffff",
        "body": "normal",
    }
    return (
        f"localStorage.setItem('voxelcup.profile', {json.dumps(json.dumps(profile))});"
        "localStorage.setItem('voxelcup.onboarded', '1');"
        "localStorage.setItem('voxelcup.muted', '1');"
    )


def _through_splash(page, label: str) -> None:
    """A returning user sees the short splash; press ENTER when it's ready.

    The Enter keydown listener is attached in a React effect that can lag the
    `press-enter` element appearing, so a single immediate press can be missed.
    Retry until the lobby actually mounts.
    """
    page.wait_for_selector('[data-testid="press-enter"]', timeout=20000)
    deadline = time.time() + 20
    while time.time() < deadline:
        if page.query_selector('[data-testid="lobby-screen"]'):
            print(f"  [{label}] lobby reached")
            return
        page.keyboard.press("Enter")
        time.sleep(0.6)
    # failed to advance — dump state so the failure is diagnosable
    stage = page.evaluate(
        "() => ({ profile: !!localStorage.getItem('voxelcup.profile'),"
        " onboarded: localStorage.getItem('voxelcup.onboarded'),"
        " testids: [...document.querySelectorAll('[data-testid]')]"
        ".map(e => e.getAttribute('data-testid')).slice(0, 12) })"
    )
    raise RuntimeError(f"[{label}] never reached lobby after splash: {stage}")


def main() -> int:
    if not _ready(f"{FRONTEND}/"):
        print(f"FAIL: frontend not reachable at {FRONTEND}")
        return 1

    errors = {"host": [], "guest": []}
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
        )

        # ---------------------------------------------------------- host context
        host_ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        host_ctx.add_init_script(_profile_init_script("HOSTP1"))
        host = host_ctx.new_page()
        host.on("pageerror", lambda e: errors["host"].append(f"pageerror: {e}"))
        host.on("console", lambda m: errors["host"].append(f"console: {m.text}")
                if m.type == "error" else None)
        host.goto(f"{FRONTEND}/#netdiag", wait_until="domcontentloaded")
        _through_splash(host, "host")

        # host creates the room; capture the code from the REST response.
        with host.expect_response(
            lambda r: r.request.method == "POST" and "/api/rooms" in r.url,
            timeout=15000,
        ) as resp_info:
            host.get_by_role("button", name=re.compile("Crear sala")).click()
        code = resp_info.value.json()["code"]
        host.wait_for_selector('[data-testid="room-screen"]', timeout=15000)
        print(f"  [host] room created: {code}")

        # Let the host's StrictMode double-mount (join -> leave -> rejoin)
        # settle before anyone else joins, and confirm it owns a slot as host.
        time.sleep(3.0)
        with urllib.request.urlopen(f"http://localhost:8002/api/rooms/{code}", timeout=5) as r:
            room0 = json.loads(r.read())
        humans0 = [s for s in room0["slots"] if s["type"] == "human"]
        print(f"  [host] settled: humans={[s['name'] for s in humans0]} host={room0['host']}")

        # ---------------------------------------------------------- guest context
        guest_ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        guest_ctx.add_init_script(_profile_init_script("GUESTB"))
        guest = guest_ctx.new_page()
        guest.on("pageerror", lambda e: errors["guest"].append(f"pageerror: {e}"))
        guest.on("console", lambda m: errors["guest"].append(f"console: {m.text}")
                 if m.type == "error" else None)
        guest.goto(f"{FRONTEND}/#netdiag", wait_until="domcontentloaded")
        _through_splash(guest, "guest")

        # guest joins with the code
        guest.get_by_role("button", name=re.compile("Unirse con código")).click()
        for i, ch in enumerate(code):
            guest.get_by_label(f"Letra {i+1}").fill(ch)
        # wait for backend validation (state -> ok) then enter the room
        join_btn = guest.get_by_role("button", name="Entrar a la sala")
        guest.wait_for_function(
            "() => { const b = [...document.querySelectorAll('button')]"
            ".find(x => x.textContent.includes('Entrar a la sala'));"
            "return b && !b.disabled; }",
            timeout=15000,
        )
        join_btn.click()
        guest.wait_for_selector('[data-testid="room-screen"]', timeout=15000)
        guest.wait_for_selector('[data-testid="room-wait-host"]', timeout=15000)
        print(f"  [guest] joined room {code}")

        # ---------------------------------------------------------- start match
        try:
            host.wait_for_selector('[data-testid="room-start"]:not([disabled])', timeout=15000)
        except Exception:
            # Diagnose WHY canStart stayed false before re-raising.
            def _room_diag(page):
                return page.evaluate(
                    "() => ({"
                    " status: document.querySelector('[data-testid=room-players-status]')?.textContent,"
                    " red: [...document.querySelectorAll('[data-testid=room-team-red] [data-testid^=room-slot-]')].map(s => s.textContent.trim()),"
                    " blue: [...document.querySelectorAll('[data-testid=room-team-blue] [data-testid^=room-slot-]')].map(s => s.textContent.trim()),"
                    " startDisabled: document.querySelector('[data-testid=room-start]')?.disabled,"
                    " conn: document.querySelector('[data-testid=room-conn-status]')?.textContent.trim(),"
                    " err: document.querySelector('[data-testid=room-error]')?.textContent.trim(),"
                    "}) "
                )
            print(f"  [host] diag: {_room_diag(host)}")
            print(f"  [guest] diag: {_room_diag(guest)}")
            # authoritative room state straight from the backend
            try:
                with urllib.request.urlopen(f"http://localhost:8002/api/rooms/{code}", timeout=5) as r:
                    print(f"  [backend] room state: {json.loads(r.read())}")
            except Exception as e:  # noqa: BLE001
                print(f"  [backend] room fetch failed: {e}")
            raise
        host.click('[data-testid="room-start"]')
        print("  [host] start clicked")

        # both clients boot the game and mount the overlay
        host.wait_for_selector('[data-testid="netdiag-hud"]', timeout=45000)
        guest.wait_for_selector('[data-testid="netdiag-hud"]', timeout=45000)
        print("  overlay mounted on host and guest")

        # ---------------------------------------------------------- live input
        # press W for a moment so the guest sends real movement input, the host
        # applies it, acks it, and echoes the ping timestamp back.
        guest.keyboard.down("w")
        time.sleep(1.0)
        guest.keyboard.up("w")

        # give the 20-30Hz state stream a moment to populate RTT + acks
        deadline = time.time() + 10
        guest_snap = None
        while time.time() < deadline:
            guest_snap = guest.evaluate("() => window.__netDiag.getSnapshot()")
            if (guest_snap.get("rtt") is not None and
                    (guest_snap.get("ackSeq") or 0) > 0):
                break
            time.sleep(0.5)
        host_snap = host.evaluate("() => window.__netDiag.getSnapshot()")

        # ---------------------------------------------------------- assertions
        checks = []

        def _ok(cond, msg):
            checks.append((cond, msg))

        # Overlay actually rendered (not merely enabled): bounding box > 0.
        for name, page in (("host", host), ("guest", guest)):
            box = page.locator('[data-testid="netdiag-hud"]').bounding_box()
            _ok(box is not None and box["width"] > 0 and box["height"] > 0,
                f"{name} overlay has non-zero size ({box})")

        _ok(host_snap.get("isHost") is True, f"host isHost={host_snap}")
        _ok(host_snap.get("hostRate") is not None, f"host hostRate={host_snap}")

        _ok(guest_snap.get("isHost") is False, f"guest isHost={guest_snap}")
        # The host broadcast is DECOUPLED from its render loop (a dedicated
        # 30Hz timer in HostSync + an adaptive render budget in the engine),
        # so even under a software renderer the guest must receive the full
        # 30Hz stream with loopback RTT and near-zero drift.
        _ok(guest_snap.get("stateRate", 0) >= 20, f"guest stateRate={guest_snap}")
        _ok(host_snap.get("hostSeq", 0) > 0, f"host hostSeq={host_snap}")
        # hostRate is sim-seconds per real-second, sampled over a 500ms window
        # while the sim advances in fixed-step chunks; it jitters around 1.0.
        # The loose bound only catches a SEVERELY starved host (the old
        # background-tab collapse was ~0.3x).
        _ok(0.5 <= (host_snap.get("hostRate") or 0) <= 2.0, f"host hostRate={host_snap}")
        _ok(guest_snap.get("inputRate", 0) > 0, f"guest inputRate={guest_snap}")
        _ok(guest_snap.get("mySeq", 0) > 0, f"guest mySeq={guest_snap}")
        _ok(guest_snap.get("rtt") is not None and guest_snap.get("rtt") < 250,
            f"guest rtt={guest_snap}")
        _ok((guest_snap.get("ackSeq") or 0) > 0, f"guest ackSeq={guest_snap}")
        _ok((guest_snap.get("drift") or 0) < 3.0, f"guest drift={guest_snap}")

        # summary
        print("=" * 64)
        print("NETDIAG LIVE E2E — results")
        print(f"  host  : isHost={host_snap.get('isHost')} hostRate={host_snap.get('hostRate')}"
              f" loop={host_snap.get('loopRate')}hz render={host_snap.get('renderRate')}hz")
        print(f"  guest : stateRate={guest_snap.get('stateRate')}hz inputRate={guest_snap.get('inputRate')}hz"
              f" rtt={guest_snap.get('rtt')}ms ackSeq={guest_snap.get('ackSeq')} mySeq={guest_snap.get('mySeq')}"
              f" drift={guest_snap.get('drift')} gaps={guest_snap.get('stateGaps')}")
        for cond, msg in checks:
            print(f"  {'PASS' if cond else 'FAIL'}: {msg}")
        print("=" * 64)

        # report console/page errors (excluding known harmless autoplay noise)
        for who, errs in errors.items():
            real = [e for e in errs if e and "console:" in e and "audio" not in e.lower()]
            real += [e for e in errs if e and e.startswith("pageerror")]
            if real:
                print(f"  [{who}] browser errors:")
                for e in real[:10]:
                    print(f"      {e}")

        browser.close()

    failed = [m for ok, m in checks if not ok]
    if failed:
        print(f"\nFAIL: {len(failed)} check(s) failed")
        return 1
    print(f"\nOK: {len(checks)}/{len(checks)} live checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
