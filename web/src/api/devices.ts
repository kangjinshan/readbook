import client from './client';
import type { ApiResponse, Device } from '@/types';

export interface BindDeviceParams {
  bindCode: string;
  childId: number;
}

export interface DirectBindParams {
  childId: number;
}

// 绑定设备（通过绑定码）
export async function bindDevice(params: BindDeviceParams): Promise<Device> {
  const response = await client.post<ApiResponse<Device>>('/devices/bind', params);
  return response.data.data!;
}

// 直接绑定设备（通过设备ID）
export async function directBindDevice(deviceId: number, params: DirectBindParams): Promise<Device> {
  const response = await client.post<ApiResponse<Device>>(`/devices/${deviceId}/direct-bind`, params);
  return response.data.data!;
}

// 获取已绑定设备列表
export async function getDevices(): Promise<Device[]> {
  const response = await client.get<ApiResponse<Device[]>>('/devices');
  return response.data.data || [];
}

// 获取所有设备列表（包括未绑定的）
export async function getAllDevices(): Promise<Device[]> {
  const response = await client.get<ApiResponse<Device[]>>('/devices/all');
  return response.data.data || [];
}

// 更新设备名称
export async function updateDevice(id: number, params: { deviceName: string }): Promise<void> {
  await client.put(`/devices/${id}`, params);
}

// 解绑设备
export async function unbindDevice(id: number): Promise<void> {
  await client.delete(`/devices/${id}`);
}

// 发送远程指令
export async function sendCommand(id: number, command: 'exit' | 'lock' | 'restart'): Promise<void> {
  await client.post(`/devices/${id}/command`, { command });
}
