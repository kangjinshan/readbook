import { Request, Response, NextFunction } from 'express';
import { error } from '../utils/response';
import { ErrorCodes } from '../config';

/**
 * 全局错误处理中间件
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error('服务器错误:', err);

  // 处理JSON解析错误
  if (err instanceof SyntaxError && 'body' in err) {
    error(res, ErrorCodes.PARAM_ERROR, 'JSON格式错误');
    return;
  }

  // 处理其他错误
  const message = process.env.NODE_ENV === 'production'
    ? '服务器内部错误'
    : (err.message || '服务器内部错误');
  error(res, ErrorCodes.SERVER_ERROR, message);
}

/**
 * 404处理中间件
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    code: 404,
    message: `路由不存在: ${req.method} ${req.path}`
  });
}

/**
 * 异步路由包装器
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
