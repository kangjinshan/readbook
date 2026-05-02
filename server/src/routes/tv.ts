import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { success, error } from '../utils/response';
import { ErrorCodes, config } from '../config';
import { query, queryOne, execute } from '../database';
import { deviceAuth, requireDeviceBound } from '../middleware/deviceAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { generateBindCode } from '../utils/crypto';
import { getChapterContent, getPageContent } from '../services/bookParser';
import { antiAddictionService } from '../services/antiAddiction';
import { parseBodyInt, parseRouteInt } from '../utils/validator';
import { buildStorageCoverUrl, getRequestOrigin } from '../utils/bookCover';
import { clampRecordedDurationSeconds, parseStoredUtcDateTime } from '../utils/dateUtils';
import type { ChapterContentBlock } from '../services/bookParserRuntime';

const router = Router();

function buildParsedAssetUrl(origin: string, bookId: number, assetPath: string): string {
  const normalizedPath = assetPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  return `${origin}/storage/parsed/${bookId}/${normalizedPath}`;
}

function buildParsedBaseUrl(origin: string, bookId: number): string {
  return `${origin}/storage/parsed/${bookId}/`;
}

function serializeChapterContentBlocks(
  origin: string,
  bookId: number,
  blocks: ChapterContentBlock[] | undefined
): Array<Record<string, unknown>> {
  if (!blocks?.length) {
    return [];
  }

  return blocks.map((block) => {
    if (block.type === 'image') {
      return {
        type: 'image',
        assetUrl: buildParsedAssetUrl(origin, bookId, block.assetPath),
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

function formatUtcDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function closeDanglingReadingSessions(childId: number, now: Date = new Date()): void {
  const sessions = query(
    `SELECT id, book_id, start_time, start_page, end_page, duration_seconds
     FROM reading_sessions
     WHERE child_id = ? AND end_time IS NULL`,
    [childId]
  );

  sessions.forEach((session) => {
    const startTime = parseStoredUtcDateTime(session.start_time);
    const safeDurationSeconds = Math.max(0, Number(session.duration_seconds ?? 0));
    let resolvedEndTime = now;

    if (startTime) {
      const clampedDurationSeconds = clampRecordedDurationSeconds(startTime, now, safeDurationSeconds);
      resolvedEndTime = new Date(
        Math.min(now.getTime(), startTime.getTime() + clampedDurationSeconds * 1000)
      );
    }

    execute(
      `UPDATE reading_sessions SET
        end_time = ?,
        duration_seconds = ?,
        end_page = COALESCE(end_page, start_page)
      WHERE id = ?`,
      [formatUtcDateTime(resolvedEndTime), safeDurationSeconds, session.id]
    );

    const durationMinutes = Math.floor(safeDurationSeconds / 60);
    const resolvedEndPage = Number(session.end_page ?? session.start_page);
    const pagesRead = Math.max(0, resolvedEndPage - Number(session.start_page));
    antiAddictionService.updateDailyStats(
      childId,
      session.start_time,
      resolvedEndTime.toISOString(),
      durationMinutes,
      pagesRead,
      session.book_id as number
    );
  });
}

/**
 * POST /api/tv/register
 * 电视设备首次注册
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  // 兼容 snake_case 和 camelCase
  let deviceToken = req.body.deviceToken || req.body.device_token;

  // 如果没有提供device_token，生成一个
  if (!deviceToken) {
    deviceToken = uuidv4();
  }

  // 检查设备是否已存在
  let device = queryOne(
    'SELECT id, admin_id, child_id FROM devices WHERE device_token = ?',
    [deviceToken]
  );

  if (device) {
    execute(
      'UPDATE devices SET last_online_at = CURRENT_TIMESTAMP WHERE id = ?',
      [device.id]
    );

    // 设备已存在
    success(res, {
      registered: true,
      bound: !!device.child_id,
      deviceToken
    });
    return;
  }

  // 创建新设备记录
  execute(
    'INSERT INTO devices (device_token, last_online_at) VALUES (?, CURRENT_TIMESTAMP)',
    [deviceToken]
  );

  success(res, {
    registered: true,
    bound: false,
    deviceToken
  });
}));

/**
 * GET /api/tv/bind-status
 * 轮询绑定状态
 */
router.get('/bind-status', deviceAuth, asyncHandler(async (req: Request, res: Response) => {
  const deviceId = req.deviceId!;

  if (req.childId) {
    // 已绑定
    const child = queryOne(
      'SELECT id, name FROM children WHERE id = ?',
      [req.childId]
    );

    const admin = queryOne(
      'SELECT username FROM admins WHERE id = ?',
      [req.adminId]
    );

    success(res, {
      bound: true,
      child: child ? { id: child.id, name: child.name } : null,
      admin: admin ? { username: admin.username } : null
    });
    return;
  }

  // 未绑定，生成或返回绑定码
  let device = queryOne(
    'SELECT bind_code, bind_code_expires_at FROM devices WHERE id = ?',
    [deviceId]
  );

  const now = new Date();

  // 检查绑定码是否有效
  if (device?.bind_code && device?.bind_code_expires_at) {
    const expiresAt = new Date(device.bind_code_expires_at as string);
    if (expiresAt > now) {
      const expiresIn = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
      success(res, {
        bound: false,
        bindCode: device.bind_code,
        expiresIn
      });
      return;
    }
  }

  // 生成新的绑定码
  const bindCode = generateBindCode();
  const expiresAt = new Date(now.getTime() + config.device.bindCodeExpireMinutes * 60 * 1000);

  execute(
    'UPDATE devices SET bind_code = ?, bind_code_expires_at = ? WHERE id = ?',
    [bindCode, expiresAt.toISOString(), deviceId]
  );

  success(res, {
    bound: false,
    bindCode,
    expiresIn: config.device.bindCodeExpireMinutes * 60
  });
}));

/**
 * GET /api/tv/sync
 * 同步书籍、进度、策略
 */
router.get('/sync', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  const deviceId = req.deviceId!;
  const origin = getRequestOrigin(req);
  type SyncBookRow = {
    id: number;
    title: string;
    author: string | null;
    cover_path: string | null;
    format: string | null;
    total_pages: number;
    total_chapters: number | null;
    current_page: number | null;
    last_read_at: string | null;
  };
  type ChildRow = {
    id: number;
    name: string;
    daily_reading_reset_at: string | null;
  };
  type BookmarkRow = {
    id: number;
    book_id: number;
    page_number: number;
    preview_text: string | null;
    created_at: string | null;
  };

  // 更新设备在线时间
  execute(
    'UPDATE devices SET last_online_at = CURRENT_TIMESTAMP WHERE id = ?',
    [deviceId]
  );

  // 获取子账号信息
  const child = queryOne(
    'SELECT id, name, daily_reading_reset_at FROM children WHERE id = ?',
    [childId]
  ) as ChildRow | null;

  // 获取授权书籍
  const books = query(
    `SELECT b.id, b.title, b.author, b.cover_path, b.format, b.total_pages, b.total_chapters,
      rp.current_page, rp.last_read_at
     FROM book_assignments ba
     JOIN books b ON ba.book_id = b.id
     LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.child_id = ba.child_id
     WHERE ba.child_id = ?`,
    [childId]
  ) as SyncBookRow[];

  const bookmarkRows = query(
    'SELECT id, book_id, page_number, preview_text, created_at FROM bookmarks WHERE child_id = ? ORDER BY book_id ASC, page_number ASC',
    [childId]
  ) as BookmarkRow[];

  const bookmarksByBookId = new Map<number, Array<{
    id: number;
    pageNumber: number;
    previewText: string | null;
    createdAt: string | null;
  }>>();

  bookmarkRows.forEach((bookmark) => {
    const list = bookmarksByBookId.get(bookmark.book_id) ?? [];
    list.push({
      id: bookmark.id,
      pageNumber: bookmark.page_number,
      previewText: bookmark.preview_text,
      createdAt: bookmark.created_at
    });
    bookmarksByBookId.set(bookmark.book_id, list);
  });

  // 获取防沉迷策略
  const policy = antiAddictionService.getPolicy(childId);
  if (!policy) {
    error(res, ErrorCodes.SERVER_ERROR, '获取防沉迷策略失败');
    return;
  }

  // 获取远程指令
  const device = queryOne(
    'SELECT remote_command FROM devices WHERE id = ?',
    [deviceId]
  );

  // 清除远程指令
  if (device?.remote_command) {
    execute(
      'UPDATE devices SET remote_command = NULL WHERE id = ?',
      [deviceId]
    );
  }

  success(res, {
    child: child ? { id: child.id, name: child.name } : null,
    books: books.map((book) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: buildStorageCoverUrl(origin, book.cover_path),
      format: book.format,
      totalPages: book.total_pages,
      totalChapters: book.total_chapters,
      progress: {
        currentPage: book.current_page || 1,
        lastReadAt: book.last_read_at
      },
      bookmarks: bookmarksByBookId.get(book.id) ?? []
    })),
    policy: {
      dailyLimitMinutes: policy.dailyLimitMinutes,
      continuousLimitMinutes: policy.continuousLimitMinutes,
      restMinutes: policy.restMinutes,
      forbiddenStartTime: policy.forbiddenStartTime,
      forbiddenEndTime: policy.forbiddenEndTime,
      allowedFontSizes: policy.allowedFontSizes,
      allowedThemes: policy.allowedThemes
    },
    dailyReadingResetAt: child?.daily_reading_reset_at ?? null,
    remoteCommand: device?.remote_command || null
  });
}));

/**
 * GET /api/tv/books/:id/chapters
 * 获取书籍章节列表
 */
router.get('/books/:id/chapters', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const bookId = parseRouteInt(req.params.id);
  const childId = req.childId!;

  if (bookId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID');
    return;
  }

  // 验证书籍授权
  const assignment = queryOne(
    'SELECT id FROM book_assignments WHERE book_id = ? AND child_id = ?',
    [bookId, childId]
  );

  if (!assignment) {
    error(res, ErrorCodes.BOOK_ACCESS_DENIED);
    return;
  }

  const chapters = query(
    'SELECT chapter_index, title, start_page, end_page FROM chapters WHERE book_id = ? ORDER BY chapter_index',
    [bookId]
  );

  success(res, {
    chapters: chapters.map(c => ({
      index: c.chapter_index,
      title: c.title,
      pages: (c.end_page as number) - (c.start_page as number) + 1
    }))
  });
}));

/**
 * GET /api/tv/books/:id/chapters/:chapter/content
 * 获取指定章节全文内容
 */
router.get('/books/:id/chapters/:chapter/content', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const bookId = parseRouteInt(req.params.id);
  const chapterIndex = parseRouteInt(req.params.chapter);
  const childId = req.childId!;
  const origin = getRequestOrigin(req);

  if (bookId === null || chapterIndex === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID或章节号');
    return;
  }

  const assignment = queryOne(
    'SELECT id FROM book_assignments WHERE book_id = ? AND child_id = ?',
    [bookId, childId]
  );

  if (!assignment) {
    error(res, ErrorCodes.BOOK_ACCESS_DENIED);
    return;
  }

  const chapterContent = await getChapterContent(bookId, chapterIndex);
  if (!chapterContent) {
    error(res, ErrorCodes.CHAPTER_NOT_FOUND);
    return;
  }

  success(res, {
    chapter: chapterContent.index,
    title: chapterContent.title,
    startPage: chapterContent.startPage,
    endPage: chapterContent.endPage,
    content: chapterContent.content,
    contentBlocks: serializeChapterContentBlocks(origin, bookId, chapterContent.contentBlocks),
    renderMode: chapterContent.renderMode ?? null,
    renderBaseUrl: chapterContent.renderHtml ? buildParsedBaseUrl(origin, bookId) : null,
    renderHtml: chapterContent.renderHtml ?? null,
    renderCss: chapterContent.renderCssTexts ?? [],
  });
}));

/**
 * GET /api/tv/books/:id/pages/:page
 * 获取指定页面内容
 */
router.get('/books/:id/pages/:page', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const bookId = parseRouteInt(req.params.id);
  const pageNumber = parseRouteInt(req.params.page);
  const childId = req.childId!;
  const origin = getRequestOrigin(req);

  if (bookId === null || pageNumber === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书籍ID或页码');
    return;
  }

  // 验证书籍授权
  const assignment = queryOne(
    'SELECT id FROM book_assignments WHERE book_id = ? AND child_id = ?',
    [bookId, childId]
  );

  if (!assignment) {
    error(res, ErrorCodes.BOOK_ACCESS_DENIED);
    return;
  }

  // 获取页面内容
  const pageContent = await getPageContent(bookId, pageNumber);
  if (!pageContent) {
    error(res, ErrorCodes.PAGE_OUT_OF_RANGE);
    return;
  }

  // 获取该页的书签
  const bookmarks = query(
    'SELECT id, preview_text FROM bookmarks WHERE child_id = ? AND book_id = ? AND page_number = ?',
    [childId, bookId, pageNumber]
  );

  success(res, {
    page: pageNumber,
    chapter: pageContent.chapter,
    content: pageContent.content,
    contentBlocks: serializeChapterContentBlocks(origin, bookId, pageContent.contentBlocks),
    bookmarks: bookmarks.map(b => ({
      id: b.id,
      previewText: b.preview_text
    }))
  });
}));

/**
 * POST /api/tv/session/start
 * 开始阅读会话
 */
router.post('/session/start', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  const deviceId = req.deviceId!;
  // 兼容 snake_case 和 camelCase
  const bookId = parseBodyInt(req.body.bookId ?? req.body.book_id);
  const startPage = parseBodyInt(req.body.startPage ?? req.body.start_page);

  if (bookId === null || startPage === null) {
    error(res, ErrorCodes.PARAM_ERROR, '缺少必要参数');
    return;
  }

  // 验证书籍授权
  const assignment = queryOne(
    'SELECT id FROM book_assignments WHERE book_id = ? AND child_id = ?',
    [bookId, childId]
  );

  if (!assignment) {
    error(res, ErrorCodes.BOOK_ACCESS_DENIED);
    return;
  }

  // 检查是否可以开始阅读
  const canStart = antiAddictionService.canStartReading(childId);

  if (!canStart.allowed) {
    success(res, {
      allowed: false,
      reason: canStart.reason,
      message: canStart.message,
      lockDurationMinutes: canStart.lockDurationMinutes ?? 0
    });
    return;
  }

  execute(
    'UPDATE devices SET last_online_at = CURRENT_TIMESTAMP WHERE id = ?',
    [deviceId]
  );

  closeDanglingReadingSessions(childId);

  // 创建会话
  const result = execute(
    `INSERT INTO reading_sessions (child_id, book_id, device_id, start_time, start_page)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)`,
    [childId, bookId, deviceId, startPage]
  );

  const sessionId = result.lastInsertRowId.toString();
  const policy = antiAddictionService.getPolicy(childId);
  const todayMinutes = antiAddictionService.getTodayReadingMinutes(childId);

  if (!policy) {
    error(res, ErrorCodes.SERVER_ERROR, '获取防沉迷策略失败');
    return;
  }

  success(res, {
    sessionId,
    allowed: true,
    policy: {
      dailyLimitMinutes: policy.dailyLimitMinutes,
      continuousLimitMinutes: policy.continuousLimitMinutes,
      restMinutes: policy.restMinutes,
      forbiddenStartTime: policy.forbiddenStartTime,
      forbiddenEndTime: policy.forbiddenEndTime,
      allowedFontSizes: policy.allowedFontSizes,
      allowedThemes: policy.allowedThemes
    },
    todayReadMinutes: todayMinutes,
    continuousReadMinutes: antiAddictionService.getRollingWindowReadingMinutes(childId, policy),
    continuousReadSeconds: antiAddictionService.getRollingWindowReadingSecondsForPolicy(childId, policy)
  });
}));

/**
 * POST /api/tv/session/heartbeat
 * 阅读会话心跳
 */
router.post('/session/heartbeat', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  const deviceId = req.deviceId!;
  // 兼容 snake_case 和 camelCase
  const sessionId = req.body.sessionId || req.body.session_id;
  const currentPage = parseBodyInt(req.body.currentPage ?? req.body.current_page);
  const durationSeconds = parseBodyInt(req.body.durationSeconds ?? req.body.duration_seconds) ?? 0;

  if (!sessionId) {
    error(res, ErrorCodes.PARAM_ERROR, '缺少会话ID');
    return;
  }

  // 查找会话
  const session = queryOne(
    'SELECT * FROM reading_sessions WHERE id = ? AND child_id = ? AND end_time IS NULL',
    [sessionId, childId]
  );

  if (!session) {
    error(res, ErrorCodes.SESSION_NOT_FOUND);
    return;
  }

  // 更新设备在线时间
  execute(
    'UPDATE devices SET last_online_at = CURRENT_TIMESTAMP WHERE id = ?',
    [deviceId]
  );

  const startTime = parseStoredUtcDateTime(session.start_time);
  const now = new Date();
  const storedDurationSeconds = Number(session.duration_seconds || 0);
  const accumulatedDurationSeconds = storedDurationSeconds + durationSeconds;
  const safeAccumulatedDurationSeconds = startTime
    ? clampRecordedDurationSeconds(startTime, now, accumulatedDurationSeconds)
    : accumulatedDurationSeconds;
  const safeDeltaSeconds = Math.max(0, safeAccumulatedDurationSeconds - storedDurationSeconds);

  execute(
    `UPDATE reading_sessions SET
      duration_seconds = ?,
      end_page = COALESCE(?, end_page)
    WHERE id = ?`,
    [safeAccumulatedDurationSeconds, currentPage, sessionId]
  );

  // 检查阅读状态
  const status = antiAddictionService.checkReadingStatus(
    childId,
    session.start_time,
    safeAccumulatedDurationSeconds,
    String(sessionId)
  );

  // 获取远程指令
  const device = queryOne(
    'SELECT remote_command FROM devices WHERE id = ?',
    [deviceId]
  );

  if (device?.remote_command) {
    execute(
      'UPDATE devices SET remote_command = NULL WHERE id = ?',
      [deviceId]
    );
  }

  // 更新阅读进度
  if (currentPage !== null) {
    // 更新进度表
    const existingProgress = queryOne(
      'SELECT id FROM reading_progress WHERE child_id = ? AND book_id = ?',
      [childId, session.book_id]
    );

    if (existingProgress) {
      execute(
        `UPDATE reading_progress SET
          current_page = ?,
          total_time_seconds = total_time_seconds + ?,
          last_read_at = CURRENT_TIMESTAMP
        WHERE child_id = ? AND book_id = ?`,
        [currentPage, safeDeltaSeconds, childId, session.book_id]
      );
    } else {
      execute(
        `INSERT INTO reading_progress (child_id, book_id, current_page, total_time_seconds, last_read_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [childId, session.book_id, currentPage, safeDeltaSeconds]
      );
    }
  }

  success(res, {
    shouldLock: status.shouldLock,
    reason: status.reason,
    lockDurationMinutes: status.lockDurationMinutes,
    message: status.message,
    remainingContinuousMinutes: status.remainingContinuousMinutes,
    remainingDailyMinutes: status.remainingDailyMinutes,
    remoteCommand: device?.remote_command || null
  });
}));

/**
 * POST /api/tv/session/end
 * 结束阅读会话
 */
router.post('/session/end', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  // 兼容 snake_case 和 camelCase
  const sessionId = req.body.sessionId || req.body.session_id;
  const endPage = parseBodyInt(req.body.endPage ?? req.body.end_page);

  if (!sessionId) {
    error(res, ErrorCodes.PARAM_ERROR, '缺少会话ID');
    return;
  }

  // 查找会话
  const session = queryOne(
    'SELECT * FROM reading_sessions WHERE id = ? AND child_id = ?',
    [sessionId, childId]
  );

  if (!session) {
    error(res, ErrorCodes.SESSION_NOT_FOUND);
    return;
  }

  if (session.end_time) {
    error(res, ErrorCodes.SESSION_ENDED);
    return;
  }

  // 计算会话时长
  const startTime = parseStoredUtcDateTime(session.start_time) ?? new Date(session.start_time as string);
  const endTime = new Date();
  const durationSeconds = clampRecordedDurationSeconds(
    startTime,
    endTime,
    Number(session.duration_seconds || Math.floor((endTime.getTime() - startTime.getTime()) / 1000))
  );
  const durationMinutes = Math.floor(durationSeconds / 60);
  const resolvedEndPage = endPage ?? Number(session.end_page ?? session.start_page);
  const pagesRead = resolvedEndPage - Number(session.start_page);

  // 更新会话
  execute(
    `UPDATE reading_sessions SET
      end_time = ?,
      duration_seconds = ?,
      end_page = ?
    WHERE id = ?`,
    [formatUtcDateTime(endTime), durationSeconds, resolvedEndPage, sessionId]
  );

  // 更新每日统计
  antiAddictionService.updateDailyStats(
    childId,
    session.start_time,
    endTime.toISOString(),
    durationMinutes,
    Math.max(0, pagesRead),
    session.book_id as number
  );

  success(res, {
    durationMinutes,
    pagesRead: Math.max(0, pagesRead)
  });
}));

/**
 * POST /api/tv/bookmarks
 * 添加书签（电视端）
 */
router.post('/bookmarks', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  // 兼容 snake_case 和 camelCase
  const bookId = parseBodyInt(req.body.bookId ?? req.body.book_id);
  const pageNumber = parseBodyInt(req.body.pageNumber ?? req.body.page_number);
  const previewText = req.body.previewText || req.body.preview_text;

  if (bookId === null || pageNumber === null) {
    error(res, ErrorCodes.PARAM_ERROR, '缺少必要参数');
    return;
  }

  // 检查书籍是否已分配给该孩子
  const assignment = queryOne(
    'SELECT id FROM book_assignments WHERE child_id = ? AND book_id = ?',
    [childId, bookId]
  );
  if (!assignment) {
    error(res, ErrorCodes.BOOK_NOT_FOUND, '该书籍未分配给当前孩子');
    return;
  }

  // 检查是否已存在书签
  const existing = queryOne(
    'SELECT id FROM bookmarks WHERE child_id = ? AND book_id = ? AND page_number = ?',
    [childId, bookId, pageNumber]
  );

  if (existing) {
    success(res, {
      bookmarkId: existing.id,
      id: existing.id,
      bookId,
      pageNumber,
      previewText: previewText || null
    });
    return;
  }

  // 创建书签
  const result = execute(
    'INSERT INTO bookmarks (child_id, book_id, page_number, preview_text) VALUES (?, ?, ?, ?)',
    [childId, bookId, pageNumber, previewText || null]
  );

  success(res, {
    bookmarkId: result.lastInsertRowId,
    id: result.lastInsertRowId,
    bookId,
    pageNumber,
    previewText: previewText || null
  });
}));

/**
 * DELETE /api/tv/bookmarks/:id
 * 删除书签（电视端）
 */
router.delete('/bookmarks/:id', deviceAuth, requireDeviceBound, asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  const bookmarkId = parseRouteInt(req.params.id);

  if (bookmarkId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书签ID');
    return;
  }

  // 验证书签权限
  const bookmark = queryOne(
    'SELECT id FROM bookmarks WHERE id = ? AND child_id = ?',
    [bookmarkId, childId]
  );

  if (!bookmark) {
    error(res, ErrorCodes.PARAM_ERROR, '书签不存在');
    return;
  }

  execute('DELETE FROM bookmarks WHERE id = ?', [bookmarkId]);

  success(res, null, '删除成功');
}));

export default router;
