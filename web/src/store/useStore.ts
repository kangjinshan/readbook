import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Admin, Child, Device, Book } from '@/types';

interface AppState {
  // 认证状态
  isLoggedIn: boolean;
  admin: Admin | null;
  setAdmin: (admin: Admin | null) => void;
  setLoggedIn: (loggedIn: boolean) => void;

  // 当前选中的子账号
  currentChildId: number | null;
  currentChild: Child | null;
  children: Child[];
  setChildren: (children: Child[]) => void;
  setCurrentChild: (child: Child | null) => void;
  setCurrentChildId: (id: number | null) => void;

  // 设备列表
  devices: Device[];
  setDevices: (devices: Device[]) => void;

  // 书籍列表
  books: Book[];
  setBooks: (books: Book[]) => void;

  // 全局 loading
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

function resolveChildSelection(children: Child[], currentChildId: number | null): Pick<AppState, 'currentChildId' | 'currentChild'> {
  if (children.length === 1) {
    return { currentChildId: children[0].id, currentChild: children[0] };
  }

  if (currentChildId !== null) {
    const currentChild = children.find((child) => child.id === currentChildId) || null;
    return { currentChildId: currentChild?.id ?? null, currentChild };
  }

  return { currentChildId: null, currentChild: null };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 认证状态
      isLoggedIn: false,
      admin: null,
      setAdmin: (admin) => set({
        admin,
        isLoggedIn: !!admin,
        // 登出时清空所有用户相关数据
        ...(admin === null ? {
          currentChildId: null,
          currentChild: null,
          children: [],
          devices: [],
          books: []
        } : {})
      }),
      setLoggedIn: (loggedIn) => set({ isLoggedIn: loggedIn }),

      // 当前选中的子账号
      currentChildId: null,
      currentChild: null,
      children: [],
      setChildren: (children) => {
        const { currentChildId } = get();
        set({ children, ...resolveChildSelection(children, currentChildId) });
      },
      setCurrentChild: (child) => set({ currentChild: child, currentChildId: child?.id ?? null }),
      setCurrentChildId: (id) => {
        const { children } = get();
        const child = children.find((c) => c.id === id) || null;
        set({ currentChildId: id, currentChild: child });
      },

      // 设备列表
      devices: [],
      setDevices: (devices) => set({ devices }),

      // 书籍列表
      books: [],
      setBooks: (books) => set({ books }),

      // 全局 loading
      loading: false,
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'readbook-storage',
      // 只持久化必要的状态
      partialize: (state) => ({
        currentChildId: state.currentChildId,
        // 不持久化敏感信息如 admin
      }),
    }
  )
);
