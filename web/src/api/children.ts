import client from './client';
import { unwrapData } from './helpers';
import type { ApiResponse, Child } from '@/types';

export interface CreateChildParams {
  name: string;
  birthDate?: string;
}

export interface UpdateChildParams {
  name?: string;
  avatar?: string;
  birthDate?: string;
}

// 获取子账号列表
export async function getChildren(): Promise<Child[]> {
  const response = await client.get<ApiResponse<Child[]>>('/children');
  return response.data.data ?? [];
}

// 创建子账号
export async function createChild(params: CreateChildParams): Promise<number> {
  const response = await client.post<ApiResponse<{ childId: number }>>('/children', params);
  return unwrapData(response, '创建子账号失败').childId;
}

// 更新子账号
export async function updateChild(id: number, params: UpdateChildParams): Promise<void> {
  await client.put(`/children/${id}`, params);
}

// 删除子账号
export async function deleteChild(id: number): Promise<void> {
  await client.delete(`/children/${id}`);
}
