# Agent Notes

This repo contains three coupled apps:

- `server/`: Node.js + Express + TypeScript API.
- `web/`: React + Vite parent/admin UI.
- `tv-app/`: Kotlin Android TV client.

## Working Rules

- Keep production hosts, SSH targets, device IPs, and credentials out of committed docs. Use private operator notes or ask the user when a real endpoint is needed.
- Do not commit local exports, logs, APKs, databases, or storage artifacts.
- Prefer repo-local patterns over new abstractions. Keep behavior changes scoped and covered by focused tests.
- For text/file search use `rg` / `rg --files`.

## Anti-Addiction Rules

- Continuous reading limits are policy-driven, not hard-coded.
- The rolling window length is `continuousLimitMinutes + restMinutes`.
- The maximum readable time inside that window is `continuousLimitMinutes`.
- Exiting the TV reader must not reset continuous reading time. It only pauses counting; reset is allowed after the configured rest duration has elapsed.
- Server-side checks are the source of truth across sessions/devices. TV-side counters are a local fast path and display aid.
- `canStartReading` enforces both daily limit AND continuous limit (rolling window). A child cannot start a new session if the continuous limit was exceeded without sufficient rest.
- `resetDailyReading` zeroes `daily_stats` AND marks sessions with `reset_at`. `getTodayReadingMinutes`, `getRollingWindowReadingSeconds`, and `updateDailyStats` all respect `children.daily_reading_reset_at` — sessions ended before the reset are excluded from all calculations.
- When changing server TV API response fields, update the Kotlin DTOs in `tv-app/app/src/main/java/com/readbook/tv/data/api/ApiResponse.kt` and keep backward compatibility for fields older deployed servers may omit.

## Security Rules

- Device tokens are long-lived API credentials and must never be returned in admin-facing API responses.
- Book upload size is capped at 200MB.
- Login regenerates session ID to prevent session fixation attacks.
- CSS file paths from epub parsing are validated against the book's parsed directory (no path traversal).
- Initial admin credentials are never logged to stdout.

## Verification

Before shipping server changes:

```bash
cd server
npm test -- --runInBand
npm run build
```

Before shipping TV changes:

```bash
cd tv-app
./gradlew testDebugUnitTest
```

When building a TV debug APK for a physical device, always provide a device-accessible API base URL:

```bash
cd tv-app
./gradlew assembleDebug -PREADBOOK_BASE_URL=<api-base-url>/
adb connect <tv-device-ip>:5555
adb -s <tv-device-ip>:5555 install -r app/build/outputs/apk/debug/app-debug.apk
```

## Deployment Notes

- Deploy server code by building locally, syncing `server/dist/`, then restarting the PM2-managed server process.
- Back up the remote `dist/` directory before overwriting it.
- If a data repair script touches `sql.js` database files, stop the PM2 server first, run the repair, verify the data, then start the process. Restarting after an offline repair can let the old process write stale in-memory database state back to disk.
- For ordinary code-only deploys, a PM2 restart after syncing `dist/` is enough.

