"""Browser test for the in-game NetDiag collector (frontend/src/game/diagnostics.js).

Loads the running dev frontend with the `#netdiag` flag and drives the public
`window.__netDiag` API with synthetic data to verify every derived metric the
overlay renders:

  - module loads & `#netdiag` enables it
  - RTT          : guest clock -> host echo (state.ping) -> guest clock
  - oneWay       : RTT / 2
  - stateGaps    : missing host snapshot seqs
  - keyToAck     : keydown -> host ack latency
  - keyToLocalMove: keydown -> first visible prediction
  - ackSeq/mySeq : authoritative ack vs last sent seq
  - drift        : local vs authoritative distance
  - hostRate     : host simulation seconds per real second

Prereqs: the dev frontend must be running on http://localhost:5173
(yarn start). The backend is NOT needed — this exercises the collector only.

Run:  python tests/test_netdiag_browser.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

FRONTEND = "http://localhost:5173"


def _frontend_ready() -> bool:
    try:
        with urllib.request.urlopen(f"{FRONTEND}/", timeout=3) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def main() -> int:
    if not _frontend_ready():
        print(f"SKIP: frontend not reachable at {FRONTEND}")
        print("Start it first:  cd frontend && PORT=5173 BROWSER=none yarn start")
        return 0

    checks = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{FRONTEND}/#netdiag", wait_until="domcontentloaded")

        # 1. The module must be loaded by the import chain (engine/sync/GameCanvas).
        page.wait_for_function("() => !!window.__netDiag", timeout=15000)
        checks += 1

        # 2. `#netdiag` must have enabled the collector.
        enabled = page.evaluate("() => window.__netDiag.enabled === true")
        assert enabled, "expected #netdiag to enable the collector"
        checks += 1

        # 3. Drive the public API with deterministic synthetic data.
        snapshot = page.evaluate(
            """() => {
              const nd = window.__netDiag;
              nd.enabled = true;

              // RTT: two states whose `ping` is 80ms in the past.
              const past = performance.now() - 80;
              nd.onState({ seq: 1, ping: past });
              nd.onState({ seq: 5, ping: past }); // 3 missing snapshots

              // Minimal game + clientSync fakes for drift / ack / hostRate.
              const fakeCs = {
                statesReceived: 100,
                inputsSent: 50,
                seq: 42,
                pendingInputs: [{ seq: 41 }],
                latestState: {
                  acks: { 3: 40 },
                  players: [{ x: 0, z: 0 }, null, null, { x: 3, z: 4 }],
                },
                rc: { mySlot: 3 },
                lastCorrection: 0.25,
              };
              const fakeGame = {
                time: 12.5,
                players: [
                  { mesh: { position: { x: 0, z: 0 } } },
                  null, null,
                  { mesh: { position: { x: 0, z: 0 } } },
                ],
              };
              nd.attach({ game: fakeGame, clientSync: fakeCs, isHost: false });

              // key -> input -> ack latency chain.
              nd.markInput("w");
              nd.onSentInput(41);
              nd.onAck(41);
              nd.markLocalMove();

              nd._sample();
              return nd.getSnapshot();
            }"""
        )

        # 4. Assert every metric the overlay depends on.
        assert snapshot["enabled"] is True, snapshot
        assert snapshot["isHost"] is False, snapshot
        assert 60 <= snapshot["rtt"] <= 100, f"rtt={snapshot['rtt']}"
        assert 30 <= snapshot["oneWay"] <= 50, f"oneWay={snapshot['oneWay']}"
        assert snapshot["stateGaps"] >= 3, snapshot
        assert isinstance(snapshot["keyToAck"], (int, float)), snapshot
        assert snapshot["keyToAck"] < 2000, snapshot
        assert isinstance(snapshot["keyToLocalMove"], (int, float)), snapshot
        assert snapshot["mySeq"] == 42, snapshot
        assert snapshot["ackSeq"] == 40, snapshot
        assert snapshot["pending"] == 1, snapshot
        assert snapshot["correction"] == 0.25, snapshot
        assert snapshot["drift"] == 5.0, snapshot  # hypot(3,4)
        checks += 9

        # 5. Host-rate path: re-attach as host and confirm sim-rate sampling.
        host_snap = page.evaluate(
            """() => {
              const nd = window.__netDiag;
              const game = { time: 10.0, players: [] };
              nd.attach({ game, clientSync: null, hostSync: { seq: 7 }, isHost: true });
              nd._sample();
              const first = nd.getSnapshot();
              // advance sim clock by 0.5s and sample again with real ~0.1s delay
              game.time = 10.5;
              return new Promise((res) => setTimeout(() => {
                nd._sample();
                res({ first, second: nd.getSnapshot() });
              }, 110));
            }"""
        )
        assert host_snap["first"]["isHost"] is True, host_snap
        assert host_snap["second"]["hostSeq"] == 7, host_snap
        # Sim advanced 0.5s over ~0.1s wall => hostRate noticeably > 1.
        assert host_snap["second"]["hostRate"] > 1.0, host_snap
        checks += 2

        browser.close()

    print("=" * 60)
    print(f"NETDIAG collector — OK ({checks} checks passed)")
    print("  RTT / oneWay / gaps / keyToAck / keyToLocalMove / drift")
    print("  ackSeq / mySeq / pending / correction / hostRate all verified")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
