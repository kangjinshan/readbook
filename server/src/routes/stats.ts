import { Router, Request, Response } from 'express';
import { success, error, paged } from '../utils/response';
import { ErrorCodes } from '../config';
import { authGuard } from '../middleware/authGuard';
import { requireOwnedChild } from '../middleware/childPermission';
import { asyncHandler } from '../middleware/errorHandler';
import { validatePagination, isValidDate, getSingleQueryParam, parseRouteInt } from '../utils/validator';
import { statsEngine } from '../services/statsEngine';
import { getBeijingDateString } from '../utils/dateUtils';

const router = Router();

// 所有路由需要认证
router.use(authGuard);

/**
 * GET /api/stats/realtime/:childId
 * 获取实时阅读状态
 */
router.get('/realtime/:childId', requireOwnedChild(req => parseRouteInt(req.params.childId)), asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;

  const status = statsEngine.getRealtimeStatus(childId);

  success(res, {
    isReading: status.isReading,
    bookTitle: status.bookTitle,
    currentPage: status.currentPage,
    todayReadMinutes: status.todayReadMinutes,
    deviceName: status.deviceName
  });
}));

/**
 * GET /api/stats/history/:childId
 * 获取历史阅读记录
 */
router.get('/history/:childId', requireOwnedChild(req => parseRouteInt(req.params.childId)), asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  const { page, limit } = validatePagination(req);

  // 默认查询最近30天（使用北京时间）
  const now = new Date();
  const defaultEndDate = getBeijingDateString();
  // 兼容 snake_case 和 camelCase
  const startDate = getSingleQueryParam(req.query.startDate || req.query.start_date) ||
    getBeijingDateString(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const endDate = getSingleQueryParam(req.query.endDate || req.query.end_date) || defaultEndDate;

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    error(res, ErrorCodes.PARAM_ERROR, '日期格式错误，应为 YYYY-MM-DD');
    return;
  }

  const result = statsEngine.getHistory(childId, startDate, endDate, page, limit);

  paged(res, { total: result.total, page, limit, items: result.records });
}));

/**
 * GET /api/stats/daily/:childId
 * 获取每日阅读统计
 */
router.get('/daily/:childId', requireOwnedChild(req => parseRouteInt(req.params.childId)), asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;

  // 默认查询最近7天（使用北京时间）
  const now = new Date();
  const defaultEndDate = getBeijingDateString();
  // 兼容 snake_case 和 camelCase
  const startDate = getSingleQueryParam(req.query.startDate || req.query.start_date) ||
    getBeijingDateString(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const endDate = getSingleQueryParam(req.query.endDate || req.query.end_date) || defaultEndDate;

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    error(res, ErrorCodes.PARAM_ERROR, '日期格式错误，应为 YYYY-MM-DD');
    return;
  }

  const stats = statsEngine.getDailyStats(childId, startDate, endDate);

  success(res, stats);
}));

/**
 * GET /api/stats/summary/:childId
 * 获取阅读总结
 */
router.get('/summary/:childId', requireOwnedChild(req => parseRouteInt(req.params.childId)), asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;
  const period = getSingleQueryParam(req.query.period) || 'week';

  if (!['day', 'week', 'month'].includes(period)) {
    error(res, ErrorCodes.PARAM_ERROR, '无效的时间周期');
    return;
  }

  const summary = statsEngine.getSummary(childId, period as 'day' | 'week' | 'month');

  success(res, summary);
}));

/**
 * GET /api/stats/export/:childId
 * 导出阅读数据为CSV
 */
router.get('/export/:childId', requireOwnedChild(req => parseRouteInt(req.params.childId)), asyncHandler(async (req: Request, res: Response) => {
  const childId = req.childId!;

  // 默认导出最近30天（使用北京时间）
  const now = new Date();
  const defaultEndDate = getBeijingDateString();
  // 兼容 snake_case 和 camelCase
  const startDate = getSingleQueryParam(req.query.startDate || req.query.start_date) ||
    getBeijingDateString(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const endDate = getSingleQueryParam(req.query.endDate || req.query.end_date) || defaultEndDate;

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    error(res, ErrorCodes.PARAM_ERROR, '日期格式错误，应为 YYYY-MM-DD');
    return;
  }

  const csv = statsEngine.exportToCsv(childId, startDate, endDate);

  // 设置响应头
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=reading_stats_${childId}_${startDate}_${endDate}.csv`);

  // 添加BOM以支持Excel正确显示中文
  res.send('\ufeff' + csv);
}));

export default router;
