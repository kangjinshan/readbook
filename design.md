# 儿童电视护眼阅读器 - 技术设计文档

## 1. 项目概览

### 1.1 产品定位

专为儿童设计的**远距离护眼电视阅读产品**，孩子在小米电视上安静阅读，
家长通过网页后台统一管理书籍、控制阅读时长、查看阅读数据，
解决儿童近距离看电子屏幕伤眼问题。

### 1.2 系统组成

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   小米电视端     │ ←──→ │   Azure 后端     │ ←──→ │  Web 家长后台   │
│  (Android TV)   │      │   (Node.js)     │      │    (React)      │
└─────────────────┘      └─────────────────┘      └─────────────────┘
      遥控器操作              数据存储、API           书籍管理、统计
      离线阅读                文件解析分发            设备绑定、管控
```

### 1.3 技术栈选型

| 组件 | 技术选择 | 选型理由 |
|------|---------|---------|
| 电视端 | Android Kotlin | 小米电视原生支持，遥控器交互优化 |
| Web 端 | React 18 + TypeScript + Vite | 快速开发，类型安全，生态完善 |
| 后端 | Node.js + TypeScript + Express | 全栈 TypeScript，与前端技术栈统一 |
| 数据库 | SQLite (sql.js) | 轻量级，无需独立数据库服务，适合中小规模 |
| 实时通信 | 定时轮询 | 简单可靠，适合电视端低频更新场景 |
| 认证方案 | Session + Cookie | Web 端安全认证，电视端使用 device_token |
| 文件存储 | Azure VM 本地磁盘 | 成本低，部署简单 |
| 架构模式 | 单体架构 | 系统规模小，开发和部署简单 |

### 1.4 核心约束

- 电视端仅使用遥控器按键：上、下、左、右、OK、返回、菜单
- 全文纯文本阅读，无拼音、无动画、无广告
- 选词解释、名词解释、生词本功能纳入二期

### 1.5 部署配置

- **服务器**：云主机 / 虚拟机（具体环境见私有运维文档）
- **SSH 用户**：通过私有运维文档配置
- **端口**：部署前检查 Azure 已占用端口，选择可用端口（候选：8002-8004, 8006-8008, 8015+）
- **域名**：通过环境变量或私有运维文档配置
- **进程管理**：PM2（开机自启）
- **反向代理**：Nginx（可选域名访问）

---

## 2. 架构设计

### 2.1 项目目录结构

```
readbook/
├── server/                          # Node.js + TypeScript 后端
│   ├── src/
│   │   ├── app.ts                   # Express 应用入口
│   │   ├── server.ts                # HTTP 服务器启动脚本
│   │   ├── database.ts              # sql.js 数据库初始化与连接
│   │   ├── config.ts                # 常量配置（端口、密钥、轮询间隔等）
│   │   ├── routes/                  # 路由模块
│   │   │   ├── auth.ts              # 认证相关（登录/登出/Session）
│   │   │   ├── children.ts          # 子账号 CRUD
│   │   │   ├── devices.ts           # 设备绑定/管理/远程指令
│   │   │   ├── books.ts             # 书籍上传/解析/管理/授权
│   │   │   ├── reading.ts           # 阅读进度/会话管理
│   │   │   ├── bookmarks.ts         # 书签管理
│   │   │   ├── control.ts           # 防沉迷策略配置
│   │   │   ├── stats.ts             # 统计接口（实时/历史/导出）
│   │   │   └── tv.ts                # 电视端专用接口
│   │   ├── middleware/              # 中间件
│   │   │   ├── authGuard.ts         # Web 端认证守卫
│   │   │   ├── deviceAuth.ts        # 电视端设备认证
│   │   │   └── errorHandler.ts      # 全局错误处理
│   │   ├── services/                # 业务服务
│   │   │   ├── bookParser.ts        # 书籍解析（EPUB/PDF/TXT）
│   │   │   ├── antiAddiction.ts     # 防沉迷计算服务
│   │   │   └── statsEngine.ts       # 统计数据计算引擎
│   │   └── utils/                   # 工具函数
│   │       ├── response.ts          # 统一响应格式
│   │       ├── crypto.ts            # 加密工具
│   │       └── validator.ts         # 参数验证
│   ├── data/
│   │   └── readbook.db              # SQLite 数据库文件
│   ├── storage/                     # 文件存储目录
│   │   ├── originals/               # 上传的原始文件
│   │   ├── parsed/                  # 解析后的章节 JSON
│   │   └── covers/                  # 书籍封面图片
│   ├── package.json
│   └── tsconfig.json
│
├── web/                             # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/                     # API 通信层
│   │   │   ├── client.ts            # Axios 实例配置
│   │   │   ├── auth.ts              # 认证 API
│   │   │   ├── children.ts          # 子账号 API
│   │   │   ├── devices.ts           # 设备 API
│   │   │   ├── books.ts             # 书籍 API
│   │   │   ├── control.ts           # 管控 API
│   │   │   └── stats.ts             # 统计 API
│   │   ├── pages/                   # 页面组件
│   │   │   ├── Login.tsx            # 登录页
│   │   │   ├── Dashboard.tsx        # 仪表盘
│   │   │   ├── Children.tsx         # 子账号管理
│   │   │   ├── Devices.tsx          # 设备管理
│   │   │   ├── Books.tsx            # 书籍管理
│   │   │   ├── BookDetail.tsx       # 书籍详情/编辑
│   │   │   ├── Control.tsx          # 阅读管控配置
│   │   │   ├── Stats.tsx            # 阅读统计
│   │   │   └── Bookmarks.tsx        # 书签管理
│   │   ├── components/              # 通用组件
│   │   │   ├── Layout.tsx           # 页面布局
│   │   │   ├── ChildSelector.tsx    # 子账号选择器
│   │   │   ├── BookCard.tsx         # 书籍卡片
│   │   │   ├── StatsChart.tsx       # 统计图表
│   │   │   └── FileUploader.tsx     # 文件上传组件
│   │   ├── hooks/                   # 自定义 Hooks
│   │   │   ├── useAuth.ts           # 认证状态
│   │   │   ├── useChild.ts          # 当前选中子账号
│   │   │   └── usePolling.ts        # 轮询 Hook
│   │   ├── store/                   # 状态管理
│   │   │   └── useStore.ts          # Zustand store
│   │   ├── types/                   # TypeScript 类型定义
│   │   ├── App.tsx                  # 应用入口
│   │   └── main.tsx                 # Vite 入口
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
└── tv-app/                          # Android Kotlin 电视端
    └── app/src/main/java/com/readbook/tv/
        ├── ui/                      # UI 层
        │   ├── bind/                # 设备绑定页面
        │   │   ├── BindActivity.kt
        │   │   └── BindFragment.kt
        │   ├── shelf/               # 书架页面
        │   │   ├── ShelfActivity.kt
        │   │   └── BookAdapter.kt
        │   ├── reader/              # 阅读页面
        │   │   ├── ReaderActivity.kt
        │   │   ├── ReaderFragment.kt
        │   │   ├── ReaderMenuFragment.kt
        │   │   └── PageView.kt       # 自定义分页 View
        │   └── lock/                # 锁屏休息页面
        │       └── LockFragment.kt
        ├── data/                    # 数据层
        │   ├── api/                 # 网络请求
        │   │   ├── ApiClient.kt
        │   │   ├── TvApi.kt
        │   │   └── ApiResponse.kt
        │   ├── local/               # 本地存储
        │   │   ├── AppDatabase.kt   # Room 数据库
        │   │   ├── BookDao.kt
        │   │   ├── ProgressDao.kt
        │   │   └── BookmarkDao.kt
        │   ├── model/               # 数据模型
        │   │   ├── Book.kt
        │   │   ├── Chapter.kt
        │   │   ├── ReadingProgress.kt
        │   │   └── ControlPolicy.kt
        │   └── repository/          # 数据仓库
        │       ├── BookRepository.kt
        │       └── SyncRepository.kt
        ├── service/                 # 服务
        │   ├── SyncService.kt       # 数据同步服务
        │   └── AntiAddictionService.kt  # 防沉迷计时服务
        └── util/                    # 工具类
            ├── PageCalculator.kt    # 分页计算
            ├── PreferenceManager.kt # EncryptedSharedPreferences
            └── RemoteControlHandler.kt  # 遥控器事件处理
```

---

## 3. 数据设计

### 3.1 数据库设计（12 张表）

#### 3.1.1 用户与权限表

**admins - 管理员（家长）账号表**
```sql
CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,    -- bcryptjs 10 rounds
  email VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**children - 儿童子账号表**
```sql
CREATE TABLE children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  name VARCHAR(50) NOT NULL,
  avatar VARCHAR(255),                    -- 头像 URL
  birth_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);
```

**devices - 电视设备表**
```sql
CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  child_id INTEGER,                       -- 绑定的子账号
  device_token VARCHAR(255) UNIQUE NOT NULL,  -- UUID v4
  device_name VARCHAR(100),
  bind_code VARCHAR(6),                   -- 6位数字绑定码
  bind_code_expires_at DATETIME,          -- 绑定码过期时间
  last_online_at DATETIME,
  remote_command VARCHAR(50),             -- 远程指令：exit/lock/restart
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL
);
```

#### 3.1.2 书籍与内容表

**books - 书籍元数据表**
```sql
CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(100),
  publisher VARCHAR(100),
  cover_path VARCHAR(255),                -- 封面图片路径
  original_path VARCHAR(255) NOT NULL,    -- 原始文件路径
  format VARCHAR(10) NOT NULL,            -- EPUB/PDF/TXT
  total_pages INTEGER NOT NULL,
  total_chapters INTEGER,
  file_size INTEGER,                      -- 字节数
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);
```

**chapters - 章节表**
```sql
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  chapter_index INTEGER NOT NULL,         -- 章节序号
  title VARCHAR(255),
  content_path VARCHAR(255) NOT NULL,     -- 章节内容 JSON 路径
  start_page INTEGER NOT NULL,            -- 章节起始页码
  end_page INTEGER NOT NULL,              -- 章节结束页码
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
```

**book_assignments - 书籍授权表（多对多）**
```sql
CREATE TABLE book_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  child_id INTEGER NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(book_id, child_id),
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);
```

#### 3.1.3 阅读数据表

**reading_progress - 阅读进度表**
```sql
CREATE TABLE reading_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  current_page INTEGER NOT NULL DEFAULT 1,
  total_time_seconds INTEGER NOT NULL DEFAULT 0,  -- 累计阅读时长
  last_read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(child_id, book_id),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
```

**bookmarks - 书签表**
```sql
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  page_number INTEGER NOT NULL,
  preview_text VARCHAR(100),              -- 页面预览文本
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);
CREATE INDEX idx_bookmarks_child_book ON bookmarks(child_id, book_id);
```

**reading_sessions - 阅读会话记录表**
```sql
CREATE TABLE reading_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_seconds INTEGER,
  start_page INTEGER NOT NULL,
  end_page INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE INDEX idx_sessions_child_time ON reading_sessions(child_id, start_time);
```

#### 3.1.4 管控与统计表

**control_policies - 防沉迷策略表**
```sql
CREATE TABLE control_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL UNIQUE,
  daily_limit_minutes INTEGER NOT NULL DEFAULT 120,    -- 每日最大阅读时长
  continuous_limit_minutes INTEGER NOT NULL DEFAULT 45, -- 连续阅读时长
  rest_minutes INTEGER NOT NULL DEFAULT 15,            -- 强制休息时长
  forbidden_start_time TIME,             -- 禁止开始时间
  forbidden_end_time TIME,               -- 禁止结束时间
  allowed_font_sizes TEXT,               -- JSON: ["small","medium","large"]
  allowed_themes TEXT,                   -- JSON: ["yellow","white","dark"]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);
```

**daily_stats - 每日阅读汇总表**
```sql
CREATE TABLE daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  child_id INTEGER NOT NULL,
  stat_date DATE NOT NULL,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  books_read INTEGER NOT NULL DEFAULT 0,
  pages_read INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(child_id, stat_date),
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);
```

**operation_logs - 操作日志表**
```sql
CREATE TABLE operation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  child_id INTEGER,
  device_id INTEGER,
  operation VARCHAR(50) NOT NULL,         -- login/upload/bind/control...
  details TEXT,                           -- JSON 格式详情
  ip_address VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);
CREATE INDEX idx_logs_time ON operation_logs(created_at);
```

---

### 3.2 核心数据流图

#### 3.2.1 设备绑定流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ 电视端    │         │ 后端服务  │         │ Web 后台 │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │ 1. 首次启动        │                    │
     │────────────────────>                    │
     │ POST /api/tv/register                   │
     │ {device_token: UUID}                    │
     │                    │                    │
     │ 2. 生成绑定码      │                    │
     │<────────────────────                    │
     │ {bind_code: "123456",                   │
     │  expires_at: "2024-01-01T10:10:00"}     │
     │                    │                    │
     │ 3. 显示绑定码      │                    │
     │ (10分钟有效)       │                    │
     │                    │                    │
     │                    │ 4. 输入绑定码      │
     │                    │<───────────────────│
     │                    │ POST /api/devices/bind
     │                    │ {bind_code, child_id}│
     │                    │                    │
     │                    │ 5. 验证并绑定      │
     │                    │ 更新 devices 表    │
     │                    │                    │
     │                    │ 6. 绑定成功        │
     │                    │───────────────────>│
     │                    │ {device_name, status}│
     │                    │                    │
     │ 7. 轮询绑定状态    │                    │
     │────────────────────>                    │
     │ GET /api/tv/bind-status                 │
     │                    │                    │
     │ 8. 返回已绑定      │                    │
     │<────────────────────                    │
     │ {status: "bound", child_id, name}       │
     │                    │                    │
     │ 9. 同步书籍和进度  │                    │
     │────────────────────>                    │
     │ GET /api/tv/sync                         │
     │<────────────────────                    │
     │ {books, progress, policy}               │
     │                    │                    │
```

#### 3.2.2 书籍阅读流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ 电视端    │         │ 后端服务  │         │ 数据库   │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │ 1. 开始阅读        │                    │
     │────────────────────>                    │
     │ POST /api/tv/session/start              │
     │ {child_id, book_id, device_id, page}    │
     │                    │                    │
     │                    │ 2. 创建会话        │
     │                    │───────────────────>│
     │                    │ INSERT reading_sessions
     │                    │                    │
     │                    │ 3. 检查权限和策略  │
     │                    │───────────────────>│
     │                    │ SELECT book_assignments,
     │                    │        control_policies
     │                    │<───────────────────│
     │                    │                    │
     │ 4. 返回允许/拒绝   │                    │
     │<────────────────────                    │
     │ {allowed: true, policy: {...}}          │
     │                    │                    │
     │ 5. 阅读中...       │                    │
     │                    │                    │
     │ 6. 心跳上报（30秒）│                    │
     │────────────────────>                    │
     │ POST /api/tv/session/heartbeat          │
     │ {session_id, current_page, duration}    │
     │                    │                    │
     │                    │ 7. 更新会话和进度  │
     │                    │───────────────────>│
     │                    │ UPDATE reading_sessions
     │                    │ UPDATE reading_progress
     │                    │                    │
     │ 8. 检查防沉迷      │                    │
     │                    │ 计算今日累计时长    │
     │                    │───────────────────>│
     │                    │<───────────────────│
     │                    │                    │
     │ 9. 返回状态        │                    │
     │<────────────────────                    │
     │ {should_lock: false,                    │
     │  remaining_minutes: 90}                 │
     │                    │                    │
     │ 10. 退出阅读       │                    │
     │────────────────────>                    │
     │ POST /api/tv/session/end                │
     │ {session_id, end_page}                  │
     │                    │                    │
     │                    │ 11. 结束会话       │
     │                    │───────────────────>│
     │                    │ UPDATE reading_sessions
     │                    │ UPDATE daily_stats
     │                    │                    │
```

#### 3.2.3 书籍上传与解析流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ Web 后台 │         │ 后端服务  │         │ 文件系统 │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │ 1. 上传文件        │                    │
     │────────────────────>                    │
     │ POST /api/books/upload                  │
     │ FormData: file, title, author           │
     │                    │                    │
     │                    │ 2. 保存原始文件    │
     │                    │───────────────────>│
     │                    │ storage/originals/ │
     │                    │<───────────────────│
     │                    │                    │
     │                    │ 3. 解析书籍        │
     │                    │ (根据格式选择解析器)│
     │                    │                    │
     │   ┌────────────────┼────────────────┐   │
     │   │ EPUB           │ PDF            │TXT │
     │   │ epubjs         │ pdf-parse      │fs  │
     │   └────────────────┼────────────────┘   │
     │                    │                    │
     │                    │ 4. 提取章节        │
     │                    │───────────────────>│
     │                    │ storage/parsed/    │
     │                    │ {book_id}/         │
     │                    │   chapter_1.json   │
     │                    │   chapter_2.json   │
     │                    │<───────────────────│
     │                    │                    │
     │                    │ 5. 提取封面        │
     │                    │───────────────────>│
     │                    │ storage/covers/    │
     │                    │ {book_id}.jpg      │
     │                    │<───────────────────│
     │                    │                    │
     │                    │ 6. 计算分页        │
     │                    │ 根据字体、字号、   │
     │                    │ 屏幕尺寸计算页数   │
     │                    │                    │
     │ 7. 返回书籍信息    │                    │
     │<────────────────────                    │
     │ {book_id, total_pages, chapters}        │
     │                    │                    │
```

#### 3.2.4 防沉迷控制流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ 电视端    │         │ 后端服务  │         │ 数据库   │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │ 1. 心跳请求        │                    │
     │────────────────────>                    │
     │                    │                    │
     │                    │ 2. 查询策略        │
     │                    │───────────────────>│
     │                    │ SELECT control_policies
     │                    │<───────────────────│
     │                    │                    │
     │                    │ 3. 查询今日累计    │
     │                    │───────────────────>│
     │                    │ SELECT SUM(duration)
     │                    │ FROM reading_sessions
     │                    │ WHERE date = today
     │                    │<───────────────────│
     │                    │                    │
     │                    │ 4. 检查时间限制    │
     │                    │ ┌────────────────┐ │
     │                    │ │ 每日限额检查   │ │
     │                    │ │ 连续时长检查   │ │
     │                    │ │ 禁止时段检查   │ │
     │                    │ └────────────────┘ │
     │                    │                    │
     │ 5. 返回控制指令    │                    │
     │<────────────────────                    │
     │ {                                    │
     │   should_lock: true,                   │
     │   reason: "continuous_limit_exceeded", │
     │   lock_duration_minutes: 15            │
     │ }                                      │
     │                    │                    │
     │ 6. 显示锁屏页面    │                    │
     │ (倒计时15分钟)     │                    │
     │                    │                    │
```

---

### 3.3 缓存策略

#### 3.3.1 电视端离线缓存

**缓存内容：**
- 已授权书籍的章节内容
- 阅读进度（本地优先，联网同步）
- 书签数据
- 防沉迷策略（本地计时 + 服务端校验）

**缓存策略：**
```
┌─────────────────────────────────────────────────────┐
│              电视端 Room 数据库缓存                  │
├─────────────────────────────────────────────────────┤
│ books 表         │ 已下载书籍元数据                  │
│ chapters 表      │ 章节内容（按需下载）               │
│ progress 表      │ 阅读进度（本地 + 云端同步）        │
│ bookmarks 表     │ 书签（本地 + 云端同步）            │
│ policy 表        │ 防沉迷策略（定期更新）             │
└─────────────────────────────────────────────────────┘
```

**同步策略：**
- 阅读进度：每次翻页记录本地，每 30 秒心跳上报
- 书签：添加/删除时立即同步，失败则重试队列
- 书籍：首次打开时下载章节，后续从本地读取
- 策略：每次启动时检查更新

#### 3.3.2 服务端缓存

**不使用 Redis，直接查询 SQLite**
- 系统规模小，SQLite 性能足够
- 减少架构复杂度

**文件缓存：**
- 解析后的章节 JSON 文件持久化存储
- 封面图片缓存
- 原始文件保留

### 3.4 数据一致性设计

#### 3.4.1 进度同步一致性

**问题：** 电视端离线阅读后，进度可能与服务端不一致

**解决方案：**
1. 电视端维护本地进度，联网时上报
2. 服务端以最新时间戳为准，不做合并
3. Web 端查看进度时，显示最后更新时间和来源设备

#### 3.4.2 书签同步一致性

**解决方案：**
1. 书签带唯一 ID 和创建时间戳
2. 电视端离线创建书签，联网后批量上报
3. Web 端删除书签，电视端同步删除（标记删除）

---

## 4. 接口设计

### 4.1 API 接口总览

| 模块 | 接口数量 | 主要功能 |
|------|---------|---------|
| /api/auth | 3 | 登录、登出、Session 检查 |
| /api/children | 4 | 子账号 CRUD |
| /api/devices | 5 | 设备绑定、管理、远程控制 |
| /api/books | 8 | 上传、解析、管理、授权、预览 |
| /api/tv | 7 | 电视端专用接口 |
| /api/control | 3 | 防沉迷策略配置 |
| /api/stats | 5 | 统计查询、导出 |
| /api/bookmarks | 4 | 书签管理 |

**总计：39 个接口**

### 4.2 认证模块 API

#### POST /api/auth/login
**功能：** 管理员登录

**请求：**
```json
{
  "username": "admin",
  "password": "ZINFOID_03Q"
}
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "admin_id": 1,
    "username": "admin",
    "email": "admin@example.com"
  }
}
```

**错误码：**
- 1001: 用户名或密码错误
- 1002: 账号已被禁用

#### POST /api/auth/logout
**功能：** 管理员登出

**响应：**
```json
{
  "code": 0,
  "message": "登出成功"
}
```

#### GET /api/auth/session
**功能：** 检查 Session 有效性

**响应：**
```json
{
  "code": 0,
  "data": {
    "logged_in": true,
    "admin_id": 1
  }
}
```

### 4.3 子账号模块 API

#### GET /api/children
**功能：** 获取当前管理员的子账号列表

**响应：**
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "name": "小明",
      "avatar": "/storage/avatars/1.jpg",
      "birth_date": "2015-05-10",
      "books_count": 12,
      "devices_count": 1,
      "today_reading_minutes": 45
    }
  ]
}
```

#### POST /api/children
**功能：** 创建子账号

**请求：**
```json
{
  "name": "小明",
  "birth_date": "2015-05-10"
}
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "child_id": 1
  }
}
```

#### PUT /api/children/:id
**功能：** 更新子账号信息

**请求：**
```json
{
  "name": "小明",
  "avatar": "/storage/avatars/1.jpg"
}
```

#### DELETE /api/children/:id
**功能：** 删除子账号（级联删除相关数据）

### 4.4 设备模块 API

#### POST /api/devices/bind
**功能：** 绑定电视设备

**请求：**
```json
{
  "bind_code": "123456",
  "child_id": 1
}
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "device_id": 1,
    "device_name": "小米电视-客厅"
  }
}
```

**错误码：**
- 2001: 绑定码无效或已过期
- 2002: 绑定码已被使用
- 2003: 设备已绑定其他账号

#### GET /api/devices
**功能：** 获取设备列表

**响应：**
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "device_name": "小米电视-客厅",
      "child_name": "小明",
      "last_online_at": "2024-01-01T15:30:00Z",
      "online": true
    }
  ]
}
```

#### PUT /api/devices/:id
**功能：** 更新设备名称

**请求：**
```json
{
  "device_name": "卧室电视"
}
```

#### DELETE /api/devices/:id
**功能：** 解绑设备

#### POST /api/devices/:id/command
**功能：** 发送远程指令

**请求：**
```json
{
  "command": "exit"  // exit/lock/restart
}
```

### 4.5 书籍模块 API

#### POST /api/books/upload
**功能：** 上传书籍文件

**请求：** FormData
```
file: <File>
title: "书名"
author: "作者"
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "book_id": 1,
    "title": "西游记",
    "author": "吴承恩",
    "format": "EPUB",
    "total_pages": 320,
    "total_chapters": 100,
    "cover_path": "/storage/covers/1.jpg"
  }
}
```

**错误码：**
- 3001: 文件格式不支持
- 3002: 文件解析失败
- 3003: 文件过大（限制 50MB）

#### GET /api/books
**功能：** 获取书籍列表

**查询参数：**
- page: 页码（默认 1）
- limit: 每页数量（默认 20）
- search: 搜索关键词

**响应：**
```json
{
  "code": 0,
  "data": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "books": [
      {
        "id": 1,
        "title": "西游记",
        "author": "吴承恩",
        "cover_path": "/storage/covers/1.jpg",
        "total_pages": 320,
        "assigned_children": [1, 2]
      }
    ]
  }
}
```

#### GET /api/books/:id
**功能：** 获取书籍详情

**响应：**
```json
{
  "code": 0,
  "data": {
    "id": 1,
    "title": "西游记",
    "author": "吴承恩",
    "publisher": "人民文学出版社",
    "cover_path": "/storage/covers/1.jpg",
    "total_pages": 320,
    "total_chapters": 100,
    "chapters": [
      {"index": 1, "title": "第一回", "start_page": 1, "end_page": 10},
      {"index": 2, "title": "第二回", "start_page": 11, "end_page": 20}
    ],
    "assigned_children": [
      {"child_id": 1, "child_name": "小明"}
    ]
  }
}
```

#### PUT /api/books/:id
**功能：** 更新书籍信息（标题、作者、封面等）

#### DELETE /api/books/:id
**功能：** 删除书籍（级联删除章节、授权记录）

#### POST /api/books/:id/assign
**功能：** 授权书籍给子账号

**请求：**
```json
{
  "child_ids": [1, 2]
}
```

#### DELETE /api/books/:id/assign
**功能：** 取消授权

**请求：**
```json
{
  "child_ids": [1]
}
```

#### GET /api/books/:id/preview
**功能：** 预览书籍内容

**查询参数：**
- chapter: 章节序号
- page: 页码

**响应：**
```json
{
  "code": 0,
  "data": {
    "chapter": 1,
    "page": 5,
    "content": "第一回内容..."
  }
}
```

### 4.6 电视端专用 API

#### POST /api/tv/register
**功能：** 电视设备首次注册

**请求：**
```json
{
  "device_token": "uuid-v4-generated-by-client"
}
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "registered": true,
    "bound": false
  }
}
```

#### GET /api/tv/bind-status
**功能：** 轮询绑定状态（3秒间隔）

**Header：** Authorization: Bearer {device_token}

**响应：**
```json
{
  "code": 0,
  "data": {
    "bound": true,
    "child": {
      "id": 1,
      "name": "小明"
    },
    "admin": {
      "username": "parent"
    }
  }
}
```

**未绑定响应：**
```json
{
  "code": 0,
  "data": {
    "bound": false,
    "bind_code": "123456",
    "expires_in": 600
  }
}
```

#### GET /api/tv/sync
**功能：** 同步书籍、进度、策略（60秒间隔）

**Header：** Authorization: Bearer {device_token}

**响应：**
```json
{
  "code": 0,
  "data": {
    "child": {
      "id": 1,
      "name": "小明"
    },
    "books": [
      {
        "id": 1,
        "title": "西游记",
        "author": "吴承恩",
        "cover_url": "https://server/storage/covers/1.jpg",
        "total_pages": 320,
        "total_chapters": 100,
        "progress": {
          "current_page": 45,
          "last_read_at": "2024-01-01T15:00:00Z"
        }
      }
    ],
    "policy": {
      "daily_limit_minutes": 120,
      "continuous_limit_minutes": 45,
      "rest_minutes": 15,
      "forbidden_start_time": "22:00",
      "forbidden_end_time": "07:00",
      "allowed_font_sizes": ["small", "medium", "large"],
      "allowed_themes": ["yellow", "white", "dark"]
    },
    "remote_command": null
  }
}
```

#### GET /api/tv/books/:id/chapters
**功能：** 获取书籍章节列表

**响应：**
```json
{
  "code": 0,
  "data": {
    "chapters": [
      {"index": 1, "title": "第一回", "pages": 10},
      {"index": 2, "title": "第二回", "pages": 12}
    ]
  }
}
```

#### GET /api/tv/books/:id/pages/:page
**功能：** 获取指定页面内容

**响应：**
```json
{
  "code": 0,
  "data": {
    "page": 45,
    "chapter": 5,
    "content": "页面文本内容...",
    "bookmarks": [
      {"id": 10, "preview": "孙悟空..." }
    ]
  }
}
```

#### POST /api/tv/session/start
**功能：** 开始阅读会话

**请求：**
```json
{
  "book_id": 1,
  "start_page": 45
}
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "session_id": "abc123",
    "allowed": true,
    "policy": {
      "daily_limit_minutes": 120,
      "continuous_limit_minutes": 45
    },
    "today_read_minutes": 30
  }
}
```

**拒绝阅读响应：**
```json
{
  "code": 0,
  "data": {
    "allowed": false,
    "reason": "forbidden_time",
    "message": "当前为禁止阅读时段（22:00-07:00）"
  }
}
```

#### POST /api/tv/session/heartbeat
**功能：** 阅读会话心跳（30秒间隔）

**请求：**
```json
{
  "session_id": "abc123",
  "current_page": 50,
  "duration_seconds": 1800
}
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "should_lock": false,
    "remaining_continuous_minutes": 15,
    "remaining_daily_minutes": 90,
    "remote_command": null
  }
}
```

**需要锁屏响应：**
```json
{
  "code": 0,
  "data": {
    "should_lock": true,
    "reason": "continuous_limit_exceeded",
    "lock_duration_minutes": 15,
    "message": "连续阅读已达45分钟，请休息15分钟"
  }
}
```

#### POST /api/tv/session/end
**功能：** 结束阅读会话

**请求：**
```json
{
  "session_id": "abc123",
  "end_page": 55
}
```

### 4.7 书签模块 API

#### POST /api/bookmarks
**功能：** 添加书签

**请求：**
```json
{
  "child_id": 1,
  "book_id": 1,
  "page_number": 50,
  "preview_text": "孙悟空从石头里蹦出来..."
}
```

#### GET /api/bookmarks
**功能：** 获取书签列表

**查询参数：**
- child_id: 子账号 ID
- book_id: 书籍 ID（可选）

**响应：**
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "book_title": "西游记",
      "page_number": 50,
      "preview_text": "孙悟空从石头里蹦出来...",
      "created_at": "2024-01-01T15:30:00Z"
    }
  ]
}
```

#### DELETE /api/bookmarks/:id
**功能：** 删除书签

#### PUT /api/bookmarks/batch-delete
**功能：** 批量删除书签

**请求：**
```json
{
  "bookmark_ids": [1, 2, 3]
}
```

### 4.8 防沉迷控制模块 API

#### GET /api/control/:child_id
**功能：** 获取防沉迷策略

**响应：**
```json
{
  "code": 0,
  "data": {
    "child_id": 1,
    "daily_limit_minutes": 120,
    "continuous_limit_minutes": 45,
    "rest_minutes": 15,
    "forbidden_start_time": "22:00",
    "forbidden_end_time": "07:00",
    "allowed_font_sizes": ["small", "medium", "large"],
    "allowed_themes": ["yellow", "white", "dark"]
  }
}
```

#### PUT /api/control/:child_id
**功能：** 更新防沉迷策略

**请求：**
```json
{
  "daily_limit_minutes": 90,
  "continuous_limit_minutes": 30,
  "rest_minutes": 10,
  "forbidden_start_time": "21:00",
  "forbidden_end_time": "08:00",
  "allowed_font_sizes": ["medium", "large"],
  "allowed_themes": ["yellow", "white"]
}
```

#### POST /api/control/:child_id/reset-daily
**功能：** 重置今日阅读时长（紧急情况使用）

### 4.9 统计模块 API

#### GET /api/stats/realtime/:child_id
**功能：** 获取实时阅读状态

**响应：**
```json
{
  "code": 0,
  "data": {
    "is_reading": true,
    "book_title": "西游记",
    "current_page": 50,
    "today_read_minutes": 45,
    "device_name": "客厅电视"
  }
}
```

#### GET /api/stats/history/:child_id
**功能：** 获取历史阅读记录

**查询参数：**
- start_date: 开始日期
- end_date: 结束日期
- page: 页码
- limit: 每页数量

**响应：**
```json
{
  "code": 0,
  "data": {
    "total": 100,
    "records": [
      {
        "date": "2024-01-01",
        "book_title": "西游记",
        "duration_minutes": 30,
        "pages": 15,
        "start_time": "10:00",
        "end_time": "10:30"
      }
    ]
  }
}
```

#### GET /api/stats/daily/:child_id
**功能：** 获取每日阅读统计

**查询参数：**
- start_date: 开始日期
- end_date: 结束日期

**响应：**
```json
{
  "code": 0,
  "data": [
    {
      "date": "2024-01-01",
      "total_minutes": 90,
      "books_read": 2,
      "pages_read": 45
    },
    {
      "date": "2024-01-02",
      "total_minutes": 60,
      "books_read": 1,
      "pages_read": 30
    }
  ]
}
```

#### GET /api/stats/summary/:child_id
**功能：** 获取阅读总结

**查询参数：**
- period: day/week/month

**响应：**
```json
{
  "code": 0,
  "data": {
    "period": "week",
    "total_minutes": 600,
    "total_books": 3,
    "total_pages": 200,
    "average_daily_minutes": 85,
    "most_read_book": {
      "id": 1,
      "title": "西游记",
      "minutes": 300
    },
    "completion_rate": 0.65
  }
}
```

#### GET /api/stats/export/:child_id
**功能：** 导出阅读数据为 Excel

**查询参数：**
- start_date: 开始日期
- end_date: 结束日期
- format: xlsx/csv

**响应：** 文件下载

---

## 5. 页面设计

### 5.1 Web 端页面设计（9个页面）

#### 5.1.1 登录页面 (Login.tsx)

**页面流程：**
```
┌─────────────────────────────────────┐
│           登录页面                   │
├─────────────────────────────────────┤
│  Logo                               │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 用户名                       │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ 密码                         │   │
│  └─────────────────────────────┘   │
│                                     │
│  [        登录按钮        ]         │
│                                     │
│  错误提示：用户名或密码错误          │
└─────────────────────────────────────┘
```

**交互流程：**
1. 用户输入用户名和密码
2. 点击登录按钮
3. 成功：跳转到仪表盘
4. 失败：显示错误提示

#### 5.1.2 仪表盘页面 (Dashboard.tsx)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部导航栏：Logo | 子账号选择器 | 退出登录                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  欢迎回来，[家长姓名]                                      │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 今日阅读    │ │ 本周阅读    │ │ 书籍总数    │           │
│  │ 45 分钟     │ │ 5.2 小时    │ │ 12 本       │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
│  当前阅读状态                                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📖 正在阅读《西游记》第 50 页                      │   │
│  │ 设备：客厅电视  已读：45 分钟                       │   │
│  │ [实时刷新]                                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  本周阅读趋势图                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │          📊 柱状图（每日阅读时长）                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**功能模块：**
- 子账号选择器：切换查看不同孩子的数据
- 今日/本周统计卡片
- 实时阅读状态（轮询更新）
- 本周阅读趋势图

#### 5.1.3 子账号管理页面 (Children.tsx)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部导航栏                                                │
├──────────────────────────────────────────────────────────┤
│  子账号管理                          [+ 添加子账号]       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 👤 小明        出生日期：2015-05-10               │   │
│  │    书籍：12 本 | 设备：1 台 | 今日阅读：45 分钟    │   │
│  │                                    [编辑] [删除]  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 👤 小红        出生日期：2017-08-20               │   │
│  │    书籍：8 本 | 设备：0 台 | 今日阅读：0 分钟      │   │
│  │                                    [编辑] [删除]  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**交互流程：**
1. 点击"添加子账号"：弹出表单，输入姓名、出生日期
2. 点击"编辑"：修改子账号信息
3. 点击"删除"：确认后删除（级联删除相关数据）

#### 5.1.4 设备管理页面 (Devices.tsx)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部导航栏                                                │
├──────────────────────────────────────────────────────────┤
│  设备管理                                                 │
│                                                          │
│  绑定设备步骤：                                            │
│  1. 在电视上打开阅读应用，获取 6 位绑定码                  │
│  2. 在下方输入绑定码完成绑定                               │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 绑定码：[______]  [绑定设备]                       │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  已绑定设备：                                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📺 小米电视-客厅                                  │   │
│  │    绑定账号：小明                                 │   │
│  │    最后在线：2 分钟前  🟢 在线                    │   │
│  │    [远程退出] [远程锁屏] [重命名] [解绑]           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**功能说明：**
- 输入绑定码绑定设备
- 查看设备在线状态
- 发送远程指令（退出/锁屏/重启）
- 解绑设备

#### 5.1.5 书籍管理页面 (Books.tsx)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部导航栏                                                │
├──────────────────────────────────────────────────────────┤
│  书籍管理                           [+ 上传书籍]          │
│                                                          │
│  搜索：[________________] [搜索]                          │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │  封面   │ │  封面   │ │  封面   │ │  封面   │        │
│  │ 西游记  │ │ 红楼梦  │ │ 水浒传  │ │ 三国演义│        │
│  │ 320 页  │ │ 450 页  │ │ 380 页  │ │ 420 页  │        │
│  │ 已授权  │ │ 未授权  │ │ 已授权  │ │ 已授权  │        │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
│                                                          │
│  [上一页] 1 / 5 [下一页]                                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**交互流程：**
1. 点击"上传书籍"：弹出上传表单
2. 点击书籍卡片：进入书籍详情页
3. 搜索功能：按书名、作者搜索

#### 5.1.6 书籍详情页面 (BookDetail.tsx)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部导航栏                      [返回书籍列表]            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────┐  书名：西游记                                 │
│  │        │  作者：吴承恩                                 │
│  │  封面  │  出版社：人民文学出版社                        │
│  │        │  总页数：320 页  章节：100 回                  │
│  └────────┘                                              │
│                                                          │
│  [编辑信息] [删除书籍]                                     │
│                                                          │
│  授权管理：                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ☑ 小明 (已读 45 页，进度 14%)                      │   │
│  │ ☐ 小红 (未授权)                                   │   │
│  │                                    [保存授权]     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  目录预览：                                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 第一回  灵根育孕源流出  心性修持大道生             │   │
│  │ 第二回  悟彻菩提真妙理  断魔归本合元神             │   │
│  │ ...                                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 5.1.7 阅读管控配置页面 (Control.tsx)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部导航栏                    子账号：[小明 ▼]            │
├──────────────────────────────────────────────────────────┤
│  阅读管控配置                                             │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 每日阅读时长限制                                  │   │
│  │ [120] 分钟                                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 连续阅读时长限制                                  │   │
│  │ [45] 分钟                                        │   │
│  │ 强制休息：[15] 分钟                               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 禁止阅读时段                                      │   │
│  │ 从 [22:00] 到 [07:00]                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 允许的字号                                        │   │
│  │ ☑ 小号  ☑ 中号  ☑ 大号                           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 允许的主题                                        │   │
│  │ ☑ 护眼黄  ☑ 白天模式  ☑ 夜间模式                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [保存配置]                                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 5.1.8 阅读统计页面 (Stats.tsx)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部导航栏                    子账号：[小明 ▼]            │
├──────────────────────────────────────────────────────────┤
│  阅读统计                                                 │
│                                                          │
│  时间范围：[本周 ▼]  [导出 Excel]                         │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 总阅读时长  │ │ 平均每日    │ │ 书籍完成率  │           │
│  │ 5.2 小时    │ │ 85 分钟     │ │ 65%        │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
│  每日阅读时长趋势                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │          📊 柱状图                                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  书籍阅读排行                                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 1. 西游记        300 分钟  进度 90%               │   │
│  │ 2. 红楼梦        120 分钟  进度 30%               │   │
│  │ 3. 水浒传        80 分钟   进度 20%               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  阅读记录                                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 2024-01-01  西游记  10:00-10:30  30 分钟  15 页  │   │
│  │ 2024-01-01  红楼梦  14:00-15:00  60 分钟  30 页  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 5.1.9 书签管理页面 (Bookmarks.tsx)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│ 顶部导航栏                    子账号：[小明 ▼]            │
├──────────────────────────────────────────────────────────┤
│  书签管理                                                 │
│                                                          │
│  筛选：书籍 [全部 ▼]                                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📖 西游记 - 第 50 页                              │   │
│  │ "孙悟空从石头里蹦出来..."                          │   │
│  │ 添加时间：2024-01-01 15:30                        │   │
│  │ [预览] [删除]                                     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📖 西游记 - 第 120 页                             │   │
│  │ "三打白骨精..."                                   │   │
│  │ 添加时间：2024-01-02 10:00                        │   │
│  │ [预览] [删除]                                     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

### 5.2 电视端页面设计（4个页面）

#### 5.2.1 设备绑定页面 (BindFragment.kt)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│              儿童护眼阅读器                               │
│                                                          │
│              请在家长后台输入绑定码                        │
│                                                          │
│                  ┌───────────┐                           │
│                  │           │                           │
│                  │   1 2 3   │                           │
│                  │   4 5 6   │                           │
│                  │           │                           │
│                  └───────────┘                           │
│                                                          │
│              绑定码 10 分钟内有效                         │
│                                                          │
│              等待绑定中...                                │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**遥控器交互：**
- 无需按键操作，自动轮询绑定状态
- 绑定成功后自动跳转到书架页面

**状态流转：**
```
[首次启动] → [生成绑定码] → [显示绑定码] → [轮询绑定状态]
                                                    ↓
                                            [绑定成功] → [同步数据] → [进入书架]
```

#### 5.2.2 书架页面 (ShelfActivity.kt)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  小明的书架                                               │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                    │
│  │  ━━━━  │ │  ━━━━  │ │  ━━━━  │                    │
│  │  封面  │ │  封面  │ │  封面  │                    │
│  │        │ │        │ │        │                    │
│  │ 西游记 │ │ 红楼梦 │ │ 水浒传 │                    │
│  │ ━━━━━ │ │        │ │        │                    │
│  │ 45/320 │ │        │ │        │                    │
│  └─────────┘ └─────────┘ └─────────┘                    │
│       ↑ (焦点)                                           │
│                                                          │
│  ┌─────────┐ ┌─────────┐                                │
│  │  ━━━━  │ │  ━━━━  │                                │
│  │  封面  │ │  封面  │                                │
│  │        │ │        │                                │
│  │三国演义│ │ 西厢记 │                                │
│  │        │ │        │                                │
│  └─────────┘ └─────────┘                                │
│                                                          │
│  [OK键] 打开书籍  [返回键] 退出应用                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**遥控器交互：**
- 上/下/左/右：切换书籍焦点
- OK：打开选中的书籍
- 返回：退出应用（需确认）

**视觉效果：**
- 焦点卡片：放大 10%，黄色边框
- 阅读进度条：底部蓝色细条
- 按最近阅读排序

#### 5.2.3 阅读页面 (ReaderFragment.kt)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│                                              第 50/320 页 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                                                          │
│   第一回  灵根育孕源流出                                  │
│                                                          │
│   诗曰：                                                 │
│   混沌未分天地乱，茫茫渺渺无人见。                        │
│   自从盘古破鸿蒙，开辟从兹清浊辨。                        │
│   覆载群生仰至仁，发明万物皆成善。                        │
│   欲知造化会元功，须看西游释厄传。                        │
│                                                          │
│   盖闻天地之数，有十二万九千六百岁为一元。                │
│   将一元分为十二会，乃子、丑、寅、卯、辰、巳、            │
│   午、未、申、酉、戌、亥之十二支也。                      │
│                                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  (进度条)                                                 │
└──────────────────────────────────────────────────────────┘
```

**遥控器交互：**
- 左键：上一页
- 右键：下一页（长按快速翻页）
- 长按 OK：添加书签
- 菜单键：打开阅读功能菜单
- 返回键：返回书架

**翻页动画：**
- 淡入淡出，0.3 秒过渡
- 双 View 切换实现

**阅读功能菜单：**
```
┌─────────────────────────┐
│   阅读设置              │
│   书签列表              │
│   目录跳转              │
└─────────────────────────┘
```

**阅读设置菜单：**
```
┌─────────────────────────┐
│ 字号                    │
│   小号  [中号]  大号    │
│                         │
│ 主题                    │
│   [护眼黄]  白天  夜间  │
│                         │
│         [保存]          │
└─────────────────────────┘
```

**书签列表：**
```
┌─────────────────────────┐
│ 第 50 页                │
│ "孙悟空从石头里..."     │
│                         │
│ 第 120 页               │
│ "三打白骨精..."         │
│                         │
│ 第 200 页               │
│ "火焰山..."             │
└─────────────────────────┘
```

**目录跳转：**
```
┌─────────────────────────┐
│ 第一回  灵根育孕源流出  │
│ 第二回  悟彻菩提真妙理  │
│ 第三回  四海千山皆拱伏  │
│ 第四回  官封弼马心何足  │
│ ...                     │
└─────────────────────────┘
```

#### 5.2.4 锁屏休息页面 (LockFragment.kt)

**页面布局：**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│                                                          │
│                                                          │
│                    ⏸️ 休息时间                           │
│                                                          │
│               连续阅读已超过限制                          │
│                                                          │
│                  请休息 15 分钟                          │
│                                                          │
│                    ┌─────┐                               │
│                    │ 12: │                               │
│                    │ 45  │                               │
│                    └─────┘                               │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**功能说明：**
- 显示倒计时
- 禁止任何操作（遥控器无效）
- 倒计时结束后自动返回书架

---

## 6. 安全设计

### 6.1 认证授权机制

#### 6.1.1 Web 端认证

**Session + Cookie 方案：**
```
登录流程：
1. 用户提交用户名和密码
2. 服务端验证后创建 Session
3. 返回 Set-Cookie (HttpOnly, Secure, SameSite)
4. 后续请求自动携带 Cookie
5. 服务端通过 Session ID 验证用户身份

Session 配置：
- 过期时间：24 小时
- 存储：内存（可迁移到 Redis）
- Cookie 属性：HttpOnly, Secure, SameSite=Strict
```

#### 6.1.2 电视端认证

**Device Token 方案：**
```
认证流程：
1. 电视端首次启动生成 UUID v4 作为 device_token
2. 调用 POST /api/tv/register 注册设备
3. 后续请求携带 Authorization: Bearer {device_token}
4. 服务端验证 device_token 有效性并关联的 child_id

Token 存储：
- Android EncryptedSharedPreferences 加密存储
- 设备唯一，不可篡改
```

#### 6.1.3 权限控制

**Web 端权限：**
- 每个管理员只能访问自己创建的子账号、设备、书籍
- authGuard 中间件验证 Session 中的 admin_id
- 所有数据查询添加 admin_id 过滤条件

**电视端权限：**
- 设备只能访问绑定子账号的授权书籍
- deviceAuth 中间件验证 device_token 并获取 child_id
- 所有数据查询添加 child_id 过滤条件

### 6.2 错误码定义

#### 6.2.1 通用错误码 (0-999)

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 500 | 服务器内部错误 |
| 501 | 参数验证失败 |
| 502 | 请求频率过高 |

#### 6.2.2 认证错误码 (1000-1999)

| 错误码 | 说明 |
|--------|------|
| 1001 | 用户名或密码错误 |
| 1002 | 账号已被禁用 |
| 1003 | Session 已过期 |
| 1004 | 未登录 |
| 1005 | 权限不足 |

#### 6.2.3 设备错误码 (2000-2999)

| 错误码 | 说明 |
|--------|------|
| 2001 | 绑定码无效或已过期 |
| 2002 | 绑定码已被使用 |
| 2003 | 设备已绑定其他账号 |
| 2004 | 设备未绑定 |
| 2005 | 设备 Token 无效 |
| 2006 | 设备离线 |

#### 6.2.4 书籍错误码 (3000-3999)

| 错误码 | 说明 |
|--------|------|
| 3001 | 文件格式不支持 |
| 3002 | 文件解析失败 |
| 3003 | 文件过大（限制 50MB） |
| 3004 | 书籍不存在 |
| 3005 | 无权访问此书籍 |
| 3006 | 章节不存在 |
| 3007 | 页码超出范围 |

#### 6.2.5 阅读控制错误码 (4000-4999)

| 错误码 | 说明 |
|--------|------|
| 4001 | 已达每日阅读时长限制 |
| 4002 | 已达连续阅读时长限制 |
| 4003 | 当前为禁止阅读时段 |
| 4004 | 会话不存在 |
| 4005 | 会话已结束 |

### 6.3 数据安全

#### 6.3.1 密码安全

- 使用 bcryptjs 加密，10 轮 salt
- 密码传输使用 HTTPS
- 密码不记录到日志

#### 6.3.2 敏感数据保护

**不记录到日志的敏感信息：**
- 用户密码
- Session ID
- Device Token
- 绑定码

**数据库加密：**
- 电视端 Room 数据库启用加密
- 服务端 SQLite 文件权限限制（600）

#### 6.3.3 文件上传安全

- 文件类型白名单：EPUB, PDF, TXT
- 文件大小限制：50MB
- 文件名随机化，防止路径遍历
- 上传文件独立存储目录，不与代码混放

#### 6.3.4 API 安全

- 所有 API 强制 HTTPS
- 输入参数验证
- SQL 注入防护（参数化查询）
- XSS 防护（输出转义）
- CSRF 防护（SameSite Cookie）

---

## 7. 测试策略

### 7.1 单元测试

#### 7.1.1 后端单元测试

**测试框架：** Jest

**测试覆盖模块：**
- services/bookParser.ts - 书籍解析逻辑
- services/antiAddiction.ts - 防沉迷计算逻辑
- services/statsEngine.ts - 统计计算逻辑
- utils/*.ts - 工具函数

**测试命令：**
```bash
npm run test:unit
```

**目标覆盖率：** 80%

#### 7.1.2 Web 端单元测试

**测试框架：** Vitest + React Testing Library

**测试覆盖模块：**
- hooks/*.ts - 自定义 Hooks
- components/*.tsx - 通用组件
- utils/*.ts - 工具函数

**测试命令：**
```bash
npm run test:unit
```

**目标覆盖率：** 70%

### 7.2 集成测试

#### 7.2.1 API 集成测试

**测试框架：** Jest + Supertest

**测试内容：**
- 认证流程测试
- 设备绑定流程测试
- 书籍上传解析测试
- 阅读会话流程测试
- 防沉迷控制测试

**测试数据库：** 使用内存 SQLite，每次测试重新初始化

**测试命令：**
```bash
npm run test:integration
```

### 7.3 E2E 测试

#### 7.3.1 Web 端 E2E 测试

**测试框架：** Playwright

**测试场景：**
- 用户登录流程
- 子账号管理流程
- 设备绑定流程
- 书籍上传授权流程
- 阅读统计查看

**测试命令：**
```bash
npm run test:e2e
```

### 7.4 测试环境

**开发环境：**
- 本地运行
- 使用内存 SQLite

**测试环境：**
- CI/CD 中运行
- 使用内存 SQLite

**生产环境：**
- Azure VM
- 持久化 SQLite 文件

---

## 8. 部署方案

### 8.1 服务器环境准备

#### 8.1.1 基础环境

**操作系统：** Ubuntu 20.04 LTS

**必需软件：**
```bash
# Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2

# Nginx (可选)
sudo apt-get install -y nginx
```

#### 8.1.2 防火墙配置

```bash
# 开放应用端口（如 8015）
sudo ufw allow 8015/tcp

# 开放 SSH
sudo ufw allow 22/tcp

# 启用防火墙
sudo ufw enable
```

### 8.2 应用部署

#### 8.2.1 后端部署

**步骤：**
```bash
# 1. 上传代码到服务器
scp -r server/ <deploy-user>@<deploy-host>:<deploy-root>/

# 2. 安装依赖
cd <deploy-root>/server
npm install --production

# 3. 编译 TypeScript
npm run build

# 4. 创建数据和存储目录
mkdir -p data storage/originals storage/parsed storage/covers

# 5. 启动服务
pm2 start dist/server.js --name readbook-server

# 6. 保存 PM2 配置
pm2 save

# 7. 设置开机自启
pm2 startup
```

#### 8.2.2 Web 前端部署

**步骤：**
```bash
# 1. 本地构建
cd web
npm run build

# 2. 上传构建产物到服务器
scp -r dist/ <deploy-user>@<deploy-host>:<deploy-root>/web/

# 3. 后端静态文件服务配置（在 app.ts 中）
app.use(express.static(path.join(__dirname, '../web/dist')));
```

#### 8.2.3 电视端部署

**步骤：**
```bash
# 1. 构建 APK
cd tv-app
./gradlew assembleRelease

# 2. 通过 ADB 安装到电视
adb install app/release/app-release.apk

# 或通过 USB 拷贝到电视安装
```

### 8.3 Nginx 反向代理（可选）

#### 8.3.1 配置示例

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://localhost:8015;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 8.3.2 HTTPS 配置（推荐）

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8015;
        # ... 同上
    }
}

server {
    listen 80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}
```

### 8.4 数据备份

#### 8.4.1 数据库备份

**备份脚本：**
```bash
#!/bin/bash
BACKUP_DIR="<backup-dir>"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp <deploy-root>/server/data/readbook.db \
   $BACKUP_DIR/readbook_$DATE.db

# 保留最近 7 天的备份
find $BACKUP_DIR -name "readbook_*.db" -mtime +7 -delete
```

**定时任务：**
```bash
# 每天凌晨 3 点备份
0 3 * * * <backup-script-path>
```

#### 8.4.2 文件备份

```bash
# 备份书籍文件
tar -czf $BACKUP_DIR/storage_$DATE.tar.gz \
    <deploy-root>/server/storage/
```

### 8.5 监控告警

#### 8.5.1 PM2 监控

```bash
# 查看应用状态
pm2 status

# 查看日志
pm2 logs readbook-server

# 监控面板
pm2 monit
```

#### 8.5.2 系统监控

**监控指标：**
- CPU 使用率
- 内存使用率
- 磁盘空间
- 网络流量

**告警配置：**
- CPU > 80% 持续 5 分钟
- 内存 > 80%
- 磁盘剩余 < 10GB
- 应用进程退出

### 8.6 更新部署

#### 8.6.1 后端更新

```bash
# 1. 拉取最新代码
cd <deploy-root>/server
git pull

# 2. 安装新依赖
npm install --production

# 3. 编译
npm run build

# 4. 重启服务
pm2 restart readbook-server
```

#### 8.6.2 Web 前端更新

```bash
# 1. 本地构建
cd web
npm run build

# 2. 上传覆盖
scp -r dist/* <deploy-user>@<deploy-host>:<deploy-root>/web/dist/

# 无需重启服务，静态文件自动更新
```

---

## 9. 附录

### 9.1 UI 视觉规范

#### 9.1.1 布局规范

- 屏幕比例：16:9 固定
- 内容区域：左右留白 12%，上下留白 10%
- 不全屏铺满，避免边缘反光
- 正文左对齐，无多余装饰元素

#### 9.1.2 字体规范

- 正文字体：**微软雅黑 / 思源黑体 Noto Sans CJK SC**
- 正文：Regular（常规）
- 标题：Bold（加粗）
- 禁止使用：宋体、楷体、书法体、艺术字体

#### 9.1.3 字号规范（dp）

- 正文小号：36
- 正文默认：42
- 正文大号：48
- 书籍 / 章节标题：52（加粗）
- 菜单文字：40
- 页码及辅助提示：24

#### 9.1.4 颜色主题规范

**主题 1：护眼黄（系统默认）**
- 背景色：`#FFF8DC`
- 正文颜色：`#2A2A2A`
- 辅助文字 / 页码：`#888888`

**主题 2：柔和白天模式**
- 背景色：`#FAFAFA`
- 正文颜色：`#1A1A1A`
- 辅助文字 / 页码：`#777777`

**主题 3：夜间护眼模式**
- 背景色：`#222222`
- 正文颜色：`#E0E0E0`
- 辅助文字 / 页码：`#AAAAAA`

#### 9.1.5 排版与控件

- 正文行高：1.8 倍
- 段落间距：2 倍行高
- 底部进度条高度：4dp，颜色：`#5B9BD5`
- 页码固定显示在右上角
- 菜单弹窗居中，圆角简洁样式

### 9.2 通信协议

#### 9.2.1 轮询策略

| 状态 | 间隔 | 接口 |
|------|------|------|
| 等待绑定 | 3s | GET /api/tv/bind-status |
| 书架空闲 | 60s | GET /api/tv/sync |
| 阅读中 | 30s | POST /api/tv/session/heartbeat |

---

*文档版本：v1.0*
*最后更新：2026-04-17*
