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


### 阅读查词（1.1.0 / 7）

`ReaderWords` / `NativeWordSelector` 和 `assets/reader-word-selection.js` 保留英文原词与 UTF-16 选中位置，支持鼠标左键与确认键进入选词。`ReaderActivity` 的浮层仅显示单词和中文释义，外部点击、返回或确认收起；错误态点击或确认按同一 requestId 重试，晚到响应不得覆盖新词。选词期间方向键不翻页，查词不暂停防沉迷计时。完整余文能放下时 `ReaderPageBreaks.adjustBreakPoint()` 不提前拆出最后一词。

`server/src/routes/wordLookup.ts` 校验设备、儿童和书籍授权，由服务端调用 wordlearning；配置 `WORDLEARNING_API_URL` 与 `WORDLEARNING_INTEGRATION_KEY`，不得把集成密钥下发客户端。wordlearning 保存个人查看记录与普通词候选，新增共享读书词库、独立人名缓存和语境判断缓存；人名不写词库、候选或学习记录。详见 `docs/word-lookup.md`。


### 旧版客户端升级兼容（1.1.1 / 8）

Room版本4通过 `MIGRATION_3_4` 为历史缺索引库补齐 chapters、bookmarks、reading_progress 的声明索引，不删数据。`ReadBookApp` 注册1→2→3→4完整迁移链；`LegacyDatabaseMigrationTest` 从每个旧版本验证列/索引及书签、进度、内容保留。`MainActivity` 对已绑定设备以原token限时重新登记，再做路由，刷新长期未使用的注册状态；服务端明确未绑定时进入正常绑定页，不继续HTTP400循环。Debug HTTP日志仅用BASIC，避免打印凭证和正文。


### 逐行选词与快速释义（1.1.2 / 9）

`ReaderWordNavigation.verticalTarget()` 按实际排版行选择上下相邻行中最接近原横向位置的单词；`NativeWordSelector` 提供 TextView 行几何，XHTML 的 `__readbookWordMove(delta, vertical)` 使用可见文字矩形并隔离左右栏。连续上下移动跨短行仍保留原横向位置，左右或鼠标选择重置横向锚点；页首尾不跳页。原生与HTML设备回归覆盖短行恢复、边界与跨栏保护。

查词API已先返回词库/联网释义，姓名判断与普通词记录在wordlearning持久任务队列后台处理，客户端不得等待 `recorded=true` 才展示释义。


### 点词英文发音与浮窗导航（1.1.3 / 10）

`ReaderActivity.playWordAudio()` 与释义并行，通过 `BookRepository.getWordAudio()` → `POST /api/tv/word-audio` 取得wordlearning音频；`ReaderAudioValidation` 校验原词/类型/哈希，`ReaderWordAudioPlayer` 管理单段MediaPlayer、音频焦点和临时文件。切词、关闭浮窗或onStop须停止声音，迟到结果不得播放；不得提高系统音量。浮窗中任意方向键收起并移动光标，上下逐行、左右逐词，不滚动浮窗。


### 蓝牙遥控器浮窗响应（1.1.4 / 11）

已复现 `MediaPlayer.release()` 在电视音效环境中阻塞主线程约2.5秒，使浮窗隐藏和后续按键排队。`ReaderWordAudioPlayer.Pronunciation` 为每次发音独立持有HandlerThread、播放器、音频焦点监听器和文件，所有MediaPlayer操作在所属线程执行；`stop()`/`close()`只立即失效会话并提交清理，不等待释放。旧会话清理不得释放新会话焦点。`dismissWordLookup()` 先隐藏浮窗。设备回归包含人为延迟音频释放时的连续方向键、新录音不受旧清理影响，以及完整发音结束后连续换词。
