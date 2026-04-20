import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import { ErrorCodes } from '../config';

/**
 * Web端认证守卫中间件
 * 验证Session中的admin_id
 */
export function authGuard(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.adminId || !req.session.username) {
    error(res, ErrorCodes.NOT_LOGGED_IN);
    return;
  }

  const expiresAt = req.session.cookie.expires;
  if (expiresAt instanceof Date && expiresAt.getTime() <= Date.now()) {
    req.session.destroy(() => undefined);
    error(res, ErrorCodes.SESSION_EXPIRED);
    return;
  }

  next();
}

/**
 * 获取当前登录的管理员ID
 */
export function getCurrentAdminId(req: Request): number | null {
  return req.session.adminId || null;
}
