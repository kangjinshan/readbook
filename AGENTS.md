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



## 电视启动图标与横幅（2026-10-24）

1.0.5（versionCode 6）使用 `res/drawable-nodpi/tv_brand_banner.png` 的 1280×720 横幅，图案与“儿童阅读”分开放置，电视距离下清楚可辨。Manifest 的 TV 横幅独立于方形启动图标；保留原包名、应用名称、业务逻辑与用户数据。图案来源和哈希见本模块 `tv-brand-assets.json`。本次资源变更按发布构建、签名兼容、电视启动和桌面截图验收。


### 电视 Release 注解依赖

TV 模块以 `compileOnly` 提供 `error_prone_annotations:2.15.0`，让 R8 解析 Tink 引用的编译期注解；不向运行时引入新的服务或业务行为。


### Retrofit suspend 接口与 Release 混淆

`tv-app/app/proguard-rules.pro` 保留 `kotlin.coroutines.Continuation`、`retrofit2.Call` 和 `retrofit2.Response` 及 Signature / InnerClasses / EnclosingMethod 元数据，避免 Retrofit 2.9 在 R8 full mode 后把 suspend 返回类型解析为原始 Class。1.0.4 (5) 修复本次 1.0.3 (4) 真实设备同步失败，发布前验证书架同步而不只验证进程启动。


### 书架封面兼容（1.0.5 / 6）

`ui/shelf/CoverResource.kt` 将同步接口的 `covers/<文件>` 解析成当前服务器的 `/storage/covers/<文件>`，兼容原绝对地址。BookAdapter 只为同源受保护的封面加入设备认证头；外部地址或协议/端口改变时不发送设备凭证，本地路径和目录穿越拒绝加载。CoverResourceTest 覆盖相对路径、旧地址及认证边界；真机验收必须在真实同步后确认封面显示和阅读进度保留。
