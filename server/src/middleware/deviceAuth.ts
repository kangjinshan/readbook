import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import { ErrorCodes } from '../config';
import { queryOne, execute } from '../database';
import { parseStoredUtcDateTime } from '../utils/dateUtils';

// Token 过期时间（90天）
const TOKEN_EXPIRY_DAYS = 90;
const TOKEN_EXPIRY_MS = TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/**
 * 电视端设备认证中间件
 * 验证Authorization头中的device_token
 */
export async function deviceAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      error(res, ErrorCodes.DEVICE_TOKEN_INVALID);
      return;
    }

    const deviceToken = authHeader.substring(7);

    // 查询设备信息（包含最后在线时间）
    const device = queryOne(
      'SELECT id, admin_id, child_id, last_online_at FROM devices WHERE device_token = ?',
      [deviceToken]
    );

    if (!device) {
      error(res, ErrorCodes.DEVICE_TOKEN_INVALID);
      return;
    }

    // 检查 Token 是否过期
    const lastOnlineAt = parseStoredUtcDateTime(device.last_online_at)?.getTime() ?? 0;
    const now = Date.now();

    if (now - lastOnlineAt > TOKEN_EXPIRY_MS) {
      error(res, ErrorCodes.DEVICE_TOKEN_INVALID, '设备令牌已过期，请重新绑定');
      return;
    }

    // 更新最后在线时间（每次请求更新，但不频繁更新）
    const ONE_HOUR = 60 * 60 * 1000;
    if (now - lastOnlineAt > ONE_HOUR) {
      execute(
        'UPDATE devices SET last_online_at = CURRENT_TIMESTAMP WHERE id = ?',
        [device.id]
      );
    }

    // 设置设备信息到请求对象
    req.deviceId = device.id as number;
    req.adminId = device.admin_id as number;
    req.childId = device.child_id as number | undefined;

    next();
  } catch (err) {
    console.error('设备认证错误:', err);
    error(res, ErrorCodes.SERVER_ERROR);
  }
}

/**
 * 检查设备是否已绑定
 */
export function requireDeviceBound(req: Request, res: Response, next: NextFunction): void {
  if (!req.childId) {
    error(res, ErrorCodes.DEVICE_NOT_BOUND);
    return;
  }
  next();
}
