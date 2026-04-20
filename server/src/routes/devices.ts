import { Router, Request, Response } from 'express';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../config';
import { query, queryOne, execute } from '../database';
import { authGuard, getCurrentAdminId } from '../middleware/authGuard';
import { requireOwnedChild } from '../middleware/childPermission';
import { asyncHandler } from '../middleware/errorHandler';
import { parseBodyInt, parseRouteInt } from '../utils/validator';
import { formatStoredUtcDateTimeForApi, isStoredUtcDateTimeRecent } from '../utils/dateUtils';

const router = Router();
const DEVICE_ONLINE_WINDOW_MS = 2 * 60 * 1000;

// 所有路由需要认证
router.use(authGuard);

/**
 * POST /api/devices/bind
 * 绑定电视设备
 */
router.post('/bind', requireOwnedChild(req => parseBodyInt(req.body.childId ?? req.body.child_id)), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  // 兼容驼峰和下划线两种格式
  const bindCode = req.body.bindCode || req.body.bind_code;
  const childId = req.childId!;

  if (!bindCode) {
    error(res, ErrorCodes.PARAM_ERROR, '请输入绑定码并选择子账号');
    return;
  }

  // 查找设备
  const device = queryOne(
    `SELECT * FROM devices
     WHERE bind_code = ?`,
    [bindCode]
  );

  if (!device) {
    error(res, ErrorCodes.BIND_CODE_INVALID);
    return;
  }

  if (!device.bind_code_expires_at || new Date(device.bind_code_expires_at as string) <= new Date()) {
    error(res, ErrorCodes.BIND_CODE_INVALID);
    return;
  }

  if (device.child_id) {
    error(res, ErrorCodes.BIND_CODE_USED);
    return;
  }

  // 验证设备属于当前管理员
  if (device.admin_id && device.admin_id !== adminId) {
    error(res, ErrorCodes.DEVICE_ALREADY_BOUND);
    return;
  }

  // 绑定设备
  execute(
    `UPDATE devices SET
      admin_id = ?,
      child_id = ?,
      bind_code = NULL,
      bind_code_expires_at = NULL,
      device_name = COALESCE(device_name, '小米电视-' || ?),
      last_online_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [adminId, childId, childId, device.id]
  );

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, child_id, device_id, operation, details) VALUES (?, ?, ?, ?, ?)',
    [adminId, childId, device.id, 'bind_device', JSON.stringify({ deviceToken: device.device_token })]
  );

  success(res, {
    deviceId: device.id,
    deviceName: device.device_name || `小米电视-${childId}`
  });
}));

/**
 * GET /api/devices
 * 获取设备列表
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;

  const devices = query(
    `SELECT d.id, d.device_name, d.device_token, d.child_id, d.last_online_at, d.created_at,
      c.name as child_name
     FROM devices d
     LEFT JOIN children c ON d.child_id = c.id
     WHERE d.admin_id = ? OR d.admin_id IS NULL
     ORDER BY d.last_online_at DESC NULLS LAST`,
    [adminId]
  );

  const result = devices.map(d => {
    const online = isStoredUtcDateTimeRecent(d.last_online_at, DEVICE_ONLINE_WINDOW_MS);

    return {
      id: d.id,
      deviceName: d.device_name,
      deviceToken: d.device_token,
      childId: d.child_id,
      childName: d.child_name,
      lastOnlineAt: formatStoredUtcDateTimeForApi(d.last_online_at),
      createdAt: formatStoredUtcDateTimeForApi(d.created_at),
      online,
      bound: !!d.child_id,
      isOwner: !d.admin_id || d.admin_id === adminId
    };
  });

  success(res, result);
}));

/**
 * GET /api/devices/all
 * 获取所有未绑定设备列表（用于绑定选择）
 */
router.get('/all', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;

  // 获取所有未绑定设备 + 当前管理员已绑定的设备
  const devices = query(
    `SELECT d.id, d.device_name, d.device_token, d.child_id, d.last_online_at, d.created_at,
      c.name as child_name
     FROM devices d
     LEFT JOIN children c ON d.child_id = c.id
     WHERE d.admin_id IS NULL OR d.admin_id = ?
     ORDER BY d.last_online_at DESC NULLS LAST`,
    [adminId]
  );

  const result = devices.map(d => {
    const online = isStoredUtcDateTimeRecent(d.last_online_at, DEVICE_ONLINE_WINDOW_MS);

    return {
      id: d.id,
      deviceName: d.device_name,
      deviceToken: d.device_token,
      childId: d.child_id,
      childName: d.child_name,
      lastOnlineAt: formatStoredUtcDateTimeForApi(d.last_online_at),
      createdAt: formatStoredUtcDateTimeForApi(d.created_at),
      online,
      bound: !!d.child_id
    };
  });

  success(res, result);
}));

/**
 * POST /api/devices/:id/direct-bind
 * 直接绑定设备（不需要绑定码）
 */
router.post('/:id/direct-bind', requireOwnedChild(req => parseBodyInt(req.body.childId ?? req.body.child_id)), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const deviceId = parseRouteInt(req.params.id);
  const childId = req.childId!;

  if (deviceId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的设备ID');
    return;
  }

  // 查找设备
  const device = queryOne(
    'SELECT * FROM devices WHERE id = ?',
    [deviceId]
  );

  if (!device) {
    error(res, ErrorCodes.PARAM_ERROR, '设备不存在');
    return;
  }

  // 检查设备是否已被其他管理员绑定
  if (device.admin_id && device.admin_id !== adminId) {
    error(res, ErrorCodes.DEVICE_ALREADY_BOUND, '设备已被其他账号绑定');
    return;
  }

  // 检查设备是否已绑定子账号
  if (device.child_id) {
    error(res, ErrorCodes.DEVICE_ALREADY_BOUND, '设备已绑定子账号，请先解绑');
    return;
  }

  // 绑定设备
  execute(
    `UPDATE devices SET
      admin_id = ?,
      child_id = ?,
      bind_code = NULL,
      bind_code_expires_at = NULL,
      device_name = COALESCE(device_name, '电视-' || ?),
      last_online_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [adminId, childId, childId, deviceId]
  );

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, child_id, device_id, operation, details) VALUES (?, ?, ?, ?, ?)',
    [adminId, childId, deviceId, 'bind_device', JSON.stringify({ deviceToken: device.device_token })]
  );

  success(res, {
    deviceId: device.id,
    deviceName: device.device_name || `电视-${childId}`
  }, '绑定成功');
}));

/**
 * PUT /api/devices/:id
 * 更新设备名称
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const deviceId = parseRouteInt(req.params.id);
  // 兼容下划线和驼峰格式
  const deviceName = req.body.device_name || req.body.deviceName;

  if (deviceId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的设备ID');
    return;
  }

  if (!deviceName) {
    error(res, ErrorCodes.PARAM_ERROR, '请输入设备名称');
    return;
  }

  // 验证设备权限
  const device = queryOne(
    'SELECT id FROM devices WHERE id = ? AND admin_id = ?',
    [deviceId, adminId]
  );

  if (!device) {
    error(res, ErrorCodes.PERMISSION_DENIED, '设备不存在');
    return;
  }

  execute(
    'UPDATE devices SET device_name = ? WHERE id = ?',
    [deviceName, deviceId]
  );

  success(res, null, '更新成功');
}));

/**
 * DELETE /api/devices/:id
 * 解绑设备
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const deviceId = parseRouteInt(req.params.id);

  if (deviceId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的设备ID');
    return;
  }

  // 验证设备权限
  const device = queryOne(
    'SELECT id, child_id FROM devices WHERE id = ? AND admin_id = ?',
    [deviceId, adminId]
  );

  if (!device) {
    error(res, ErrorCodes.PERMISSION_DENIED, '设备不存在');
    return;
  }

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, child_id, device_id, operation) VALUES (?, ?, ?, ?)',
    [adminId, device.child_id, deviceId, 'unbind_device']
  );

  // 解绑（清除绑定信息，保留设备记录）
  execute(
    `UPDATE devices SET
      admin_id = NULL,
      child_id = NULL,
      bind_code = NULL,
      bind_code_expires_at = NULL
    WHERE id = ?`,
    [deviceId]
  );

  success(res, null, '解绑成功');
}));

/**
 * POST /api/devices/:id/command
 * 发送远程指令
 */
router.post('/:id/command', asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const deviceId = parseRouteInt(req.params.id);
  const { command } = req.body;

  if (deviceId === null) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的设备ID');
    return;
  }

  const validCommands = ['exit', 'lock', 'restart'];
  if (!command || !validCommands.includes(command)) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的指令');
    return;
  }

  // 验证设备权限
  const device = queryOne(
    'SELECT id, child_id FROM devices WHERE id = ? AND admin_id = ?',
    [deviceId, adminId]
  );

  if (!device) {
    error(res, ErrorCodes.PERMISSION_DENIED, '设备不存在');
    return;
  }

  // 设置远程指令
  execute(
    'UPDATE devices SET remote_command = ? WHERE id = ?',
    [command, deviceId]
  );

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, child_id, device_id, operation, details) VALUES (?, ?, ?, ?, ?)',
    [adminId, device.child_id, deviceId, 'send_command', JSON.stringify({ command })]
  );

  success(res, null, '指令已发送');
}));

export default router;
