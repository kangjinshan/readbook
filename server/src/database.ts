import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { config } from './config';

let db: Database | null = null;
let saveScheduled = false;
type DatabaseRow = Record<string, unknown>;

/**
 * 初始化数据库
 */
export async function initDatabase(): Promise<Database> {
  const SQL = await initSqlJs();

  // 尝试加载已有数据库
  const dbPath = path.resolve(config.database.path);
  const dbDir = path.dirname(dbPath);

  // 确保目录存在
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let dbBuffer: Uint8Array | undefined;
  if (fs.existsSync(dbPath)) {
    dbBuffer = fs.readFileSync(dbPath);
  }

  db = new SQL.Database(dbBuffer);

  // 创建表
  createTables(db);

  // 初始化默认管理员账号
  await initDefaultAdmin(db);

  // 启动阶段产生的建表和迁移也要立即落盘，否则下次重启前不会持久化。
  saveDatabase();

  console.log('数据库初始化完成');
  return db;
}

/**
 * 获取数据库实例
 */
export function getDatabase(): Database {
  if (!db) {
    throw new Error('数据库未初始化');
  }
  return db;
}

/**
 * 保存数据库到文件
 */
export function saveDatabase(): void {
  if (!db) return;
  const dbPath = path.resolve(config.database.path);
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function scheduleDatabaseSave(): void {
  if (saveScheduled) return;
  saveScheduled = true;
  queueMicrotask(() => {
    saveScheduled = false;
    saveDatabase();
  });
}

/**
 * 关闭数据库
 */
export function closeDatabase(): void {
  if (!db) return;
  saveScheduled = false;
  saveDatabase();
  db.close();
  db = null;
}

/**
 * 创建数据库表
 */
function createTables(database: Database): void {
  // 管理员账号表
  database.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 儿童子账号表
  database.run(`
    CREATE TABLE IF NOT EXISTS children (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      name VARCHAR(50) NOT NULL,
      avatar VARCHAR(255),
      birth_date DATE,
      daily_reading_reset_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    )
  `);
  ensureColumn(database, 'children', 'daily_reading_reset_at', 'DATETIME');

  // 电视设备表
  database.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      child_id INTEGER,
      device_token VARCHAR(255) UNIQUE NOT NULL,
      device_name VARCHAR(100),
      bind_code VARCHAR(6),
      bind_code_expires_at DATETIME,
      last_online_at DATETIME,
      remote_command VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL
    )
  `);

  // 书籍元数据表
  database.run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      title VARCHAR(255) NOT NULL,
      author VARCHAR(100),
      publisher VARCHAR(100),
      cover_path VARCHAR(255),
      original_path VARCHAR(255) NOT NULL,
      format VARCHAR(10) NOT NULL,
      total_pages INTEGER NOT NULL,
      total_chapters INTEGER,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    )
  `);
  ensureColumn(database, 'books', 'parse_mode', `VARCHAR(20) NOT NULL DEFAULT 'plain_text'`);
  database.run(`
    UPDATE books
    SET parse_mode = 'plain_text'
    WHERE parse_mode IS NULL
      OR TRIM(parse_mode) = ''
      OR parse_mode NOT IN ('plain_text', 'webview')
  `);

  // 章节表
  database.run(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      chapter_index INTEGER NOT NULL,
      title VARCHAR(255),
      content_path VARCHAR(255) NOT NULL,
      start_page INTEGER NOT NULL,
      end_page INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // 书籍授权表
  database.run(`
    CREATE TABLE IF NOT EXISTS book_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(book_id, child_id),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
    )
  `);

  // 阅读进度表
  database.run(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      current_page INTEGER NOT NULL DEFAULT 1,
      total_time_seconds INTEGER NOT NULL DEFAULT 0,
      last_read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(child_id, book_id),
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // 书签表
  database.run(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      page_number INTEGER NOT NULL,
      preview_text VARCHAR(100),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // 书签索引
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_bookmarks_child_book ON bookmarks(child_id, book_id)
  `);

  // 阅读会话记录表
  database.run(`
    CREATE TABLE IF NOT EXISTS reading_sessions (
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
    )
  `);

  // 会话索引
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_sessions_child_time ON reading_sessions(child_id, start_time)
  `);

  // 防沉迷策略表
  database.run(`
    CREATE TABLE IF NOT EXISTS control_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      child_id INTEGER NOT NULL UNIQUE,
      daily_limit_minutes INTEGER NOT NULL DEFAULT 120,
      continuous_limit_minutes INTEGER NOT NULL DEFAULT 45,
      rest_minutes INTEGER NOT NULL DEFAULT 15,
      forbidden_start_time TIME,
      forbidden_end_time TIME,
      allowed_font_sizes TEXT,
      allowed_themes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
    )
  `);

  // 每日阅读汇总表
  database.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
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
    )
  `);

  // 操作日志表
  database.run(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      child_id INTEGER,
      device_id INTEGER,
      operation VARCHAR(50) NOT NULL,
      details TEXT,
      ip_address VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
      FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
    )
  `);

  // 日志索引
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_logs_time ON operation_logs(created_at)
  `);
}

function ensureColumn(database: Database, tableName: string, columnName: string, columnDefinition: string): void {
  const tableInfo = database.exec(`PRAGMA table_info(${tableName})`);
  const columns = tableInfo[0]?.values?.map((row) => String(row[1])) ?? [];
  if (columns.includes(columnName)) {
    return;
  }
  database.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

/**
 * 初始化默认管理员账号
 */
async function initDefaultAdmin(database: Database): Promise<void> {
  const bcrypt = require('bcryptjs');

  // 检查是否已有管理员
  const result = database.exec('SELECT COUNT(*) as count FROM admins');
  const count = result[0]?.values[0]?.[0] as number || 0;

  if (count === 0) {
    const initialPassword = config.admin.initialPassword || randomBytes(12).toString('base64url');
    const hashedPassword = await bcrypt.hash(initialPassword, 10);
    database.run(
      'INSERT INTO admins (username, password_hash, email) VALUES (?, ?, ?)',
      [config.admin.initialUsername, hashedPassword, 'admin@example.com']
    );
    console.log(`已创建初始管理员账号: ${config.admin.initialUsername} / ${initialPassword}`);
  }
}

/**
 * 执行查询
 */
export function query<T extends DatabaseRow = DatabaseRow>(sql: string, params: any[] = []): T[] {
  const database = getDatabase();
  const stmt = database.prepare(sql);
  stmt.bind(params);

  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as T;
    results.push(row);
  }
  stmt.free();
  return results;
}

/**
 * 执行单条查询
 */
export function queryOne<T extends DatabaseRow = DatabaseRow>(sql: string, params: any[] = []): T | null {
  const results = query<T>(sql, params);
  return results[0] ?? null;
}

/**
 * 执行插入/更新/删除
 */
export function execute(sql: string, params: any[] = []): { lastInsertRowId: number; changes: number } {
  const database = getDatabase();
  database.run(sql, params);

  let lastInsertRowId = 0;
  const isInsert = /^\s*INSERT\s+INTO\s+/i.test(sql);
  if (isInsert) {
    try {
      const result = database.exec('SELECT last_insert_rowid() as id');
      lastInsertRowId = Number(result[0]?.values[0]?.[0]) || 0;
    } catch (e) {
      console.error('获取 lastInsertRowId 失败:', e);
    }
  }

  scheduleDatabaseSave();

  return {
    lastInsertRowId,
    changes: database.getRowsModified()
  };
}

/**
 * 执行事务
 * @param operations 要执行的操作函数数组
 */
export function transaction<T>(fn: (db: Database) => T): T {
  const database = getDatabase();
  try {
    database.run('BEGIN TRANSACTION');
    const result = fn(database);
    database.run('COMMIT');
    scheduleDatabaseSave();
    return result;
  } catch (e) {
    database.run('ROLLBACK');
    throw e;
  }
}

/**
 * 批量执行SQL语句（事务内）
 */
export function batchExecute(statements: Array<{ sql: string; params: any[] }>): { totalChanges: number } {
  return transaction((db) => {
    let totalChanges = 0;
    for (const { sql, params } of statements) {
      db.run(sql, params);
      totalChanges += db.getRowsModified();
    }
    return { totalChanges };
  });
}
