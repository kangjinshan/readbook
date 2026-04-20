import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

/**
 * 密码加密
 */
export async function hashPassword(Password: string): Promise<string> {
  return bcrypt.hash(Password, 10);
}

/**
 * 密码验证
 */
export async function verifyPassword(Password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(Password, hash);
}

/**
 * 生成UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 生成绑定码（6位数字）
 */
export function generateBindCode(): string {
  const code = crypto.randomInt(100000, 1000000);
  return code.toString();
}

/**
 * 生成随机文件名
 */
export function generateFileName(originalName: string): string {
  const ext = originalName.split('.').pop() || '';
  const randomName = crypto.randomBytes(16).toString('hex');
  return `${randomName}.${ext}`;
}
