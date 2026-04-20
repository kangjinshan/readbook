import { Request } from 'express';

/**
 * 验证必填字段
 */
export function requireFields(obj: any, fields: string[]): string | null {
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      return `缺少必填字段: ${field}`;
    }
  }
  return null;
}

/**
 * 验证用户名格式
 */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_]{3,50}$/.test(username);
}

/**
 * 验证密码格式
 */
export function isValidPassword(Password: string): boolean {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(Password);
}

/**
 * 验证日期格式
 */
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * 从查询参数中提取单个字符串
 */
export function getSingleQueryParam(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * 验证并解析整数路由参数
 */
export function parseRouteInt(value: string): number | null {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 解析请求体中的整数参数
 */
export function parseBodyInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * 验证时间格式 (HH:MM)
 */
export function isValidTime(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
}

/**
 * 验证分页参数
 */
export function validatePagination(req: Request): { page: number; limit: number } {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  return {
    page: Math.max(1, page),
    limit: Math.min(100, Math.max(1, limit))
  };
}

/**
 * 验证书籍格式
 */
export function isValidBookFormat(format: string): boolean {
  const validFormats = ['epub', 'pdf', 'txt', 'docx', 'mobi', 'azw3'];
  return validFormats.includes(format.toLowerCase());
}

/**
 * 清理HTML标签
 * 使用多层防护策略清理HTML内容
 */
export function sanitizeHtml(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // 移除所有HTML标签
    .replace(/<[^>]*>/g, '')
    // 移除HTML实体
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    // 移除潜在的脚本内容
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')
    // 移除控制字符
    .replace(/[\x00-\x1F\x7F]/g, '')
    // 合并空白
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 清理预览文本（用于书签等）
 * 限制长度并清理HTML
 */
export function sanitizePreviewText(text: string, maxLength: number = 100): string {
  const sanitized = sanitizeHtml(text);
  return sanitized.length > maxLength ? sanitized.substring(0, maxLength) + '...' : sanitized;
}

/**
 * 清理用户输入的文件标题
 */
export function sanitizeFileTitle(text: string, fallback: string = '未命名书籍'): string {
  const sanitized = text
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return sanitized || fallback;
}

/**
 * 截取文本预览
 */
export function truncate(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
