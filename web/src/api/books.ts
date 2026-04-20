import client from './client';
import type { ApiResponse, Book, BookDetail, PaginatedData, Chapter } from '@/types';
import { unwrapData } from './helpers';

export interface BookListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface UploadBookParams {
  file: File;
  title?: string;
  author?: string;
  onProgress?: (percent: number) => void;
}

export type BookParseMode = 'plainText' | 'webview';

export function getBookSourceDownloadUrl(id: number): string {
  return `/api/books/${id}/source`;
}

// 获取书籍列表
export async function getBooks(params: BookListParams = {}): Promise<PaginatedData<Book>> {
  const response = await client.get<ApiResponse<PaginatedData<Book>>>('/books', { params });
  return unwrapData(response, '书籍列表数据缺失');
}

// 获取书籍详情
export async function getBook(id: number): Promise<BookDetail> {
  const response = await client.get<ApiResponse<BookDetail>>(`/books/${id}`);
  return unwrapData(response, '书籍详情数据缺失');
}

// 上传书籍
export async function uploadBook(params: UploadBookParams): Promise<Book> {
  const formData = new FormData();
  formData.append('file', params.file);
  if (params.title) formData.append('title', params.title);
  if (params.author) formData.append('author', params.author);

  const response = await client.post<ApiResponse<Book>>('/books/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 0,
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && params.onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        params.onProgress(percent);
      }
    },
  });
  return unwrapData(response, '上传结果缺失');
}

// 更新书籍信息
export async function updateBook(id: number, params: { title?: string; author?: string; publisher?: string }): Promise<void> {
  await client.put(`/books/${id}`, params);
}

// 上传或替换书籍封面
export async function uploadBookCover(id: number, file: File): Promise<{ coverPath: string | null }> {
  const formData = new FormData();
  formData.append('cover', file);

  const response = await client.post<ApiResponse<{ coverPath: string | null }>>(`/books/${id}/cover`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return unwrapData(response, '封面上传结果缺失');
}

export async function reparseBook(id: number, parseMode: BookParseMode): Promise<{
  bookId: number;
  title: string;
  parseMode: BookParseMode;
  totalPages: number;
  totalChapters: number;
  coverPath: string | null;
  progressReset: boolean;
  bookmarksReset: boolean;
}> {
  const response = await client.post<ApiResponse<{
    bookId: number;
    title: string;
    parseMode: BookParseMode;
    totalPages: number;
    totalChapters: number;
    coverPath: string | null;
    progressReset: boolean;
    bookmarksReset: boolean;
  }>>(`/books/${id}/reparse`, { parseMode });
  return unwrapData(response, '重新解析结果缺失');
}

// 删除书籍
export async function deleteBook(id: number): Promise<void> {
  await client.delete(`/books/${id}`);
}

// 授权书籍
export async function assignBook(bookId: number, childIds: number[]): Promise<void> {
  await client.post(`/books/${bookId}/assign`, { childIds });
}

// 取消授权
export async function unassignBook(bookId: number, childIds: number[]): Promise<void> {
  await client.delete(`/books/${bookId}/assign`, { data: { childIds } });
}

// 预览书籍内容
export async function previewBook(bookId: number, params: { chapter?: number; page?: number }): Promise<{
  chapter: number;
  page: number;
  content: string;
  contentBlocks?: Array<{
    type: string;
    text?: string;
    assetUrl?: string;
    alt?: string | null;
    width?: number | null;
    height?: number | null;
  }>;
  renderMode?: 'xhtml' | null;
  renderBaseUrl?: string | null;
  renderHtml?: string | null;
  renderCss?: string[];
}> {
  const response = await client.get<ApiResponse<{
    chapter: number;
    page: number;
    content: string;
    contentBlocks?: Array<{
      type: string;
      text?: string;
      assetUrl?: string;
      alt?: string | null;
      width?: number | null;
      height?: number | null;
    }>;
    renderMode?: 'xhtml' | null;
    renderBaseUrl?: string | null;
    renderHtml?: string | null;
    renderCss?: string[];
  }>>(`/books/${bookId}/preview`, { params });
  return unwrapData(response, '预览内容缺失');
}

// 获取书籍章节
export async function getChapters(bookId: number): Promise<Chapter[]> {
  const response = await client.get<ApiResponse<{ chapters: Chapter[] }>>(`/books/${bookId}/chapters`);
  return unwrapData(response, '章节数据缺失').chapters || [];
}
