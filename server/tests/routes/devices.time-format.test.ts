import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { closeDatabase, execute, initDatabase } from '../../src/database';
import { config } from '../../src/config';

jest.mock('../../src/middleware/authGuard', () => ({
  authGuard: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  getCurrentAdminId: () => 1,
}));

import devicesRouter from '../../src/routes/devices';

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/devices', devicesRouter);

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

describe('devices routes time formatting', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readbook-devices-time-'));
    config.database.path = path.join(tempDir, 'readbook.db');
    config.storage.originals = path.join(tempDir, 'storage', 'originals');
    config.storage.parsed = path.join(tempDir, 'storage', 'parsed');
    config.storage.covers = path.join(tempDir, 'storage', 'covers');
    fs.mkdirSync(config.storage.originals, { recursive: true });
    fs.mkdirSync(config.storage.parsed, { recursive: true });
    fs.mkdirSync(config.storage.covers, { recursive: true });

    await initDatabase();
    execute('INSERT INTO children (id, admin_id, name) VALUES (?, ?, ?)', [1, 1, '小明']);
    execute(
      `INSERT INTO devices
        (id, admin_id, child_id, device_token, device_name, last_online_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [7, 1, 1, 'token-7', '客厅电视', '2026-04-18 14:06:26', '2026-04-18 09:00:00']
    );
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns device timestamps as ISO strings with timezone information', async () => {
    const { server, origin } = await createServer();

    try {
      const response = await fetch(`${origin}/api/devices`);
      const payload = await response.json() as {
        code: number;
        data: Array<{
          id: number;
          lastOnlineAt: string | null;
          createdAt: string | null;
        }>;
      };

      expect(response.status).toBe(200);
      expect(payload.code).toBe(0);
      expect(payload.data[0]?.id).toBe(7);
      expect(payload.data[0]?.lastOnlineAt).toBe('2026-04-18T14:06:26.000Z');
      expect(payload.data[0]?.createdAt).toBe('2026-04-18T09:00:00.000Z');
    } finally {
      await closeServer(server);
    }
  });
});
