import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import { ErrorCodes } from '../config';
import { queryOne } from '../database';

function canAdminAccessBook(adminId: number, bookId: number): boolean {
  const book = queryOne(
    'SELECT id FROM books WHERE id = ? AND admin_id = ?',
    [bookId, adminId]
  );
  return !!book;
}

function canDeviceAccessBook(deviceToken: string, bookId: number): boolean {
  const device = queryOne(
    `SELECT d.id
     FROM devices d
     JOIN book_assignments ba ON ba.child_id = d.child_id
     WHERE d.device_token = ? AND ba.book_id = ?`,
    [deviceToken, bookId]
  );
  return !!device;
}

function authorizeBookAccess(req: Request, bookId: number): boolean {
  if (req.session?.adminId && canAdminAccessBook(req.session.adminId, bookId)) {
    return true;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const deviceToken = authHeader.substring(7);
    return canDeviceAccessBook(deviceToken, bookId);
  }

  return false;
}

/**
 * 静态文件访问权限验证中间件
 * 验证用户是否有权限访问请求的文件
 */
export function storageAuth(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;

  // 健康检查和公开资源不需要权限
  if (path === '/health') {
    next();
    return;
  }

  const coverMatch = path.match(/^\/covers\/(\d+)\.[^/]+$/);
  if (coverMatch) {
    next();
    return;
  }

  // 书籍内容 - 需要验证权限
  const bookMatch = path.match(/^\/parsed\/(\d+)\//);
  if (bookMatch) {
    const bookId = parseInt(bookMatch[1], 10);
    if (authorizeBookAccess(req, bookId)) {
      next();
      return;
    }

    error(res, ErrorCodes.BOOK_ACCESS_DENIED, '无权访问此文件');
    return;
  }

  // 其他路径默认需要登录
  const hasSession = req.session?.adminId;
  const hasDeviceToken = req.headers.authorization?.startsWith('Bearer ');

  if (!hasSession && !hasDeviceToken) {
    error(res, ErrorCodes.NOT_LOGGED_IN);
    return;
  }

  next();
}
