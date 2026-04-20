import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { message } from 'antd';
import type { ApiResponse } from '@/types';

// 创建 Axios 实例
const client: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true, // 发送 Cookie
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 可以在这里添加 loading 状态
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
client.interceptors.response.use(
  (response) => {
    // 文件下载或二进制响应直接返回
    if (response.config.responseType === 'blob' || response.config.responseType === 'arraybuffer') {
      return response;
    }

    const res = response.data as ApiResponse;

    // 业务错误处理
    if (res.code !== 0) {
      // 认证相关错误
      if (res.code === 1003 || res.code === 1004) {
        // Session 过期或未登录，跳转到登录页
        if (window.location.pathname !== '/login') {
          message.error('登录已过期，请重新登录');
          window.location.href = '/login';
        }
      }
      return Promise.reject(new Error(res.message || '请求失败'));
    }

    return response;
  },
  (error: AxiosError) => {
    // 网络错误处理
    if (error.response?.status === 401) {
      if (window.location.pathname !== '/login') {
        message.error('请先登录');
        window.location.href = '/login';
      }
    } else if (error.response?.status === 403) {
      message.error('没有权限执行该操作');
    } else if (error.response?.status === 404) {
      message.error('请求的资源不存在');
    } else if (error.response?.status === 500) {
      message.error('服务器错误，请稍后重试');
    } else if (!error.response) {
      message.error('网络连接失败');
    }
    return Promise.reject(error);
  }
);

export default client;
