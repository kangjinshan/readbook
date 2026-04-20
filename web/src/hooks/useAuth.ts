import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { checkSession, login as apiLogin, logout as apiLogout } from '@/api/auth';
import type { LoginParams } from '@/api/auth';

export function useAuth() {
  const navigate = useNavigate();
  const { isLoggedIn, admin, setAdmin, setLoggedIn } = useStore();

  // 检查登录状态
  const checkAuth = useCallback(async () => {
    try {
      const result = await checkSession();
      setLoggedIn(result.loggedIn);
      if (!result.loggedIn) {
        setAdmin(null);
      }
      return result.loggedIn;
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      console.error('检查登录状态失败:', error);
      setLoggedIn(false);
      setAdmin(null);
      return false;
    }
  }, [setLoggedIn, setAdmin]);

  // 登录
  const login = useCallback(
    async (params: LoginParams) => {
      const adminData = await apiLogin(params);
      setAdmin(adminData);
      setLoggedIn(true);
      return adminData;
    },
    [setAdmin, setLoggedIn]
  );

  // 登出
  const logout = useCallback(async () => {
    await apiLogout();
    setAdmin(null);
    setLoggedIn(false);
    navigate('/login');
  }, [setAdmin, setLoggedIn, navigate]);

  return {
    isLoggedIn,
    admin,
    checkAuth,
    login,
    logout,
  };
}

// 路由守卫 Hook
export function useAuthGuard() {
  const navigate = useNavigate();
  const { isLoggedIn, checkAuth } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    const verify = async () => {
      const loggedIn = await checkAuth();
      if (!active) return;

      if (!loggedIn) {
        navigate('/login');
      }

      setChecking(false);
    };

    void verify();

    return () => {
      active = false;
    };
  }, [checkAuth, navigate]);

  return { isLoggedIn, checking };
}
