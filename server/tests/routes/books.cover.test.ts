import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { closeDatabase, execute, initDatabase, queryOne } from '../../src/database';
import { config, ErrorCodes } from '../../src/config';

jest.mock('../../src/middleware/authGuard', () => ({
  authGuard: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  getCurrentAdminId: () => 1,
}));

import booksRouter from '../../src/routes/books';

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/books', booksRouter);

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

describe('books cover routes', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readbook-books-cover-'));
    config.database.path = path.join(tempDir, 'readbook.db');
    config.storage.originals = path.join(tempDir, 'storage', 'originals');
    config.storage.parsed = path.join(tempDir, 'storage', 'parsed');
    config.storage.covers = path.join(tempDir, 'storage', 'covers');
    fs.mkdirSync(config.storage.originals, { recursive: true });
    fs.mkdirSync(config.storage.parsed, { recursive: true });
    fs.mkdirSync(config.storage.covers, { recursive: true });

    await initDatabase();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('normalizes legacy stored cover paths in the book list response', async () => {
    execute(
      `INSERT INTO books (admin_id, title, author, cover_path, original_path, format, total_pages, total_chapters, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 'Legacy Cover Book', 'Author', './storage/covers/12.png', '/tmp/book.epub', 'EPUB', 10, 1, 100]
    );

    const { server, origin } = await createServer();

    try {
      const response = await fetch(`${origin}/api/books`);
      const payload = await response.json() as {
        code: number;
        data: {
          items: Array<{ coverPath: string | null }>;
        };
      };

      expect(response.status).toBe(200);
      expect(payload.code).toBe(0);
      expect(payload.data.items[0]?.coverPath).toBe('covers/12.png');
    } finally {
      await closeServer(server);
    }
  });

  it('uploads a manual cover with the actual image extension and removes stale sibling covers', async () => {
    const insertResult = execute(
      `INSERT INTO books (admin_id, title, author, cover_path, original_path, format, total_pages, total_chapters, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 'Manual Cover Book', 'Author', null, '/tmp/book.epub', 'EPUB', 10, 1, 100]
    );
    const bookId = insertResult.lastInsertRowId;

    const staleCoverPath = path.join(config.storage.covers, `${bookId}.jpg`);
    fs.writeFileSync(staleCoverPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    execute('UPDATE books SET cover_path = ? WHERE id = ?', [`covers/${bookId}.jpg`, bookId]);

    const { server, origin } = await createServer();

    try {
      const formData = new FormData();
      formData.append('cover', new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'cover.png');

      const response = await fetch(`${origin}/api/books/${bookId}/cover`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json() as { code: number; data?: { coverPath: string | null } };
      const book = queryOne<{ cover_path: string | null }>('SELECT cover_path FROM books WHERE id = ?', [bookId]);

      expect(response.status).toBe(200);
      expect(payload.code).toBe(0);
      expect(payload.data?.coverPath).toBe(`covers/${bookId}.png`);
      expect(book?.cover_path).toBe(`covers/${bookId}.png`);
      expect(fs.existsSync(path.join(config.storage.covers, `${bookId}.png`))).toBe(true);
      expect(fs.existsSync(staleCoverPath)).toBe(false);
    } finally {
      await closeServer(server);
    }
  });

  it('rejects non-image manual cover uploads', async () => {
    const insertResult = execute(
      `INSERT INTO books (admin_id, title, author, cover_path, original_path, format, total_pages, total_chapters, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 'Invalid Cover Book', 'Author', null, '/tmp/book.epub', 'EPUB', 10, 1, 100]
    );

    const { server, origin } = await createServer();

    try {
      const formData = new FormData();
      formData.append('cover', new Blob([Buffer.from('not-an-image')], { type: 'text/plain' }), 'cover.txt');

      const response = await fetch(`${origin}/api/books/${insertResult.lastInsertRowId}/cover`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json() as { code: number };

      expect(response.status).toBe(400);
      expect(payload.code).toBe(ErrorCodes.PARAM_ERROR);
    } finally {
      await closeServer(server);
    }
  });

  it('downloads the original source file with a readable filename', async () => {
    const originalPath = path.join(config.storage.originals, 'source-book.txt');
    fs.writeFileSync(originalPath, 'source content');

    const insertResult = execute(
      `INSERT INTO books (admin_id, title, author, cover_path, original_path, format, total_pages, total_chapters, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, '下载测试书', 'Author', null, originalPath, 'TXT', 10, 1, 100]
    );

    const { server, origin } = await createServer();

    try {
      const response = await fetch(`${origin}/api/books/${insertResult.lastInsertRowId}/source`);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe('source content');
      expect(response.headers.get('content-disposition')).toContain(
        encodeURIComponent('下载测试书.txt')
      );
    } finally {
      await closeServer(server);
    }
  });
});
