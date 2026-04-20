import { Router, Request, Response } from 'express';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../config';
import { query, queryOne, execute } from '../database';
import { authGuard, getCurrentAdminId } from '../middleware/authGuard';
import { requireOwnedChild } from '../middleware/childPermission';
import { asyncHandler } from '../middleware/errorHandler';
import { requireFields, isValidDate, parseRouteInt } from '../utils/validator';
import { statsEngine } from '../services/statsEngine';

const router = Router();

// 所有路由需要认证
router.use(authGuard);

/**
 * GET /api/children
 * 获取子账号列表
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;

  const children = query(
    `SELECT c.*,
      (SELECT COUNT(*) FROM book_assignments ba WHERE ba.child_id = c.id) as books_count,
      (SELECT COUNT(*) FROM devices d WHERE d.child_id = c.id) as devices_count
     FROM children c
     WHERE c.admin_id = ?`,
    [adminId]
  );

  // 获取今日阅读时长（使用北京时间）
  const result = children.map(child => ({
    id: child.id,
    name: child.name,
    avatar: child.avatar,
    birthDate: child.birth_date,
    booksCount: child.books_count,
    devicesCount: child.devices_count,
    todayReadingMinutes: statsEngine.getLiveTodayReadingMinutes(child.id as number)
  }));

  success(res, result);
}));

/**
 * POST /api/children
 * 创建子账号
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  // 兼容下划线和驼峰格式
  const name = req.body.name;
  const birthDate = req.body.birth_date || req.body.birthDate;

  // 参数验证
  const validationError = requireFields(req.body, ['name']);
  if (validationError) {
    error(res, ErrorCodes.PARAM_ERROR, validationError);
    return;
  }

  if (birthDate && !isValidDate(birthDate)) {
    error(res, ErrorCodes.PARAM_ERROR, '出生日期格式错误');
    return;
  }

  // 创建子账号
  const result = execute(
    'INSERT INTO children (admin_id, name, birth_date) VALUES (?, ?, ?)',
    [adminId, name, birthDate || null]
  );

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, child_id, operation, details) VALUES (?, ?, ?, ?)',
    [adminId, result.lastInsertRowId, 'create_child', JSON.stringify({ name })]
  );

  success(res, { childId: result.lastInsertRowId });
}));

/**
 * GET /api/children/:id
 * 获取子账号详情
 */
router.get('/:id', requireOwnedChild(req => parseRouteInt(req.params.id)), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const childId = req.childId!;

  const child = queryOne(
    `SELECT c.*,
      (SELECT COUNT(*) FROM book_assignments ba WHERE ba.child_id = c.id) as books_count,
      (SELECT COUNT(*) FROM devices d WHERE d.child_id = c.id) as devices_count
     FROM children c
     WHERE c.id = ? AND c.admin_id = ?`,
    [childId, adminId]
  );

  if (!child) {
    error(res, ErrorCodes.PERMISSION_DENIED, '子账号不存在');
    return;
  }

  const todayMinutes = statsEngine.getLiveTodayReadingMinutes(childId);

  success(res, {
    id: child.id,
    name: child.name,
    avatar: child.avatar,
    birthDate: child.birth_date,
    booksCount: child.books_count,
    devicesCount: child.devices_count,
    todayReadingMinutes: todayMinutes,
    createdAt: child.created_at
  });
}));

/**
 * PUT /api/children/:id
 * 更新子账号信息
 */
router.put('/:id', requireOwnedChild(req => parseRouteInt(req.params.id)), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const childId = req.childId!;
  // 兼容下划线和驼峰格式
  const name = req.body.name;
  const avatar = req.body.avatar;
  const birthDate = req.body.birth_date || req.body.birthDate;

  // 验证权限并获取当前值
  const child = queryOne(
    'SELECT id, name, avatar, birth_date FROM children WHERE id = ? AND admin_id = ?',
    [childId, adminId]
  );

  if (!child) {
    error(res, ErrorCodes.PERMISSION_DENIED, '子账号不存在');
    return;
  }

  if (birthDate && !isValidDate(birthDate)) {
    error(res, ErrorCodes.PARAM_ERROR, '出生日期格式错误');
    return;
  }

  // 更新（只更新提供的字段，其他保持原值）
  execute(
    'UPDATE children SET name = ?, avatar = ?, birth_date = ? WHERE id = ?',
    [
      name !== undefined ? name : child.name,
      avatar !== undefined ? avatar : child.avatar,
      birthDate !== undefined ? birthDate : child.birth_date,
      childId
    ]
  );

  success(res, null, '更新成功');
}));

/**
 * DELETE /api/children/:id
 * 删除子账号
 */
router.delete('/:id', requireOwnedChild(req => parseRouteInt(req.params.id)), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const childId = req.childId!;

  // 验证权限
  const child = queryOne(
    'SELECT id, name FROM children WHERE id = ? AND admin_id = ?',
    [childId, adminId]
  );

  if (!child) {
    error(res, ErrorCodes.PERMISSION_DENIED, '子账号不存在');
    return;
  }

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, child_id, operation, details) VALUES (?, ?, ?, ?)',
    [adminId, childId, 'delete_child', JSON.stringify({ name: child.name })]
  );

  // 删除（级联删除会自动处理相关数据）
  execute('DELETE FROM children WHERE id = ?', [childId]);

  success(res, null, '删除成功');
}));

export default router;
