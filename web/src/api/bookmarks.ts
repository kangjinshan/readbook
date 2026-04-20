import client from './client';
import type { ApiResponse, Bookmark } from '@/types';
import { unwrapData } from './helpers';

export interface CreateBookmarkParams {
  childId: number;
  bookId: number;
  pageNumber: number;
  previewText?: string;
}

// 获取书签列表
export async function getBookmarks(params: { childId: number; bookId?: number }): Promise<Bookmark[]> {
  const response = await client.get<ApiResponse<Bookmark[]>>('/bookmarks', { params });
  return response.data.data || [];
}

// 添加书签
export async function createBookmark(params: CreateBookmarkParams): Promise<number> {
  const response = await client.post<ApiResponse<{ bookmarkId: number }>>('/bookmarks', params);
  return unwrapData(response, '书签创建结果缺失').bookmarkId;
}

// 删除书签
export async function deleteBookmark(id: number): Promise<void> {
  await client.delete(`/bookmarks/${id}`);
}

// 批量删除书签
export async function batchDeleteBookmarks(bookmarkIds: number[]): Promise<void> {
  await client.delete('/bookmarks/batch-delete', { data: { bookmarkIds } });
}
