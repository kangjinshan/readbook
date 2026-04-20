import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { closeDatabase, execute, initDatabase } from '../../src/database';
import { config } from '../../src/config';

jest.mock('../../src/middleware/deviceAuth', () => ({
  deviceAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const request = req as express.Request & { adminId?: number; childId?: number; deviceId?: number };
    request.adminId = 1;
    request.childId = 1;
    request.deviceId = 1;
    next();
  },
  requireDeviceBound: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../../src/services/antiAddiction', () => ({
  antiAddictionService: {
    getPolicy: () => ({
      dailyLimitMinutes: 120,
      continuousLimitMinutes: 45,
      restMinutes: 15,
      forbiddenStartTime: null,
      forbiddenEndTime: null,
      allowedFontSizes: ['medium'],
      allowedThemes: ['light'],
    }),
  },
}));

import tvRouter from '../../src/routes/tv';

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/tv', tvRouter);

  return new Promise<{ server: import('http').Server; origin: string }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

async function closeServer(server: import('http').Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeAllConnections?.();
  });
}

describe('tv sync cover urls', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readbook-tv-cover-'));
    config.database.path = path.join(tempDir, 'readbook.db');
    config.storage.originals = path.join(tempDir, 'storage', 'originals');
    config.storage.parsed = path.join(tempDir, 'storage', 'parsed');
    config.storage.covers = path.join(tempDir, 'storage', 'covers');
    fs.mkdirSync(config.storage.originals, { recursive: true });
    fs.mkdirSync(config.storage.parsed, { recursive: true });
    fs.mkdirSync(config.storage.covers, { recursive: true });

    await initDatabase();
    execute('INSERT INTO children (id, admin_id, name) VALUES (?, ?, ?)', [1, 1, '小明']);
    execute('INSERT INTO devices (id, admin_id, child_id, device_token) VALUES (?, ?, ?, ?)', [1, 1, 1, 'token-1']);
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns absolute cover urls for normalized stored cover paths', async () => {
    const bookResult = execute(
      `INSERT INTO books (admin_id, title, author, cover_path, original_path, format, total_pages, total_chapters, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 'TV Cover Book', 'Author', 'covers/7.png', '/tmp/book.epub', 'EPUB', 10, 1, 100]
    );
    execute('INSERT INTO book_assignments (book_id, child_id) VALUES (?, ?)', [bookResult.lastInsertRowId, 1]);

    const { server, origin } = await createServer();

    try {
      const response = await fetch(`${origin}/api/tv/sync`);
      const payload = await response.json() as {
        code: number;
        data: {
          books: Array<{ coverUrl: string | null }>;
        };
      };

      expect(response.status).toBe(200);
      expect(payload.code).toBe(0);
      expect(payload.data.books[0]?.coverUrl).toBe(`${origin}/storage/covers/7.png`);
    } finally {
      await closeServer(server);
    }
  });
});
