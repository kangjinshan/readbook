import { Router, Request, Response } from 'express';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../config';
import { query, queryOne, execute } from '../database';
import { authGuard, getCurrentAdminId } from '../middleware/authGuard';
import { requireOwnedChild } from '../middleware/childPermission';
import { asyncHandler } from '../middleware/errorHandler';
import { parseBodyInt, parseRouteInt } from '../utils/validator';

const router = Router();

// 所有路由需要认证
router.use(authGuard);

/**
 * POST /api/bookmarks
 * 添加书签
 */
router.post('/', requireOwnedChild(req => parseBodyInt(req.body.childId ?? req.body.child_id)), asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  const bookId = parseBodyInt(req.body.bookId ?? req.body.book_id);
  const pageNumber = parseBodyInt(req.body.pageNumber ?? req.body.page_number);
  const previewText = req.body.preview_text || req.body.previewText;

  // 参数验证
  if (bookId === null || pageNumber === null) {
    error(res, ErrorCodes.PARAM_ERROR, '缺少必要参数');
    return;
  }

  // 验证书籍权限
  const assignment = queryOne(
    'SELECT id FROM book_assignments WHERE book_id = ? AND child_id = ?',
    [bookId, childId]
  );

  if (!assignment) {
    error(res, ErrorCodes.BOOK_ACCESS_DENIED);
    return;
  }

  // 检查是否已存在书签
  const existing = queryOne(
    'SELECT id FROM bookmarks WHERE child_id = ? AND book_id = ? AND page_number = ?',
    [childId, bookId, pageNumber]
  );

  if (existing) {
    error(res, ErrorCodes.PARAM_ERROR, '该页已有书签');
    return;
  }

  // 创建书签
  const result = execute(
    'INSERT INTO bookmarks (child_id, book_id, page_number, preview_text) VALUES (?, ?, ?, ?)',
    [childId, bookId, pageNumber, previewText || null]
  );

  success(res, { bookmarkId: result.lastInsertRowId });
}));

/**
 * GET /api/bookmarks
 * 获取书签列表
 */
router.get('/', requireOwnedChild(req => parseBodyInt(req.query.childId ?? req.query.child_id)), asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  const bookId = parseBodyInt(req.query.bookId ?? req.query.book_id);

  // 构建查询
  let sql = `
    SELECT bm.*, b.title as book_title
    FROM bookmarks bm
    JOIN books b ON bm.book_id = b.id
    WHERE bm.child_id = ?
  `;
  const params: any[] = [childId];

  if (bookId) {
    sql += ' AND bm.book_id = ?';
    params.push(bookId);
  }

  sql += ' ORDER BY bm.created_at DESC';

  const bookmarks = query(sql, params);

  success(res, bookmarks.map(bm => ({
    id: bm.id,
    bookId: bm.book_id,
    bookTitle: bm.book_title,
    pageNumber: bm.page_number,
    previewText: bm.preview_text,
    createdAt: bm.created_at
  })));
}));

/**
 * DELETE /api/bookmarks/batch-delete
 * 批量删除书签
 */
router.delete('/batch-delete', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  // 兼容下划线和驼峰格式
  const bookmarkIds = req.body.bookmark_ids || req.body.bookmarkIds;

  if (!bookmarkIds || !Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
    error(res, ErrorCodes.PARAM_ERROR, '请选择要删除的书签');
    return;
  }

  // 防止SQL注入：限制数组长度
  const MAX_BATCH_SIZE = 100;
  if (bookmarkIds.length > MAX_BATCH_SIZE) {
    error(res, ErrorCodes.PARAM_ERROR, `一次最多删除 ${MAX_BATCH_SIZE} 个书签`);
    return;
  }

  // 验证所有ID都是有效的数字
  const validNumericIds = bookmarkIds.filter((id: unknown) => typeof id === 'number' && Number.isInteger(id) && id > 0);
  if (validNumericIds.length !== bookmarkIds.length) {
    error(res, ErrorCodes.PARAM_ERROR, '书签ID格式无效');
    return;
  }

  // 验证书签权限
  const bookmarks = query(
    `SELECT bm.id
     FROM bookmarks bm
     JOIN children c ON bm.child_id = c.id
     WHERE bm.id IN (${bookmarkIds.map(() => '?').join(',')}) AND c.admin_id = ?`,
    [...bookmarkIds, adminId]
  );

  const validIds = bookmarks.map(b => b.id);

  if (validIds.length === 0) {
    error(res, ErrorCodes.PARAM_ERROR, '没有有效的书签');
    return;
  }

  execute(
    `DELETE FROM bookmarks WHERE id IN (${validIds.map(() => '?').join(',')})`,
    validIds
  );

  success(res, null, '批量删除成功');
}));

/**
 * DELETE /api/bookmarks/:id
 * 删除书签
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const bookmarkId = parseRouteInt(req.params.id);

  if (bookmarkId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的书签ID');
    return;
  }

  // 验证书签权限
  const bookmark = queryOne(
    `SELECT bm.id, bm.child_id
     FROM bookmarks bm
     JOIN children c ON bm.child_id = c.id
     WHERE bm.id = ? AND c.admin_id = ?`,
    [bookmarkId, adminId]
  );

  if (!bookmark) {
    error(res, ErrorCodes.PARAM_ERROR, '书签不存在');
    return;
  }

  execute('DELETE FROM bookmarks WHERE id = ?', [bookmarkId]);

  success(res, null, '删除成功');
}));

export default router;
