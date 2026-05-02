import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { getChildren } from '@/api/children';
import type { Child } from '@/types';

interface UseChildReturn {
  children: Child[];
  currentChild: Child | null;
  currentChildId: number | null;
  loadChildren: () => Promise<Child[]>;
  switchChild: (childId: number | null) => void;
  loading: boolean;
  error: string | null;
}

export function useChild(): UseChildReturn {
  const { children, currentChild, currentChildId, setChildren, setCurrentChildId } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载子账号列表
  const loadChildren = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getChildren();
      setChildren(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载子账号列表失败';
      console.error('加载子账号列表失败:', err);
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  }, [setChildren]);

  // 切换子账号
  const switchChild = useCallback(
    (childId: number | null) => {
      setCurrentChildId(childId);
    },
    [setCurrentChildId]
  );

  // 初始化加载
  useEffect(() => {
    // 未登录时不自动加载（避免登出时清空 children 触发多余请求）
    if (children.length === 0 && currentChildId !== null) {
      loadChildren();
    } else if (children.length === 0 && currentChildId === null) {
      // 只在首次挂载时加载，检查 store 是否有登录状态
      const stored = useStore.getState();
      if (stored.isLoggedIn) {
        loadChildren();
      }
    }
  }, [children.length, currentChildId, loadChildren]);

  return {
    children,
    currentChild,
    currentChildId,
    loadChildren,
    switchChild,
    loading,
    error,
  };
}
