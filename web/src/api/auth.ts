import client from './client';
import type { ApiResponse, Admin } from '@/types';
import { unwrapData } from './helpers';

export interface LoginParams {
  username: string;
  SECRET: string;
}

// 登录
export async function login(params: LoginParams): Promise<Admin> {
  const response = await client.post<ApiResponse<Admin>>('/auth/login', params);
  return unwrapData(response, '登录结果缺失');
}

// 登出
export async function logout(): Promise<void> {
  await client.post<ApiResponse>('/auth/logout');
}

// 检查 Session
export async function checkSession(): Promise<{ loggedIn: boolean; adminId?: number; username?: string }> {
  const response = await client.get<ApiResponse<{ loggedIn: boolean; adminId?: number; username?: string }>>('/auth/session');
  return unwrapData(response, '会话状态缺失');
}
