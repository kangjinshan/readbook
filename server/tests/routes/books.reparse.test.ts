import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { closeDatabase, execute, initDatabase, query, queryOne } from '../../src/database';
import { config } from '../../src/config';

const mockParse = jest.fn();
const mockBookParserCtor = jest.fn();

jest.mock('../../src/middleware/authGuard', () => ({
  authGuard: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
  getCurrentAdminId: () => 1,
}));

jest.mock('../../src/services/bookParser', () => ({
  BookParser: jest.fn().mockImplementation((_bookId: number, _format: string, _originalPath: string, parsedDir?: string, parseMode?: string) => {
    mockBookParserCtor({ parsedDir, parseMode });
    return {
      parse: () => mockParse(parsedDir, parseMode),
    };
  }),
  getChapterContent: jest.fn(),
  getPageContent: jest.fn(),
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

describe('books reparse routes', () => {
  let tempDir: string;

  beforeEach(async () => {
    mockParse.mockReset();
    mockBookParserCtor.mockReset();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readbook-books-reparse-'));
    config.database.path = path.join(tempDir, 'readbook.db');
    config.storage.originals = path.join(tempDir, 'storage', 'originals');
    config.storage.parsed = path.join(tempDir, 'storage', 'parsed');
    config.storage.covers = path.join(tempDir, 'storage', 'covers');
    fs.mkdirSync(config.storage.originals, { recursive: true });
    fs.mkdirSync(config.storage.parsed, { recursive: true });
    fs.mkdirSync(config.storage.covers, { recursive: true });

    await initDatabase();
    execute(`INSERT INTO children (id, admin_id, name) VALUES (?, ?, ?)`, [1, 1, 'child']);
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rebuilds chapters and resets progress/bookmarks while preserving an existing cover', async () => {
    const originalPath = path.join(config.storage.originals, 'comic.epub');
    fs.writeFileSync(originalPath, 'epub bytes');

    const insertResult = execute(
      `INSERT INTO books (admin_id, title, author, publisher, cover_path, original_path, format, total_pages, total_chapters, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, '漫画书', '作者', '出版社', 'covers/1.jpg', originalPath, 'EPUB', 12, 1, 100]
    );
    const bookId = Number(insertResult.lastInsertRowId);

    execute(
      `INSERT INTO chapters (book_id, chapter_index, title, content_path, start_page, end_page)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [bookId, 1, '旧章节', `${config.storage.parsed}/${bookId}/chapter_1.json`, 1, 12]
    );
    execute(
      `INSERT INTO reading_progress (child_id, book_id, current_page, total_time_seconds, last_read_at)
       VALUES (?, ?, ?, ?, ?)`,
      [1, bookId, 8, 300, '2026-04-19T08:00:00.000Z']
    );
    execute(
      `INSERT INTO bookmarks (child_id, book_id, page_number, preview_text)
       VALUES (?, ?, ?, ?)`,
      [1, bookId, 6, '旧书签']
    );

    const parsedDir = path.join(config.storage.parsed, String(bookId));
    fs.mkdirSync(parsedDir, { recursive: true });
    fs.writeFileSync(path.join(parsedDir, 'chapter_1.json'), '{"legacy":true}');

    const coverPath = path.join(config.storage.covers, `${bookId}.jpg`);
    fs.writeFileSync(coverPath, Buffer.from('old-cover'));

    mockParse.mockImplementation(async (temporaryParsedDir?: string) => {
      expect(temporaryParsedDir).toBeTruthy();
      fs.mkdirSync(temporaryParsedDir!, { recursive: true });
      fs.writeFileSync(path.join(temporaryParsedDir!, 'chapter_1.json'), '{"new":1}');
      fs.mkdirSync(path.join(temporaryParsedDir!, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(temporaryParsedDir!, 'assets', 'panel-1.jpg'), Buffer.from('panel-1'));
      fs.writeFileSync(coverPath, Buffer.from('new-cover'));

      return {
        metadata: {
          title: '解析标题',
          author: '解析作者',
          publisher: '解析出版社',
          coverPath: `covers/${bookId}.jpg`,
          totalChapters: 2,
          totalPages: 20,
        },
        chapters: [
          {
            index: 1,
            title: '新章节 1',
            content: '第一页',
            contentBlocks: [{ type: 'text', text: '第一页' }],
            startPage: 1,
            endPage: 10,
          },
          {
            index: 2,
            title: '新章节 2',
            content: '第二页',
            contentBlocks: [{ type: 'image', assetPath: 'assets/panel-1.jpg' }],
            startPage: 11,
            endPage: 20,
          },
        ],
        originalPath,
      };
    });

    const { server, origin } = await createServer();

    try {
      const response = await fetch(`${origin}/api/books/${bookId}/reparse`, {
        method: 'POST',
      });
      const payload = await response.json() as {
        code: number;
        data: {
          parseMode: string;
          totalPages: number;
          totalChapters: number;
          progressReset: boolean;
          bookmarksReset: boolean;
        };
      };

      expect(response.status).toBe(200);
      expect(payload.code).toBe(0);
      expect(payload.data.totalPages).toBe(20);
      expect(payload.data.totalChapters).toBe(2);
      expect(payload.data.progressReset).toBe(true);
      expect(payload.data.bookmarksReset).toBe(true);
      expect(payload.data.parseMode).toBe('plainText');
      expect(mockBookParserCtor).toHaveBeenCalledWith(expect.objectContaining({
        parseMode: 'plain_text',
      }));

      const storedBook = queryOne<{ title: string; author: string; publisher: string | null; total_pages: number; total_chapters: number; cover_path: string | null; parse_mode: string }>(
        'SELECT title, author, publisher, total_pages, total_chapters, cover_path, parse_mode FROM books WHERE id = ?',
        [bookId]
      );
      const progress = queryOne<{ current_page: number; total_time_seconds: number; last_read_at: string | null }>(
        'SELECT current_page, total_time_seconds, last_read_at FROM reading_progress WHERE book_id = ? AND child_id = ?',
        [bookId, 1]
      );
      const bookmarks = query('SELECT * FROM bookmarks WHERE book_id = ?', [bookId]);
      const chapters = query<{ chapter_index: number; title: string }>(
        'SELECT chapter_index, title FROM chapters WHERE book_id = ? ORDER BY chapter_index ASC',
        [bookId]
      );

      expect(storedBook).toEqual({
        title: '漫画书',
        author: '作者',
        publisher: '出版社',
        total_pages: 20,
        total_chapters: 2,
        cover_path: `covers/${bookId}.jpg`,
        parse_mode: 'plain_text',
      });
      expect(progress).toEqual({
        current_page: 1,
        total_time_seconds: 0,
        last_read_at: null,
      });
      expect(bookmarks).toHaveLength(0);
      expect(chapters).toEqual([
        { chapter_index: 1, title: '新章节 1' },
        { chapter_index: 2, title: '新章节 2' },
      ]);
      expect(fs.readFileSync(coverPath, 'utf-8')).toBe('old-cover');
      expect(fs.existsSync(path.join(parsedDir, 'assets', 'panel-1.jpg'))).toBe(true);
    } finally {
      await closeServer(server);
    }
  });

  it('supports reparsing with webview mode and persists the selected parser mode', async () => {
    const originalPath = path.join(config.storage.originals, 'novel.epub');
    fs.writeFileSync(originalPath, 'epub bytes');

    const insertResult = execute(
      `INSERT INTO books (admin_id, title, author, original_path, format, total_pages, total_chapters, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, '小说', '作者', originalPath, 'EPUB', 12, 1, 100]
    );
    const bookId = Number(insertResult.lastInsertRowId);

    mockParse.mockImplementation(async (temporaryParsedDir?: string) => {
      fs.mkdirSync(temporaryParsedDir!, { recursive: true });
      fs.writeFileSync(path.join(temporaryParsedDir!, 'chapter_1.json'), '{"new":1}');

      return {
        metadata: {
          title: '小说',
          author: '作者',
          publisher: '',
          coverPath: null,
          totalChapters: 1,
          totalPages: 18,
        },
        chapters: [
          {
            index: 1,
            title: '正文',
            content: '第一页',
            renderMode: 'xhtml',
            renderHtml: '<p>第一页</p>',
            renderCssTexts: [],
            startPage: 1,
            endPage: 18,
          },
        ],
        originalPath,
      };
    });

    const { server, origin } = await createServer();

    try {
      const response = await fetch(`${origin}/api/books/${bookId}/reparse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parseMode: 'webview' }),
      });
      const payload = await response.json() as {
        code: number;
        data: {
          parseMode: string;
          totalPages: number;
        };
      };

      expect(response.status).toBe(200);
      expect(payload.code).toBe(0);
      expect(payload.data.parseMode).toBe('webview');
      expect(payload.data.totalPages).toBe(18);
      expect(mockBookParserCtor).toHaveBeenCalledWith(expect.objectContaining({
        parseMode: 'webview',
      }));

      const storedBook = queryOne<{ parse_mode: string }>(
        'SELECT parse_mode FROM books WHERE id = ?',
        [bookId]
      );

      expect(storedBook?.parse_mode).toBe('webview');
    } finally {
      await closeServer(server);
    }
  });
});
