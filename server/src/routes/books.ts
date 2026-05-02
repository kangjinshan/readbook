import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { success, error, paged } from '../utils/response';
import { ErrorCodes, config } from '../config';
import { query, queryOne, execute, batchExecute } from '../database';
import { authGuard, getCurrentAdminId } from '../middleware/authGuard';
import { asyncHandler } from '../middleware/errorHandler';
import { generateFileName } from '../utils/crypto';
import { validatePagination, sanitizeFileTitle, parseRouteInt } from '../utils/validator';
import { BookParser, getChapterContent, getPageContent, type ParseMode, type ParseResult } from '../services/bookParser';
import type { ChapterContentBlock } from '../services/bookParserRuntime';
import {
  buildCoverDiskPath,
  buildStoredCoverPath,
  getRequestOrigin,
  normalizeStoredCoverPath,
  pickCoverExtension,
  resolveCoverDiskPath,
} from '../utils/bookCover';

const router = Router();
const MAX_COVER_UPLOAD_SIZE = 5 * 1024 * 1024;
const ALLOWED_COVER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const DEFAULT_PARSE_MODE: ParseMode = 'plain_text';

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(config.storage.originals);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, generateFileName(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().substring(1);
    if (config.upload.allowedFormats.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}`));
    }
  }
});

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_COVER_UPLOAD_SIZE
  }
});

type BookRecord = {
  id: number;
  title: string;
  author: string | null;
  publisher: string | null;
  cover_path: string | null;
  original_path: string;
  format: string;
  parse_mode: string | null;
};

type PersistBookOptions = {
  title: string;
  author: string;
  publisher: string | null;
  coverPath: string | null;
  parseMode: ParseMode;
  resetReadingState?: boolean;
};

type ApiParseMode = 'plainText' | 'webview';

function normalizeParseMode(rawValue: unknown): ParseMode {
  return rawValue === 'webview' ? 'webview' : DEFAULT_PARSE_MODE;
}

function serializeParseMode(mode: ParseMode): ApiParseMode {
  return mode === 'webview' ? 'webview' : 'plainText';
}

function parseRequestedParseMode(rawValue: unknown): ParseMode | null {
  if (typeof rawValue !== 'string') {
    return null;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized === 'webview') {
    return 'webview';
  }
  if (normalized === 'plaintext' || normalized === 'plain_text') {
    return 'plain_text';
  }

  return null;
}

function ensureCoverDirectory(): string {
  const dir = path.resolve(config.storage.covers);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function normalizeBookCoverPath(bookId: number, rawValue: unknown): string | null {
  const rawPath = typeof rawValue === 'string' ? rawValue : null;
  const normalizedPath = normalizeStoredCoverPath(rawPath);

  if (normalizedPath && normalizedPath !== rawPath) {
    execute('UPDATE books SET cover_path = ? WHERE id = ?', [normalizedPath, bookId]);
  }

  return normalizedPath;
}

function normalizeBookParseMode(bookId: number, rawValue: unknown): ParseMode {
  const normalizedMode = normalizeParseMode(rawValue);
  if (rawValue !== normalizedMode) {
    execute('UPDATE books SET parse_mode = ? WHERE id = ?', [normalizedMode, bookId]);
  }
  return normalizedMode;
}

function removeSiblingCoverFiles(bookId: number, keepPath?: string | null): void {
  const coverDir = ensureCoverDirectory();
  const keepFileName = keepPath ? path.basename(keepPath) : null;

  for (const entry of fs.readdirSync(coverDir)) {
    if (!entry.startsWith(`${bookId}.`)) {
      continue;
    }
    if (keepFileName && entry === keepFileName) {
      continue;
    }

    fs.unlinkSync(path.join(coverDir, entry));
  }
}

function removeDirectoryIfExists(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function buildParsedChapterPath(bookId: number, chapterIndex: number): string {
  return `${config.storage.parsed}/${bookId}/chapter_${chapterIndex}.json`;
}

function persistParsedBook(bookId: number, parseResult: ParseResult, options: PersistBookOptions): void {
  execute(
    `UPDATE books SET
      title = ?,
      author = ?,
      publisher = ?,
      cover_path = ?,
      parse_mode = ?,
      total_pages = ?,
      total_chapters = ?
    WHERE id = ?`,
    [
      options.title,
      options.author,
      options.publisher,
      options.coverPath,
      options.parseMode,
      parseResult.metadata.totalPages || 0,
      parseResult.metadata.totalChapters || 0,
      bookId,
    ]
  );

  execute('DELETE FROM chapters WHERE book_id = ?', [bookId]);
  for (const chapter of parseResult.chapters) {
    execute(
      `INSERT INTO chapters (book_id, chapter_index, title, content_path, start_page, end_page)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        bookId,
        chapter.index,
        chapter.title,
        buildParsedChapterPath(bookId, chapter.index),
        chapter.startPage,
        chapter.endPage,
      ]
    );
  }

  if (!options.resetReadingState) {
    return;
  }

  execute('DELETE FROM bookmarks WHERE book_id = ?', [bookId]);
  execute(
    `UPDATE reading_progress
     SET current_page = 1,
         total_time_seconds = 0,
         last_read_at = NULL
     WHERE book_id = ?`,
    [bookId]
  );
  execute(
    `UPDATE reading_sessions
     SET end_time = COALESCE(end_time, CURRENT_TIMESTAMP),
         end_page = COALESCE(end_page, start_page)
     WHERE book_id = ? AND end_time IS NULL`,
    [bookId]
  );
}

type CoverSnapshotEntry = {
  fileName: string;
  buffer: Buffer;
};

function snapshotSiblingCoverFiles(bookId: number): CoverSnapshotEntry[] {
  const coverDir = ensureCoverDirectory();
  return fs.readdirSync(coverDir)
    .filter((entry) => entry.startsWith(`${bookId}.`))
    .map((entry) => ({
      fileName: entry,
      buffer: fs.readFileSync(path.join(coverDir, entry)),
    }));
}

function restoreSiblingCoverFiles(bookId: number, snapshot: CoverSnapshotEntry[]): void {
  removeSiblingCoverFiles(bookId);
  if (snapshot.length === 0) {
    return;
  }

  const coverDir = ensureCoverDirectory();
  for (const entry of snapshot) {
    fs.writeFileSync(path.join(coverDir, entry.fileName), entry.buffer);
  }
}

function createTemporaryParsedDir(bookId: number): string {
  const parsedRoot = path.resolve(config.storage.parsed);
  fs.mkdirSync(parsedRoot, { recursive: true });
  const tempDir = path.join(parsedRoot, `.reparse-${bookId}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function serializePreviewContentBlocks(bookId: number, blocks: ChapterContentBlock[] | undefined): Array<Record<string, unknown>> {
  if (!blocks?.length) {
    return [];
  }

  return blocks.map((block) => {
    if (block.type === 'image') {
      return {
        type: 'image',
        assetUrl: `/storage/parsed/${bookId}/${block.assetPath}`,
        alt: block.alt ?? null,
        width: block.width ?? null,
        height: block.height ?? null,
        widthPercent: block.widthPercent ?? null,
      };
    }

    return {
      type: 'text',
      text: block.text,
    };
  });
}

function buildParsedBaseUrl(origin: string, bookId: number): string {
  return `${origin}/storage/parsed/${bookId}/`;
}

function buildSourceDownloadName(title: unknown, originalPath: unknown, format: unknown): string {
  const safeTitle = sanitizeFileTitle(
    typeof title === 'string' ? title : '',
    'book'
  );
  const originalExtension = typeof originalPath === 'string' ? path.extname(originalPath) : '';
  const fallbackExtension = typeof format === 'string' ? `.${format.toLowerCase()}` : '';
  const extension = originalExtension || fallbackExtension;

  if (!extension) {
    return safeTitle;
  }

  return safeTitle.toLowerCase().endsWith(extension.toLowerCase())
    ? safeTitle
    : `${safeTitle}${extension}`;
}

// 所有路由需要认证
router.use(authGuard);

/**
 * POST /api/books/upload
 * 上传书籍文件
 */
router.post('/upload', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const file = req.file;

  if (!file) {
    error(res, ErrorCodes.PARAM_ERROR, '请选择文件');
    return;
  }

  const rawTitle = req.body.title || path.basename(file.originalname, path.extname(file.originalname));
  const title = sanitizeFileTitle(rawTitle);
  const author = req.body.author || '未知作者';
  const format = path.extname(file.originalname).toLowerCase().substring(1);
  const parseMode = DEFAULT_PARSE_MODE;

  // 先创建书籍记录
  const result = execute(
    `INSERT INTO books (admin_id, title, author, original_path, format, parse_mode, total_pages, file_size)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [adminId, title, author, file.path, format.toUpperCase(), parseMode, file.size]
  );

  const bookId = result.lastInsertRowId;
  console.log(`[DEBUG] 创建书籍记录, bookId: ${bookId}`);

  try {
    // 解析书籍
    const parser = new BookParser(bookId, format, file.path, undefined, parseMode);
    const parseResult = await parser.parse();
    console.log(`[DEBUG] 解析结果:`, JSON.stringify({
      title: parseResult.metadata.title,
      author: parseResult.metadata.author,
      totalPages: parseResult.metadata.totalPages,
      totalChapters: parseResult.metadata.totalChapters,
      chaptersCount: parseResult.chapters.length
    }));

    console.log(`[DEBUG] 准备更新书籍信息, bookId: ${bookId}`);
    persistParsedBook(bookId, parseResult, {
      title: parseResult.metadata.title || title,
      author: parseResult.metadata.author || author,
      publisher: parseResult.metadata.publisher || null,
      coverPath: parseResult.metadata.coverPath || null,
      parseMode,
    });
    console.log(`[DEBUG] 书籍信息更新完成`);

    // 记录日志
    execute(
      'INSERT INTO operation_logs (admin_id, operation, details) VALUES (?, ?, ?)',
      [adminId, 'upload_book', JSON.stringify({ bookId, title, format, parseMode })]
    );

    success(res, {
      bookId,
      title: parseResult.metadata.title || title,
      author: parseResult.metadata.author || author,
      format: format.toUpperCase(),
      parseMode: serializeParseMode(parseMode),
      totalPages: parseResult.metadata.totalPages,
      totalChapters: parseResult.metadata.totalChapters,
      coverPath: normalizeBookCoverPath(bookId, parseResult.metadata.coverPath)
    });
  } catch (err: any) {
    // 解析失败，删除书籍记录
    console.error('[DEBUG] 上传失败:', err);
    console.error('[DEBUG] 错误堆栈:', err.stack);
    execute('DELETE FROM books WHERE id = ?', [bookId]);
    removeDirectoryIfExists(path.join(config.storage.parsed, String(bookId)));
    removeSiblingCoverFiles(bookId);
    error(res, ErrorCodes.PARSE_FAILED, err.message || '文件解析失败');
  }
}));

/**
 * GET /api/books
 * 获取书籍列表
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const { page, limit } = validatePagination(req);
  const search = req.query.search as string || '';
  const offset = (page - 1) * limit;

  // 构建查询条件
  let whereClause = 'WHERE b.admin_id = ?';
  const params: any[] = [adminId];

  if (search) {
    whereClause += ' AND (b.title LIKE ? OR b.author LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // 获取总数
  const countRow = queryOne(
    `SELECT COUNT(*) as count FROM books b ${whereClause}`,
    params
  );
  const total = countRow?.count as number || 0;

  // 获取列表
  const books = query(
    `SELECT b.*
     FROM books b
     ${whereClause}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const result = books.map(b => {
    const parseMode = normalizeBookParseMode(Number(b.id), b.parse_mode);
    const assignedChildren = query(
      `SELECT c.id, c.name
       FROM book_assignments ba
       JOIN children c ON ba.child_id = c.id
       WHERE ba.book_id = ?`,
      [b.id]
    );

    return {
      id: b.id,
      title: b.title,
      author: b.author,
      coverPath: normalizeBookCoverPath(Number(b.id), b.cover_path),
      parseMode: serializeParseMode(parseMode),
      totalPages: b.total_pages,
      totalChapters: b.total_chapters,
      format: b.format,
      assignedChildren: assignedChildren.map(child => ({
        childId: child.id,
        childName: child.name
      }))
    };
  });

  paged(res, { total, page, limit, items: result });
}));

/**
 * GET /api/books/:id
 * 获取书籍详情
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  const book = queryOne(
    'SELECT * FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  // 获取章节
  const chapters = query(
    'SELECT chapter_index, title, start_page, end_page FROM chapters WHERE book_id = ? ORDER BY chapter_index',
    [bookId]
  );

  // 获取授权的子账号
  const assignedChildren = query(
    `SELECT c.id, c.name FROM book_assignments ba
     JOIN children c ON ba.child_id = c.id
     WHERE ba.book_id = ?`,
    [bookId]
  );

  success(res, {
    parseMode: serializeParseMode(normalizeBookParseMode(bookId, book.parse_mode)),
    id: book.id,
    title: book.title,
    author: book.author,
    publisher: book.publisher,
    coverPath: normalizeBookCoverPath(bookId, book.cover_path),
    totalPages: book.total_pages,
    totalChapters: book.total_chapters,
    format: book.format,
    chapters: chapters.map(c => ({
      index: c.chapter_index,
      title: c.title,
      startPage: c.start_page,
      endPage: c.end_page
    })),
    assignedChildren: assignedChildren.map(c => ({
      childId: c.id,
      childName: c.name
    }))
  });
}));

/**
 * GET /api/books/:id/source
 * 下载书籍原始文件
 */
router.get('/:id/source', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  const book = queryOne(
    'SELECT id, title, original_path, format FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  const originalPath = String(book.original_path || '');
  if (!originalPath || !fs.existsSync(originalPath)) {
    error(res, ErrorCodes.BOOK_NOT_FOUND, '书籍源文件不存在');
    return;
  }

  const downloadName = buildSourceDownloadName(book.title, originalPath, book.format);
  res.download(originalPath, downloadName, (downloadError) => {
    if (downloadError && !res.headersSent) {
      console.error('下载书籍源文件失败:', downloadError);
      error(res, ErrorCodes.SERVER_ERROR, '下载失败');
    }
  });
}));

/**
 * POST /api/books/:id/cover
 * 手动更新封面
 */
router.post('/:id/cover', coverUpload.single('cover'), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);
  const file = req.file;

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  const book = queryOne(
    'SELECT id FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  if (!file) {
    error(res, ErrorCodes.PARAM_ERROR, '请选择封面图片');
    return;
  }

  const extension = pickCoverExtension(file.originalname);
  if (!ALLOWED_COVER_EXTENSIONS.has(extension)) {
    error(res, ErrorCodes.PARAM_ERROR, `不支持的封面格式: ${extension}`);
    return;
  }

  ensureCoverDirectory();
  const storedCoverPath = buildStoredCoverPath(bookId, extension);
  fs.writeFileSync(buildCoverDiskPath(bookId, extension), file.buffer);
  removeSiblingCoverFiles(bookId, storedCoverPath);
  execute('UPDATE books SET cover_path = ? WHERE id = ?', [storedCoverPath, bookId]);

  success(res, { coverPath: storedCoverPath }, '封面更新成功');
}));

/**
 * POST /api/books/:id/reparse
 * 手动重新解析已上传书籍
 */
router.post('/:id/reparse', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  const book = queryOne(
    'SELECT id, title, author, publisher, cover_path, original_path, format, parse_mode FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  ) as BookRecord | null;

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  if (!book.original_path || !fs.existsSync(book.original_path)) {
    error(res, ErrorCodes.BOOK_NOT_FOUND, '书籍源文件不存在，无法重新解析');
    return;
  }

  const format = String(book.format || '').toLowerCase();
  const requestedParseMode = parseRequestedParseMode(req.body?.parseMode ?? req.body?.parse_mode);
  if ((req.body?.parseMode !== undefined || req.body?.parse_mode !== undefined) && !requestedParseMode) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的解析方式');
    return;
  }
  const parseMode = requestedParseMode ?? normalizeBookParseMode(bookId, book.parse_mode);
  const temporaryParsedDir = createTemporaryParsedDir(bookId);
  const finalParsedDir = path.join(config.storage.parsed, String(bookId));
  const previousCoverSnapshot = snapshotSiblingCoverFiles(bookId);

  try {
    const parser = new BookParser(bookId, format, book.original_path, temporaryParsedDir, parseMode);
    const parseResult = await parser.parse();

    removeDirectoryIfExists(finalParsedDir);
    fs.renameSync(temporaryParsedDir, finalParsedDir);

    const nextCoverPath = book.cover_path
      ? normalizeBookCoverPath(bookId, book.cover_path)
      : (parseResult.metadata.coverPath || null);

    if (book.cover_path) {
      restoreSiblingCoverFiles(bookId, previousCoverSnapshot);
    }

    persistParsedBook(bookId, parseResult, {
      title: book.title || parseResult.metadata.title || '未命名书籍',
      author: book.author || parseResult.metadata.author || '未知作者',
      publisher: book.publisher || parseResult.metadata.publisher || null,
      coverPath: nextCoverPath,
      parseMode,
      resetReadingState: true,
    });

    execute(
      'INSERT INTO operation_logs (admin_id, operation, details) VALUES (?, ?, ?)',
      [adminId, 'reparse_book', JSON.stringify({ bookId, title: book.title, format: book.format, parseMode })]
    );

    success(res, {
      bookId,
      title: book.title,
      parseMode: serializeParseMode(parseMode),
      totalPages: parseResult.metadata.totalPages,
      totalChapters: parseResult.metadata.totalChapters,
      coverPath: nextCoverPath,
      progressReset: true,
      bookmarksReset: true,
    }, '重新解析成功');
  } catch (err: any) {
    removeDirectoryIfExists(temporaryParsedDir);
    restoreSiblingCoverFiles(bookId, previousCoverSnapshot);
    error(res, ErrorCodes.PARSE_FAILED, err.message || '重新解析失败');
  }
}));

/**
 * PUT /api/books/:id
 * 更新书籍信息
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);
  const { title, author, publisher } = req.body;

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  if (!title || !title.trim()) {
    error(res, ErrorCodes.PARAM_ERROR, '书籍标题不能为空');
    return;
  }

  // 验证权限
  const book = queryOne(
    'SELECT id, title, author, publisher FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  const resolvedAuthor = author !== undefined ? author : book.author;
  const resolvedPublisher = publisher !== undefined ? publisher : book.publisher;

  execute(
    `UPDATE books SET title = ?, author = ?, publisher = ? WHERE id = ?`,
    [title.trim(), resolvedAuthor, resolvedPublisher, bookId]
  );

  success(res, null, '更新成功');
}));

/**
 * DELETE /api/books/:id
 * 删除书籍
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  // 验证权限
  const book = queryOne(
    'SELECT id, title, original_path, cover_path FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, operation, details) VALUES (?, ?, ?)',
    [adminId, 'delete_book', JSON.stringify({ bookId, title: book.title })]
  );

  // 删除书籍（级联删除章节和授权记录）
  execute('DELETE FROM books WHERE id = ?', [bookId]);

  // 删除文件
  try {
    if (fs.existsSync(book.original_path as string)) {
      fs.unlinkSync(book.original_path as string);
    }
    const parsedDir = path.join(config.storage.parsed, String(bookId));
    if (fs.existsSync(parsedDir)) {
      fs.rmSync(parsedDir, { recursive: true });
    }
    const coverDiskPath = resolveCoverDiskPath(book.cover_path as string | null | undefined);
    if (coverDiskPath && fs.existsSync(coverDiskPath)) {
      fs.unlinkSync(coverDiskPath);
    }
    removeSiblingCoverFiles(bookId);
  } catch (err) {
    console.error('删除书籍文件失败:', err);
  }

  success(res, null, '删除成功');
}));

/**
 * POST /api/books/:id/assign
 * 授权书籍给子账号
 */
router.post('/:id/assign', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);
  // 兼容下划线和驼峰格式
  const childIds = req.body.child_ids || req.body.childIds;

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  if (!childIds || !Array.isArray(childIds) || childIds.length === 0) {
    error(res, ErrorCodes.PARAM_ERROR, '请选择要授权的子账号');
    return;
  }

  if (childIds.length > 100) {
    error(res, ErrorCodes.PARAM_ERROR, '单次授权子账号数量不能超过100');
    return;
  }

  // 验证书籍权限
  const book = queryOne(
    'SELECT id FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  // 验证子账号权限
  const validChildren = query(
    `SELECT id FROM children WHERE id IN (${childIds.map(() => '?').join(',')}) AND admin_id = ?`,
    [...childIds, adminId]
  );

  if (validChildren.length === 0) {
    error(res, ErrorCodes.PARAM_ERROR, '没有有效的子账号');
    return;
  }

  // 批量授权（使用事务确保原子性）
  try {
    batchExecute(
      validChildren.map(child => ({
        sql: 'INSERT OR IGNORE INTO book_assignments (book_id, child_id) VALUES (?, ?)',
        params: [bookId, child.id]
      }))
    );
    success(res, null, '授权成功');
  } catch (err) {
    error(res, ErrorCodes.SERVER_ERROR, '授权失败');
  }
}));

/**
 * DELETE /api/books/:id/assign
 * 取消授权
 */
router.delete('/:id/assign', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);
  // 兼容下划线和驼峰格式
  const childIds = req.body.child_ids || req.body.childIds;

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  if (!childIds || !Array.isArray(childIds) || childIds.length === 0) {
    error(res, ErrorCodes.PARAM_ERROR, '请选择要取消授权的子账号');
    return;
  }

  if (childIds.length > 100) {
    error(res, ErrorCodes.PARAM_ERROR, '单次取消授权数量不能超过100');
    return;
  }

  // 验证书籍权限
  const book = queryOne(
    'SELECT id FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  // 验证 childIds 为正整数且属于当前管理员
  const validChildIds = childIds.filter((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0);
  if (validChildIds.length !== childIds.length) {
    error(res, ErrorCodes.PARAM_ERROR, '子账号ID格式无效');
    return;
  }

  const validChildren = query(
    `SELECT id FROM children WHERE id IN (${validChildIds.map(() => '?').join(',')}) AND admin_id = ?`,
    [...validChildIds, adminId]
  );

  const ownedChildIds = validChildren.map(c => c.id as number);

  if (ownedChildIds.length === 0) {
    error(res, ErrorCodes.PARAM_ERROR, '没有有效的子账号');
    return;
  }

  // 取消授权
  execute(
    `DELETE FROM book_assignments WHERE book_id = ? AND child_id IN (${ownedChildIds.map(() => '?').join(',')})`,
    [bookId, ...ownedChildIds]
  );

  success(res, null, '取消授权成功');
}));

/**
 * GET /api/books/:id/preview
 * 预览书籍内容
 */
router.get('/:id/preview', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookId = parseRouteInt(req.params.id);
  const chapter = parseInt(req.query.chapter as string) || 1;
  const page = parseInt(req.query.page as string) || 1;
  const origin = getRequestOrigin(req);

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  // 验证书籍权限
  const book = queryOne(
    'SELECT * FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );

  if (!book) {
    error(res, ErrorCodes.BOOK_NOT_FOUND);
    return;
  }

  // 获取章节内容
  const chapterContent = await getChapterContent(bookId, chapter);
  if (!chapterContent) {
    error(res, ErrorCodes.CHAPTER_NOT_FOUND);
    return;
  }

  // 获取指定页内容
  const pageContent = await getPageContent(bookId, page);
  if (!pageContent) {
    error(res, ErrorCodes.PAGE_OUT_OF_RANGE);
    return;
  }

  success(res, {
    chapter,
    page,
    content: pageContent.content,
    contentBlocks: serializePreviewContentBlocks(bookId, pageContent.contentBlocks),
    renderMode: chapterContent.renderMode ?? null,
    renderBaseUrl: chapterContent.renderHtml ? buildParsedBaseUrl(origin, bookId) : null,
    renderHtml: chapterContent.renderHtml ?? null,
    renderCss: chapterContent.renderCssTexts ?? [],
  });
}));

export default router;
