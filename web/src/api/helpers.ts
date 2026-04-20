import type { ApiResponse } from '@/types';

export function unwrapData<T>(response: { data: ApiResponse<T> }, fallbackMessage: string = '响应数据缺失'): T {
  if (response.data.data === undefined) {
    throw new Error(response.data.message || fallbackMessage);
  }
  return response.data.data;
}
