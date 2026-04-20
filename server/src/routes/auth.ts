import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { success, error } from '../utils/response';
import { ErrorCodes, config } from '../config';
import { queryOne, execute } from '../database';
import { asyncHandler } from '../middleware/errorHandler';
import { isValidUsername, isValidPassword } from '../utils/validator';
import { isLoginBlocked, recordLoginFailure, clearLoginFailures } from '../middleware/loginRateLimit';

const router = Router();
type AdminRow = {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
};

/**
 * POST /api/auth/login
 * 管理员登录
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { username, SECRET } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  // 参数验证
  if (!username || !SECRET) {
    error(res, ErrorCodes.PARAM_ERROR, '请输入用户名和密码');
    return;
  }

  if (isLoginBlocked(
    clientIp,
    username,
    config.rateLimit.loginMaxAttempts,
    config.rateLimit.loginWindowMs,
    config.rateLimit.loginBlockMs
  )) {
    error(res, ErrorCodes.RATE_LIMIT, '登录失败次数过多，请稍后再试');
    return;
  }

  // 查询用户
  const admin = queryOne<AdminRow>(
    'SELECT * FROM admins WHERE username = ?',
    [username]
  );

  if (!admin) {
    recordLoginFailure(
      clientIp,
      username,
      config.rateLimit.loginMaxAttempts,
      config.rateLimit.loginWindowMs,
      config.rateLimit.loginBlockMs
    );
    error(res, ErrorCodes.LOGIN_FAILED);
    return;
  }

  // 验证密码
  const isValid = await bcrypt.compare(SECRET, admin.password_hash);
  if (!isValid) {
    recordLoginFailure(
      clientIp,
      username,
      config.rateLimit.loginMaxAttempts,
      config.rateLimit.loginWindowMs,
      config.rateLimit.loginBlockMs
    );
    error(res, ErrorCodes.LOGIN_FAILED);
    return;
  }

  clearLoginFailures(clientIp, username);

  // 设置Session
  req.session.adminId = admin.id as number;
  req.session.username = admin.username as string;

  // 记录登录日志
  execute(
    'INSERT INTO operation_logs (admin_id, operation, ip_address) VALUES (?, ?, ?)',
    [admin.id, 'login', req.ip]
  );

  success(res, {
    id: admin.id,
    username: admin.username,
    email: admin.email
  });
}));

/**
 * POST /api/auth/logout
 * 管理员登出
 */
router.post('/logout', (req: Request, res: Response) => {
  const adminId = req.session.adminId;

  if (adminId) {
    // 记录登出日志
    execute(
      'INSERT INTO operation_logs (admin_id, operation, ip_address) VALUES (?, ?, ?)',
      [adminId, 'logout', req.ip]
    );
  }

  req.session.destroy((err) => {
    if (err) {
      error(res, ErrorCodes.SERVER_ERROR, '登出失败');
      return;
    }
    success(res, null, '登出成功');
  });
});

/**
 * GET /api/auth/session
 * 检查Session有效性
 */
router.get('/session', (req: Request, res: Response) => {
  if (req.session.adminId) {
    success(res, {
      loggedIn: true,
      adminId: req.session.adminId,
      username: req.session.username
    });
  } else {
    success(res, {
      loggedIn: false
    });
  }
});

/**
 * POST /api/auth/change-Password
 * 修改密码
 */
router.post('/change-Password', asyncHandler(async (req: Request, res: Response) => {
  if (!req.session.adminId) {
    error(res, ErrorCodes.NOT_LOGGED_IN);
    return;
  }

  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    error(res, ErrorCodes.PARAM_ERROR, '请输入旧密码和新密码');
    return;
  }

  if (!isValidPassword(newPassword)) {
    error(res, ErrorCodes.PARAM_ERROR, '新密码至少8位，且需包含字母和数字');
    return;
  }

  // 查询用户
  const admin = queryOne<AdminRow>(
    'SELECT * FROM admins WHERE id = ?',
    [req.session.adminId]
  );

  if (!admin) {
    error(res, ErrorCodes.LOGIN_FAILED);
    return;
  }

  // 验证旧密码
  const isValid = await bcrypt.compare(oldPassword, admin.password_hash);
  if (!isValid) {
    error(res, ErrorCodes.LOGIN_FAILED, '旧密码错误');
    return;
  }

  // 更新密码
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  execute(
    'UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [hashedPassword, req.session.adminId]
  );

  success(res, null, '密码修改成功');
}));

export default router;
