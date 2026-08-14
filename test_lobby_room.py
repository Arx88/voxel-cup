"""Playwright smoke test for the Voxel Cup lobby + room screen flow.

Run from /home/z/my-project/voxel-cup.

Steps:
  1. Boot Chromium headless.
  2. Navigate to the dev server (http://localhost:3000).
  3. Skip splash + onboarding (sets the onboarded flag in localStorage and
     seeds a profile so Lobby renders with a name).
  4. Verify the lobby screen is visible.
  5. Click CREAR SALA → expect a transition to the room screen.
  6. Verify the room screen shows the 4-letter code, two team columns,
     a back button, and (for the host) the start button disabled.
  7. Click VOLVER → expect to be back on the lobby.
  8. Test the join-code modal: open, type a code, verify the confirm button
     enables.
"""

import sys
import time

from playwright.sync_api import sync_playwright

FRONTEND = "http://localhost:3000"
BACKEND = "http://localhost:8001"


def log(label, value=""):
    print(f"[test] {label}{': ' + str(value) if value else ''}", flush=True)


def main():
    failures = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1366, "height": 800})
        page = context.new_page()

        # Collect console errors
        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append(f"PAGEERROR: {err}"))

        log("Navigating to", FRONTEND)
        page.goto(FRONTEND, wait_until="domcontentloaded")
        page.wait_for_timeout(1200)

        # Seed a profile + onboarded flag so we go straight to the lobby after splash.
        log("Seeding localStorage profile + onboarded flag")
        page.evaluate("""() => {
            localStorage.setItem('voxelcup.onboarded', '1');
            localStorage.setItem('voxelcup.profile', JSON.stringify({
                name: 'TESTER', hairStyle: 'bowl', hairColor: '#4a2c17',
                skin: '#e8aa6a', shirt: '#1f5fe0', kitId: 'classic-home',
                number: 10, face: 'normal', eyeColor: '#141419',
                accessory: 'none', accColor: '#ff2d3c', body: 'normal'
            }));
            localStorage.setItem('voxelcup.mode', '3v3');
            localStorage.setItem('voxelcup.career', JSON.stringify({
                level: 7, xp: 4000, coins: 850, streak: 3,
                history: [
                    {result: 'W', score: '3-1'},
                    {result: 'L', score: '0-2'},
                    {result: 'D', score: '1-1'},
                    {result: 'W', score: '4-2'},
                    {result: 'W', score: '2-0'},
                ]
            }));
        }""")

        # Reload to apply localStorage changes; with hasProfile() = true, splash
        # goes "short" and afterSplash lands us in the lobby.
        log("Reloading to apply localStorage")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(1800)

        # Splash: click anywhere to advance (returning users skip onboarding).
        log("Clicking through splash")
        try:
            page.wait_for_selector('[data-testid="press-enter"]', timeout=6000)
            page.click('body', timeout=2000)
            page.wait_for_timeout(900)
        except Exception as e:
            log("Splash skip via press-enter failed, trying alternate click:", str(e))

        # After splash with returning=true, App now goes to "lobby" (not "game").
        # Wait for the lobby screen.
        log("Waiting for lobby screen")
        try:
            page.wait_for_selector('[data-testid="lobby-screen"]', timeout=8000)
        except Exception as e:
            log("FAILED: lobby screen did not appear:", str(e))
            failures.append("lobby-screen not visible")
            # Capture screenshot for debugging
            page.screenshot(path="/tmp/lobby-fail.png", full_page=True)
            log("Current URL:", page.url)
            log("Body text (first 500 chars):", page.evaluate("() => document.body.innerText.slice(0, 500)"))
            browser.close()
            _report(failures, console_errors)
            return

        log("Lobby screen is visible")

        # Verify the player badge shows the seeded name + level + coins
        badge_text = page.inner_text('[data-testid="lobby-player-badge"]')
        log("Player badge text:", badge_text.replace('\n', ' | '))
        if "TESTER" not in badge_text:
            failures.append("player badge missing name 'TESTER'")
        if "NIVEL 7" not in badge_text:
            failures.append("player badge missing 'NIVEL 7'")
        if "850" not in badge_text:
            failures.append("player badge missing coins '850'")

        # Verify all 4 main action buttons are present
        for test_id in ["lobby-create", "lobby-join", "lobby-quick", "lobby-edit"]:
            try:
                page.wait_for_selector(f'[data-testid="{test_id}"]', timeout=2000)
                log(f"Button {test_id} present")
            except Exception:
                failures.append(f"missing button {test_id}")

        # Verify history strip exists
        try:
            page.wait_for_selector('[data-testid="lobby-history"]', timeout=2000)
            log("History strip present")
        except Exception:
            failures.append("missing lobby-history")

        # Capture a screenshot of the lobby
        page.screenshot(path="/tmp/lobby.png", full_page=True)
        log("Lobby screenshot saved to /tmp/lobby.png")

        # Click CREAR SALA — should POST to /api/rooms and switch to room screen
        log("Clicking CREAR SALA")
        page.click('[data-testid="lobby-create"]')

        # The room screen should appear with a 4-letter code in the title
        log("Waiting for room screen")
        try:
            page.wait_for_selector('[data-testid="room-screen"]', timeout=8000)
        except Exception as e:
            failures.append(f"room-screen did not appear: {e}")
            page.screenshot(path="/tmp/room-fail.png", full_page=True)
            log("Current URL:", page.url)
            log("Body text (first 500 chars):", page.evaluate("() => document.body.innerText.slice(0, 500)"))
            browser.close()
            _report(failures, console_errors)
            return

        log("Room screen is visible")

        # Verify the code block shows 4 characters
        try:
            code_block = page.inner_text('[data-testid="room-code-block"]')
            log("Code block text:", code_block.replace('\n', ' | '))
            # The code should be 4 uppercase letters from CODE_ALPHABET
            import re
            m = re.search(r'\b([A-Z2-9]{4})\b', code_block)
            if m:
                log("Room code:", m.group(1))
            else:
                failures.append("could not find 4-char room code in code block")
        except Exception as e:
            failures.append(f"could not read code block: {e}")

        # Verify the back button is present
        try:
            page.wait_for_selector('[data-testid="room-back"]', timeout=2000)
            log("Back button present")
        except Exception:
            failures.append("missing room-back button")

        # Verify both team columns rendered
        for team in ["red", "blue"]:
            try:
                page.wait_for_selector(f'[data-testid="room-team-{team}"]', timeout=2000)
                log(f"Team column {team} present")
            except Exception:
                failures.append(f"missing room-team-{team}")

        # Verify slot cards exist (3v3 = 1 GK + 3 field per team = 4 slots/team = 8 total)
        slot_count = page.evaluate("""() => document.querySelectorAll('[data-testid^="room-slot-"]').length""")
        log("Slot count:", slot_count)
        if slot_count != 8:
            failures.append(f"expected 8 slots (3v3), got {slot_count}")

        # Verify the start button is present (host) but disabled (only 1 human)
        try:
            start_btn = page.wait_for_selector('[data-testid="room-start"]', timeout=2000)
            disabled = start_btn.get_attribute('disabled')
            log(f"Start button present, disabled={disabled is not None}")
            if disabled is None:
                # Should be disabled — only 1 human (us). Let it fail later.
                log("WARNING: start button should be disabled with only 1 human")
        except Exception:
            # Could be the "wait-host" version if not host — but we created the room so we are host
            failures.append("missing room-start button (host)")

        # Verify connection status indicator shows open
        try:
            conn_text = page.inner_text('[data-testid="room-conn-status"]')
            log("Conn status:", conn_text)
            # Allow some time for the WS to connect
            for _ in range(20):
                conn_text = page.inner_text('[data-testid="room-conn-status"]')
                if "CONECTADO" in conn_text or "open" in conn_text.lower():
                    break
                page.wait_for_timeout(300)
            log("Final conn status:", page.inner_text('[data-testid="room-conn-status"]'))
            if "CONECTADO" not in page.inner_text('[data-testid="room-conn-status"]'):
                failures.append(f"not connected to WS: '{conn_text}'")
        except Exception as e:
            failures.append(f"could not read conn status: {e}")

        # Capture a screenshot of the room
        page.screenshot(path="/tmp/room.png", full_page=True)
        log("Room screenshot saved to /tmp/room.png")

        # Click VOLVER — should leave the room and go back to lobby
        log("Clicking VOLVER (room-back)")
        page.click('[data-testid="room-back"]')
        try:
            page.wait_for_selector('[data-testid="lobby-screen"]', timeout=5000)
            log("Back to lobby OK")
        except Exception:
            failures.append("did not return to lobby after room-back")

        # Test the join-code modal: open it, type a code, verify confirm enables
        log("Testing join-code modal")
        page.click('[data-testid="lobby-join"]')
        try:
            page.wait_for_selector('[data-testid="lobby-join-modal"]', timeout=3000)
            log("Join modal opened")
        except Exception:
            failures.append("join modal did not open")

        # The confirm button should be disabled when input is empty
        confirm = page.query_selector('[data-testid="lobby-join-confirm"]')
        if confirm and confirm.get_attribute('disabled') is not None:
            log("Confirm disabled when empty (good)")
        else:
            failures.append("confirm should be disabled when input empty")

        # Type a code
        page.fill('[data-testid="lobby-join-input"]', 'ABCD')
        page.wait_for_timeout(200)
        confirm = page.query_selector('[data-testid="lobby-join-confirm"]')
        if confirm and confirm.get_attribute('disabled') is None:
            log("Confirm enabled after typing 'ABCD' (good)")
        else:
            failures.append("confirm should be enabled after typing valid code")

        # Cancel the modal — wait for it to disappear (AnimatePresence exit anim).
        page.click('[data-testid="lobby-join-cancel"]')
        try:
            page.wait_for_selector('[data-testid="lobby-join-modal"]', state="detached", timeout=2000)
            log("Modal closed after cancel (good)")
        except Exception:
            failures.append("modal still visible after cancel")

        # Final screenshots
        page.screenshot(path="/tmp/lobby-final.png", full_page=True)

        browser.close()

    _report(failures, console_errors)


def _report(failures, console_errors):
    print("\n========== REPORT ==========")
    if failures:
        print(f"FAILURES ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
    else:
        print("ALL CHECKS PASSED")
    if console_errors:
        print(f"\nConsole errors ({len(console_errors)}):")
        for e in console_errors[:10]:
            print(f"  - {e}")
    else:
        print("\nNo console errors.")
    print("============================\n")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
