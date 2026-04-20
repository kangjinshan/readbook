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
    if (children.length === 0) {
      loadChildren();
    }
  }, [children.length, loadChildren]);

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
