import { Router, Request, Response } from 'express';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../config';
import { queryOne, execute } from '../database';
import { authGuard, getCurrentAdminId } from '../middleware/authGuard';
import { requireOwnedChild } from '../middleware/childPermission';
import { asyncHandler } from '../middleware/errorHandler';
import { isValidTime, parseRouteInt } from '../utils/validator';
import { antiAddictionService } from '../services/antiAddiction';

const router = Router();

// 所有路由需要认证
router.use(authGuard);

/**
 * GET /api/control/:childId
 * 获取防沉迷策略
 */
router.get('/:childId', requireOwnedChild(req => parseRouteInt(req.params.childId)), asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;

  const policy = antiAddictionService.getPolicy(childId);
  if (!policy) {
    error(res, ErrorCodes.SERVER_ERROR, '获取防沉迷策略失败');
    return;
  }

  success(res, {
    childId: policy.childId,
    dailyLimitMinutes: policy.dailyLimitMinutes,
    continuousLimitMinutes: policy.continuousLimitMinutes,
    restMinutes: policy.restMinutes,
    forbiddenStartTime: policy.forbiddenStartTime,
    forbiddenEndTime: policy.forbiddenEndTime,
    allowedFontSizes: policy.allowedFontSizes,
    allowedThemes: policy.allowedThemes
  });
}));

/**
 * PUT /api/control/:childId
 * 更新防沉迷策略
 */
router.put('/:childId', requireOwnedChild(req => parseRouteInt(req.params.childId)), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const childId = req.childId!;
  // 兼容下划线和驼峰格式，使用 ?? 避免吞掉 0 值
  const dailyLimitMinutes = req.body.daily_limit_minutes ?? req.body.dailyLimitMinutes;
  const continuousLimitMinutes = req.body.continuous_limit_minutes ?? req.body.continuousLimitMinutes;
  const restMinutes = req.body.rest_minutes ?? req.body.restMinutes;
  const forbiddenStartTime = req.body.forbidden_start_time ?? req.body.forbiddenStartTime;
  const forbiddenEndTime = req.body.forbidden_end_time ?? req.body.forbiddenEndTime;
  const allowedFontSizes = req.body.allowed_font_sizes ?? req.body.allowedFontSizes;
  const allowedThemes = req.body.allowed_themes ?? req.body.allowedThemes;

  // 参数验证
  if (dailyLimitMinutes !== undefined && dailyLimitMinutes < 0) {
    error(res, ErrorCodes.PARAM_ERROR, '每日限制时长不能为负数');
    return;
  }

  if (continuousLimitMinutes !== undefined && continuousLimitMinutes < 0) {
    error(res, ErrorCodes.PARAM_ERROR, '连续阅读限制不能为负数');
    return;
  }

  if (restMinutes !== undefined && restMinutes < 0) {
    error(res, ErrorCodes.PARAM_ERROR, '休息时长不能为负数');
    return;
  }

  if (forbiddenStartTime && !isValidTime(forbiddenStartTime)) {
    error(res, ErrorCodes.PARAM_ERROR, '禁止开始时间格式错误');
    return;
  }

  if (forbiddenEndTime && !isValidTime(forbiddenEndTime)) {
    error(res, ErrorCodes.PARAM_ERROR, '禁止结束时间格式错误');
    return;
  }

  // 获取当前策略
  const currentPolicy = antiAddictionService.getPolicy(childId);
  if (!currentPolicy) {
    error(res, ErrorCodes.SERVER_ERROR, '获取防沉迷策略失败');
    return;
  }

  // 更新策略
  const newPolicy = {
    childId,
    dailyLimitMinutes: dailyLimitMinutes ?? currentPolicy.dailyLimitMinutes,
    continuousLimitMinutes: continuousLimitMinutes ?? currentPolicy.continuousLimitMinutes,
    restMinutes: restMinutes ?? currentPolicy.restMinutes,
    forbiddenStartTime: forbiddenStartTime !== undefined ? forbiddenStartTime : currentPolicy.forbiddenStartTime,
    forbiddenEndTime: forbiddenEndTime !== undefined ? forbiddenEndTime : currentPolicy.forbiddenEndTime,
    allowedFontSizes: allowedFontSizes ?? currentPolicy.allowedFontSizes,
    allowedThemes: allowedThemes ?? currentPolicy.allowedThemes
  };

  antiAddictionService.savePolicy(newPolicy);

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, child_id, operation, details) VALUES (?, ?, ?, ?)',
    [adminId, childId, 'update_policy', JSON.stringify(newPolicy)]
  );

  success(res, {
    childId,
    dailyLimitMinutes: newPolicy.dailyLimitMinutes,
    continuousLimitMinutes: newPolicy.continuousLimitMinutes,
    restMinutes: newPolicy.restMinutes,
    forbiddenStartTime: newPolicy.forbiddenStartTime,
    forbiddenEndTime: newPolicy.forbiddenEndTime,
    allowedFontSizes: newPolicy.allowedFontSizes,
    allowedThemes: newPolicy.allowedThemes
  }, '更新成功');
}));

/**
 * POST /api/control/:childId/reset-daily
 * 重置今日阅读时长
 */
router.post('/:childId/reset-daily', requireOwnedChild(req => parseRouteInt(req.params.childId)), asyncHandler(async (req: Request, res: Response) => {
  const adminId = getCurrentAdminId(req)!;
  const childId = req.childId!;

  // 重置今日阅读时长
  antiAddictionService.resetDailyReading(childId);

  // 记录日志
  execute(
    'INSERT INTO operation_logs (admin_id, child_id, operation, details) VALUES (?, ?, ?, ?)',
    [adminId, childId, 'reset_daily', JSON.stringify({ reason: 'manual_reset' })]
  );

  success(res, null, '重置成功');
}));

export default router;
