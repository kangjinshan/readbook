import initSqlJs from 'sql.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { closeDatabase, initDatabase } from '../src/database';
import { config } from '../src/config';

describe('database migrations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readbook-db-migration-'));
    config.database.path = path.join(tempDir, 'readbook.db');
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists new children columns during initDatabase', async () => {
    const SQL = await initSqlJs();
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE children (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        name VARCHAR(50) NOT NULL,
        avatar VARCHAR(255),
        birth_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    fs.writeFileSync(config.database.path, Buffer.from(legacyDb.export()));

    await initDatabase();

    const reopenedDb = new SQL.Database(fs.readFileSync(config.database.path));
    const tableInfo = reopenedDb.exec('PRAGMA table_info(children)');
    const columnNames = tableInfo[0]?.values?.map((row) => String(row[1])) ?? [];

    expect(columnNames).toContain('daily_reading_reset_at');
  });
});
