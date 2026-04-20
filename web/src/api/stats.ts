import client from './client';
import type { ApiResponse, RealtimeStatus, DailyStat, ReadingRecord, ReadingSummary } from '@/types';
import { unwrapData } from './helpers';

// 获取实时阅读状态
export async function getRealtimeStatus(childId: number): Promise<RealtimeStatus> {
  const response = await client.get<ApiResponse<RealtimeStatus>>(`/stats/realtime/${childId}`);
  return unwrapData(response, '实时状态缺失');
}

// 获取历史阅读记录
export async function getReadingHistory(
  childId: number,
  params: { startDate?: string; endDate?: string; page?: number; limit?: number }
): Promise<{ total: number; records: ReadingRecord[] }> {
  const response = await client.get<ApiResponse<{ total: number; items: ReadingRecord[] }>>(`/stats/history/${childId}`, { params });
  const data = unwrapData(response, '历史记录缺失');
  return {
    total: data.total,
    records: data.items || [],
  };
}

// 获取每日阅读统计
export async function getDailyStats(
  childId: number,
  params: { startDate?: string; endDate?: string }
): Promise<DailyStat[]> {
  const response = await client.get<ApiResponse<DailyStat[]>>(`/stats/daily/${childId}`, { params });
  return response.data.data || [];
}

// 获取阅读总结
export async function getSummary(
  childId: number,
  params: { period: 'day' | 'week' | 'month' }
): Promise<ReadingSummary> {
  const response = await client.get<ApiResponse<ReadingSummary>>(`/stats/summary/${childId}`, { params });
  return unwrapData(response, '阅读总结缺失');
}

// 导出阅读数据
export async function exportStats(
  childId: number,
  params: { startDate?: string; endDate?: string; format: 'xlsx' | 'csv' }
): Promise<Blob> {
  const response = await client.get<Blob>(`/stats/export/${childId}`, {
    params,
    responseType: 'blob',
  });
  return response.data;
}

// 下载导出文件
export function downloadExportFile(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
