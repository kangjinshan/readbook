import { useEffect, useRef, useCallback } from 'react';

interface UsePollingOptions {
  interval: number; // 轮询间隔（毫秒）
  enabled?: boolean; // 是否启用
  immediate?: boolean; // 是否立即执行一次
}

/**
 * 轮询 Hook
 * @param callback 轮询回调函数
 * @param options 配置选项
 */
export function usePolling(
  callback: () => Promise<void> | void,
  options: UsePollingOptions
) {
  const { interval, enabled = true, immediate = false } = options;
  const savedCallback = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 保存最新的回调
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // 清理定时器
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 启动轮询
  const start = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      Promise.resolve(savedCallback.current()).catch((error) => {
        console.error('轮询执行失败:', error);
      });
    }, interval);
  }, [interval, clearTimer]);

  // 停止轮询
  const stop = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    if (enabled) {
      // 立即执行一次
      if (immediate) {
        Promise.resolve(savedCallback.current()).catch((error) => {
          console.error('轮询执行失败:', error);
        });
      }
      start();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [enabled, immediate, start, stop]);

  return { start, stop };
}
