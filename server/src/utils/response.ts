import { Response } from 'express';
import { ErrorCodes, ErrorMessages } from '../config';

/**
 * 统一API响应格式
 */
export interface ApiResponse<T = any> {
  code: number;
  data?: T;
  message: string;
}

/**
 * 发送成功响应
 */
export function success<T>(res: Response, data?: T, message: string = '成功'): void {
  const response: ApiResponse<T> = {
    code: ErrorCodes.SUCCESS,
    message,
    ...(data !== undefined && { data })
  };
  res.json(response);
}

/**
 * 发送错误响应
 */
export function error(res: Response, code: number, customMessage?: string): void {
  const message = customMessage || ErrorMessages[code] || '未知错误';
  const response: ApiResponse = {
    code,
    message
  };
  res.status(getHttpStatus(code)).json(response);
}

/**
 * 根据错误码获取HTTP状态码
 */
function getHttpStatus(code: number): number {
  if (code === ErrorCodes.SUCCESS) return 200;
  if (code >= 1000 && code < 2000) return 401; // 认证错误
  if (code >= 2000 && code < 3000) return 400; // 设备错误
  if (code >= 3000 && code < 4000) return 404; // 书籍错误
  if (code >= 4000 && code < 5000) return 403; // 阅读控制错误
  if (code === ErrorCodes.PARAM_ERROR) return 400;
  if (code === ErrorCodes.RATE_LIMIT) return 429;
  return 500;
}

/**
 * 分页数据格式
 */
export interface PagedData<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}

/**
 * 发送分页响应
 */
export function paged<T>(res: Response, data: PagedData<T>): void {
  success(res, data);
}
