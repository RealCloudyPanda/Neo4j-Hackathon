# Telemetry service repair sequence

This authored fixture has a flat service layout (`schema`, `pipeline`, `dashboard`, `monitoring`), independent of the shop monorepo. It models elapsed task time from a batch processor. All snapshots typecheck without packages, keys or a server.

- `base`: elapsed and both consumers use seconds.
- `broken`: producer and contract use milliseconds; dashboard and alert still declare seconds. Two MISMATCH consumers, including uses through immutable aliases and renamed destructuring.
- `partial`: dashboard declares milliseconds and converts internally to a seconds label; alert still assumes seconds. One MISMATCH and one OK.
- `fixed`: dashboard and alert both accept milliseconds; the alert threshold changes to 5000. No MISMATCH consumers; both paths are OK. The original contract drift remains visible.

`dashboard/*.test.ts` and `monitoring/*.test.ts` are authored typecheck fixtures for test discovery. They export sample calls; they are not runtime assertion suites. Analyzer assertions in `test/telemetry.test.ts` verify the repair sequence.
