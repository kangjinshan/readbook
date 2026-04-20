import client from './client';
import type { ApiResponse, ControlPolicy } from '@/types';

export interface UpdateControlParams {
  dailyLimitMinutes?: number;
  continuousLimitMinutes?: number;
  restMinutes?: number;
  forbiddenStartTime?: string;
  forbiddenEndTime?: string;
  allowedFontSizes?: string[];
  allowedThemes?: string[];
}

// 获取防沉迷策略
export async function getControlPolicy(childId: number): Promise<ControlPolicy> {
  const response = await client.get<ApiResponse<ControlPolicy>>(`/control/${childId}`);
  return response.data.data!;
}

// 更新防沉迷策略
export async function updateControlPolicy(childId: number, params: UpdateControlParams): Promise<void> {
  await client.put(`/control/${childId}`, params);
}

// 重置今日阅读时长
export async function resetDailyReading(childId: number): Promise<void> {
  await client.post(`/control/${childId}/reset-daily`);
}
