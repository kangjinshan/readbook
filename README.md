# ReadBook

儿童护眼阅读器项目，包含家长管理后台（Web）、后端服务（Server）和 Android TV 阅读端。
部署地址、运维主机、调试设备等敏感信息请保存在私有文档或密钥管理系统中，不建议写入公开 README。

## 项目结构

```text
readbook/
├── server/   # Node.js + Express + TypeScript API
├── web/      # React + Vite 管理后台
├── tv-app/   # Kotlin Android TV 客户端
└── docs/     # 项目文档
```

## 功能概览

### 管理后台（Web）

- 管理员登录认证
- 子账号管理
- 设备绑定与远程控制
- 书籍上传（EPUB/PDF/TXT/DOCX/MOBI/AZW3，支持多文件批量上传）
- 书籍详情页手动替换封面
- 书籍列表页下载原始源文件
- 书籍授权管理
- 新窗口书籍预览
- 防沉迷策略配置（连续阅读时长支持 1 分钟测试值）
- 阅读统计与书签管理

### 后端服务（Server）

- Session 认证（含速率限制）
- 书籍解析与存储（含 EPUB 封面回退提取）
- 书籍原始源文件下载接口（管理员权限）
- 封面路径规范化与公开封面 URL
- 设备管理与 Token 过期（90 天）
- TV 端 API（注册、绑定、同步、会话）
- 防沉迷服务（北京时间跨日判定、跨 0 点会话按日切分）
- 书籍正文静态文件访问控制

### TV 阅读端（Android TV）

- 设备注册与绑定码绑定
- 书架同步（自动隐藏服务端已下架书籍）
- 纯文本阅读器（章节全文拉取，本地分页，页首引号/标点并回上一页）
- WebView 双页阅读模式（整屏 `1920px` 宽视口、固定双页步进、图片按页宽/页高约束缩放）
- 书签管理（长按添加，菜单内查看 / 跳转 / 删除，同步保留，连续阅读超时休息时自动补当前页书签）
- 阅读亮度调节（应用内背景遮罩，阅读页与书架页共用）
- 阅读设置菜单（按键活跃续期自动隐藏，返回键优先关闭菜单，菜单打开后 `OK/确定键` 可操作当前焦点按钮）
- 阅读页右上角剩余可用时间悬浮窗（绿色描边/绿色字体，按服务端最新策略实时倒计时）
- 书架页双击返回退出应用
- 阅读会话心跳
- 本地防沉迷计时与锁定（跨天自动清零并清理陈旧“每日上限”本地锁）

## 技术栈

| 子项目 | 技术栈 |
|--------|--------|
| server | Node.js 18+, Express, TypeScript, sql.js, express-session |
| web | React 18, Vite 5, TypeScript, Ant Design 5, Zustand, Axios, Recharts |
| tv-app | Kotlin, Android TV Leanback, Room, Retrofit, OkHttp, Coroutines |

## API 约定

- 数据库字段使用 snake_case
- API JSON 响应统一使用 camelCase
- 请求参数优先使用 camelCase
- 后端对部分历史 snake_case 入参保留兼容

## 协作约定

- 修改线上行为时，先改本地文件，再上传服务器或安装到设备，避免本地与线上不一致
- 涉及协议改动时，先确认 `server/src/routes/*` 的真实输出，再同步检查 `web` 与 `tv-app`
- TV 阅读问题优先区分为：解析丢失、服务端分页、TV 本地排版三层
- 项目时间语义后续统一向北京时间收敛，新增逻辑不要再引入隐式本地时区假设

## 本地开发

### Server

```bash
cd server
npm install
npm run dev      # 开发模式
npm run build    # 编译
npm test         # 测试
```

默认配置：
- 端口：`8015`
- 数据库：`server/data/readbook.db`
- 存储：`server/storage/`

### Web

```bash
cd web
npm install
npm run dev      # 开发模式（http://localhost:5173）
npm run build    # 构建
npm run test:run # 测试
```

### TV-App

```bash
cd tv-app
./gradlew assembleDebug   # 调试包
./gradlew assembleRelease # 发布包
```

## 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | 8015 |
| `NODE_ENV` | 环境 | development |
| `SESSION_SECRET` | Session 密钥 | 生产环境必须设置 |
| `ADMIN_INITIAL_USERNAME` | 初始管理员用户名 | `admin`（仅建议本地开发使用） |
| `ADMIN_INITIAL_PASSWORD` | 初始管理员密码 | 生产环境必须设置 |
| `ALLOWED_ORIGINS` | CORS 允许域名 | - |

## 安全特性

- 登录速率限制（15 分钟 5 次，封禁 15 分钟）
- 设备 Token 90 天过期
- 书籍正文静态文件访问认证
- 公开封面资源直链访问
- 安全 HTTP 头（X-Frame-Options, X-XSS-Protection）
- HTML 清理防护

## 部署

### Server 编译与部署

```bash
cd server
npm run build

rsync -avz --delete -e "ssh" dist/ <deploy-user>@<deploy-host>:<server-deploy-dir>/dist/

ssh <deploy-user>@<deploy-host> "cd <server-deploy-dir> && pm2 restart <pm2-process-name>"
```

### Web 构建与部署

```bash
cd web
npm run build

rsync -avz --delete -e "ssh" dist/ <deploy-user>@<deploy-host>:<web-deploy-dir>/
```

说明：
- Web 静态资源部署目录请按实际环境配置
- 发布后可通过首页 HTML 是否引用最新 `assets/index-*.js` / `assets/index-*.css` 来确认生效

### TV 调试安装

```bash
cd tv-app
./gradlew assembleDebug

adb connect <tv-device-ip>:5555
adb -s <tv-device-ip>:5555 install -r app/build/outputs/apk/debug/app-debug.apk
```

### Server 数据修复

当线上 `daily_stats.total_minutes` 或 `reading_sessions.duration_seconds` 因历史 bug 需要按最新规则回算时：

```bash
cd server
npm run build

rsync -avz --delete -e "ssh" dist/ <deploy-user>@<deploy-host>:<server-deploy-dir>/dist/

ssh <deploy-user>@<deploy-host> "pm2 stop <pm2-process-name> && cd <server-deploy-dir> && node dist/scripts/rebuildDailyStatsTotalMinutes.js && pm2 start <pm2-process-name>"
```

说明：
- 先停服务，再修库，最后再启动，避免旧进程退出时把内存里的旧数据库覆盖回磁盘
- 修复脚本会同时回算 `daily_stats.total_minutes`、异常 `reading_sessions.duration_seconds`、以及 `reading_progress.total_time_seconds`

当前 TV WebView 双页阅读调试基线：

- `chapterWebView` 外层宽度使用整屏 `1920px`
- WebView 内双页 spread viewport 也使用整屏 `1920px`
- 左右页各固定 `960px`，每次翻页固定步进 `1920px`
- 单图默认缩小到原渲染尺寸的 `80%`
- 原始宽度超过单页宽度的图片，最大限制为单页宽度的 `80%`
- 原始高度超过一屏的单图，最大限制为一屏高度的 `90%`
- 正文段落页内左右各保留 `30px`

### 访问地址

- 访问地址由部署环境决定，建议通过环境配置或私有运维文档维护，不在公开 README 中写死生产域名

## 文档

- 各模块详细说明见子项目 `agents.md`
- 问题追踪见 `ISSUES.md`

## 最近更新

- Web 预览页翻页后自动滚动到页面顶端
- Web 阅读管控当前支持将连续阅读时长设置为 1 分钟，便于测试防沉迷锁定流程
- Web 书籍预览改为新页面打开，并修复预览登录跳转问题
- Web 书籍详情页已支持手动替换封面，并在替换后自动刷新最新封面图
- Web 书籍上传已取消 50MB 限制，并支持多文件批量上传
- Web 书籍列表页已支持下载书籍原始源文件
- Server 已统一 `coverPath` 为 `covers/<id>.<ext>`，TV 同步返回绝对 `coverUrl`
- Server 已新增受权限保护的 `/api/books/:id/source` 原始文件下载接口
- EPUB 封面提取已增加 manifest + zip 回退逻辑，修复部分电子书封面漏解析
- `/storage/covers/*` 已改为公开访问，便于 Web 与 TV 客户端直接加载封面
- EPUB 结构化解析增强，保留标题、段落与换行信息
- TV 绑定码、在线状态、书架同步问题已修复
- TV 书架同步会移除本地缓存中已被服务端下架的书籍
- TV 阅读会话改为增量时长心跳，结束页码上报修正
- TV 阅读器改为章节全文拉取 + 本地分页
- TV 阅读器已支持段首两个中文空格缩进，并持续优化底部裁切问题
- TV 阅读器已修复页首引号/标点跨页展示
- TV WebView 阅读模式已切到整屏双页布局，当前以“左右页各 `960px` + 固定 `1920px` 步进”为基线
- TV 书签已支持长按添加、菜单内查看 / 跳转 / 删除，并修复重进后的本地保留
- TV 连续阅读触发休息锁时会自动给当前页补书签，并在后续常规同步时上传到服务端
- TV 阅读亮度已扩展到书架选书页，菜单改为无操作后自动隐藏
- TV 阅读菜单已修复“菜单打开后 `OK/确定键` 无效”的焦点按键分发问题
- TV 书架页已改为双击返回退出应用
- TV 启动页 / 绑定页 / 锁定页 / 书架页 / 阅读页现在都会立即应用亮度设置
- TV 阅读页已增加右上角剩余可用时间悬浮窗，并修复会话开始时使用旧本地策略导致倒计时错误的问题
- TV 客户端现在会在跨天时本地清零阅读时长，并清理陈旧“每日上限”锁状态
- Server 已修复跨 0 点阅读会话导致的日统计漂移，并补充 `daily_stats` / `reading_sessions` / `reading_progress` 回算修复脚本
