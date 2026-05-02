import { query, queryOne, execute } from '../database';
import { config, ErrorCodes } from '../config';
import {
  clampRecordedDurationSeconds,
  distributeRecordedMinutesByBeijingDay,
  getBeijingCurrentMinutes,
  getBeijingDateString,
  getBeijingDayUtcRange,
  getOverlapSeconds,
  parseStoredUtcDateTime,
} from '../utils/dateUtils';

/**
 * 防沉迷策略
 */
export interface ControlPolicy {
  childId: number;
  dailyLimitMinutes: number;
  continuousLimitMinutes: number;
  restMinutes: number;
  forbiddenStartTime: string | null;
  forbiddenEndTime: string | null;
  allowedFontSizes: string[];
  allowedThemes: string[];
}

/**
 * 阅读状态
 */
export interface ReadingStatus {
  shouldLock: boolean;
  reason?: string;
  lockDurationMinutes?: number;
  message?: string;
  remainingContinuousMinutes: number;
  remainingDailyMinutes: number;
}

/**
 * 防沉迷服务
 */
export class AntiAddictionService {
  private parseJsonArray(value: unknown, fallback: string[]): string[] {
    if (typeof value !== 'string' || !value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : fallback;
    } catch {
      return fallback;
    }
  }

  private timeToMinutes(time: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  private getSessionRecordedDurationSeconds(
    sessionStart: Date,
    sessionEnd: Date,
    durationSeconds: unknown
  ): number {
    const safeDurationSeconds = Math.max(0, Number(durationSeconds ?? 0));
    return clampRecordedDurationSeconds(sessionStart, sessionEnd, safeDurationSeconds);
  }

  private getSessionEffectiveEndTime(
    sessionStart: Date,
    sessionEnd: Date,
    durationSeconds: unknown
  ): Date {
    const safeDurationSeconds = this.getSessionRecordedDurationSeconds(
      sessionStart,
      sessionEnd,
      durationSeconds
    );
    return new Date(Math.min(sessionEnd.getTime(), sessionStart.getTime() + safeDurationSeconds * 1000));
  }

  private getCurrentSessionEffectiveEndTime(
    sessionStartTime: unknown,
    recordedDurationSeconds: number,
    now: Date
  ): Date | null {
    const startTime = parseStoredUtcDateTime(sessionStartTime);
    if (!startTime) {
      return null;
    }

    return this.getSessionEffectiveEndTime(startTime, now, recordedDurationSeconds);
  }

  private getRollingWindowReadingSeconds(
    childId: number,
    windowStart: Date,
    windowEnd: Date,
    excludeSessionId?: string,
    now: Date = new Date()
  ): number {
    // 读取该孩子的最近重置时间，跳过重置之前的会话
    const childRow = queryOne('SELECT daily_reading_reset_at FROM children WHERE id = ?', [childId]);
    const resetAt = childRow?.daily_reading_reset_at ? parseStoredUtcDateTime(childRow.daily_reading_reset_at) : null;

    // SQL 级过滤：只查询可能与窗口重叠的会话
    const windowStartIso = windowStart.toISOString();
    const sessions = query(
      `SELECT id, start_time, end_time, duration_seconds
       FROM reading_sessions
       WHERE child_id = ?
         AND COALESCE(end_time, CURRENT_TIMESTAMP) >= ?`,
      [childId, windowStartIso]
    );

    return sessions.reduce((sum, session) => {
      if (excludeSessionId && String(session.id) === excludeSessionId) {
        return sum;
      }

      // 跳过重置之前已结束的会话
      if (resetAt && session.end_time) {
        const sessionEnd = parseStoredUtcDateTime(session.end_time);
        if (sessionEnd && sessionEnd <= resetAt) {
          return sum;
        }
      }

      const startTime = parseStoredUtcDateTime(session.start_time);
      if (!startTime) {
        return sum;
      }

      const endTime = parseStoredUtcDateTime(session.end_time) ?? now;
      const effectiveEndTime = this.getSessionEffectiveEndTime(
        startTime,
        endTime,
        session.duration_seconds
      );

      return sum + getOverlapSeconds(startTime, effectiveEndTime, windowStart, windowEnd);
    }, 0);
  }

  private getCurrentSessionRollingWindowSeconds(
    sessionStartTime: unknown,
    recordedDurationSeconds: number,
    windowStart: Date,
    windowEnd: Date
  ): number {
    const startTime = parseStoredUtcDateTime(sessionStartTime);
    if (!startTime) {
      return Math.max(0, recordedDurationSeconds);
    }

    const effectiveEndTime = this.getCurrentSessionEffectiveEndTime(
      sessionStartTime,
      recordedDurationSeconds,
      windowEnd
    );
    if (!effectiveEndTime) {
      return 0;
    }

    return getOverlapSeconds(startTime, effectiveEndTime, windowStart, windowEnd);
  }

  private getRollingWindowStart(policy: ControlPolicy, now: Date): Date {
    const windowMinutes = policy.continuousLimitMinutes + policy.restMinutes;
    return new Date(now.getTime() - windowMinutes * 60 * 1000);
  }

  getRollingWindowReadingMinutes(
    childId: number,
    policy: ControlPolicy,
    now: Date = new Date()
  ): number {
    return Math.floor(this.getRollingWindowReadingSecondsForPolicy(childId, policy, now) / 60);
  }

  getRollingWindowReadingSecondsForPolicy(
    childId: number,
    policy: ControlPolicy,
    now: Date = new Date()
  ): number {
    const windowStart = this.getRollingWindowStart(policy, now);
    return this.getRollingWindowReadingSeconds(childId, windowStart, now, undefined, now);
  }

  /**
   * 获取防沉迷策略
   */
  getPolicy(childId: number): ControlPolicy | null {
    const row = queryOne(
      'SELECT * FROM control_policies WHERE child_id = ?',
      [childId]
    );

    if (!row) {
      // 返回默认策略
      return {
        childId,
        dailyLimitMinutes: config.antiAddiction.defaultDailyLimitMinutes,
        continuousLimitMinutes: config.antiAddiction.defaultContinuousLimitMinutes,
        restMinutes: config.antiAddiction.defaultRestMinutes,
        forbiddenStartTime: null,
        forbiddenEndTime: null,
        allowedFontSizes: ['small', 'medium', 'large'],
        allowedThemes: ['yellow', 'white', 'dark']
      };
    }

    return {
      childId: row.child_id as number,
      dailyLimitMinutes: row.daily_limit_minutes as number,
      continuousLimitMinutes: row.continuous_limit_minutes as number,
      restMinutes: row.rest_minutes as number,
      forbiddenStartTime: row.forbidden_start_time as string | null,
      forbiddenEndTime: row.forbidden_end_time as string | null,
      allowedFontSizes: this.parseJsonArray(row.allowed_font_sizes, ['small', 'medium', 'large']),
      allowedThemes: this.parseJsonArray(row.allowed_themes, ['yellow', 'white', 'dark'])
    };
  }

  /**
   * 保存防沉迷策略
   */
  savePolicy(policy: ControlPolicy): void {
    const existing = queryOne(
      'SELECT id FROM control_policies WHERE child_id = ?',
      [policy.childId]
    );

    if (existing) {
      execute(
        `UPDATE control_policies SET
          daily_limit_minutes = ?,
          continuous_limit_minutes = ?,
          rest_minutes = ?,
          forbidden_start_time = ?,
          forbidden_end_time = ?,
          allowed_font_sizes = ?,
          allowed_themes = ?
        WHERE child_id = ?`,
        [
          policy.dailyLimitMinutes,
          policy.continuousLimitMinutes,
          policy.restMinutes,
          policy.forbiddenStartTime,
          policy.forbiddenEndTime,
          JSON.stringify(policy.allowedFontSizes),
          JSON.stringify(policy.allowedThemes),
          policy.childId
        ]
      );
    } else {
      execute(
        `INSERT INTO control_policies
          (child_id, daily_limit_minutes, continuous_limit_minutes, rest_minutes,
           forbidden_start_time, forbidden_end_time, allowed_font_sizes, allowed_themes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          policy.childId,
          policy.dailyLimitMinutes,
          policy.continuousLimitMinutes,
          policy.restMinutes,
          policy.forbiddenStartTime,
          policy.forbiddenEndTime,
          JSON.stringify(policy.allowedFontSizes),
          JSON.stringify(policy.allowedThemes)
        ]
      );
    }
  }

  /**
   * 检查是否可以开始阅读
   */
  canStartReading(childId: number): {
    allowed: boolean;
    reason?: string;
    message?: string;
    lockDurationMinutes?: number;
  } {
    const policy = this.getPolicy(childId);
    if (!policy) {
      return { allowed: false, reason: 'no_policy', message: '未找到防沉迷策略' };
    }

    // 检查禁止时段
    const forbiddenCheck = this.checkForbiddenTime(policy);
    if (!forbiddenCheck.allowed) {
      return forbiddenCheck;
    }

    // 检查每日限额
    const todayMinutes = this.getTodayReadingMinutes(childId);
    if (todayMinutes >= policy.dailyLimitMinutes) {
      return {
        allowed: false,
        reason: 'daily_limit_exceeded',
        message: `今日阅读时长已达${policy.dailyLimitMinutes}分钟上限`,
        lockDurationMinutes: 0
      };
    }

    // 检查连续阅读限制（滚动窗口）
    const now = new Date();
    const rollingWindowStart = this.getRollingWindowStart(policy, now);
    const rollingSeconds = this.getRollingWindowReadingSeconds(
      childId, rollingWindowStart, now, undefined, now
    );
    const continuousLimitSeconds = policy.continuousLimitMinutes * 60;
    const rollingWindowMinutes = policy.continuousLimitMinutes + policy.restMinutes;

    if (rollingSeconds >= continuousLimitSeconds) {
      // 计算还需要休息多久：最近一次阅读结束时间 + restMinutes - now
      const lastSession = queryOne(
        `SELECT end_time FROM reading_sessions
         WHERE child_id = ? AND end_time IS NOT NULL
         ORDER BY end_time DESC LIMIT 1`,
        [childId]
      );
      let remainingRestMinutes = policy.restMinutes;
      if (lastSession?.end_time) {
        const lastEnd = parseStoredUtcDateTime(lastSession.end_time);
        if (lastEnd) {
          const elapsed = Math.floor((now.getTime() - lastEnd.getTime()) / 60000);
          remainingRestMinutes = Math.max(0, policy.restMinutes - elapsed);
        }
      }
      return {
        allowed: false,
        reason: 'continuous_limit_exceeded',
        message: `最近${rollingWindowMinutes}分钟内阅读已达${policy.continuousLimitMinutes}分钟，请休息${policy.restMinutes}分钟`,
        lockDurationMinutes: remainingRestMinutes
      };
    }

    return { allowed: true };
  }

  /**
   * 检查阅读状态
   */
  checkReadingStatus(
    childId: number,
    sessionStartTime: unknown,
    currentSessionDuration: number,
    currentSessionId?: string
  ): ReadingStatus {
    const policy = this.getPolicy(childId);
    if (!policy) {
      return {
        shouldLock: true,
        reason: 'no_policy',
        message: '未找到防沉迷策略',
        remainingContinuousMinutes: 0,
        remainingDailyMinutes: 0
      };
    }
    const now = new Date();
    const todayMinutes = this.getTodayReadingMinutes(childId, currentSessionId, now);
    const currentSessionTodayMinutes = Math.floor(
      this.getCurrentSessionTodayDurationSeconds(sessionStartTime, currentSessionDuration, now) / 60
    );
    const rollingWindowStart = this.getRollingWindowStart(policy, now);
    const rollingSeconds = this.getRollingWindowReadingSeconds(
      childId,
      rollingWindowStart,
      now,
      currentSessionId,
      now
    ) + this.getCurrentSessionRollingWindowSeconds(
      sessionStartTime,
      currentSessionDuration,
      rollingWindowStart,
      now
    );
    const currentSessionSeconds = this.getCurrentSessionRollingWindowSeconds(
      sessionStartTime,
      currentSessionDuration,
      rollingWindowStart,
      now
    );
    const continuousLimitSeconds = policy.continuousLimitMinutes * 60;
    const rollingWindowMinutes = policy.continuousLimitMinutes + policy.restMinutes;

    // 检查禁止时段
    const forbiddenCheck = this.checkForbiddenTime(policy);
    if (!forbiddenCheck.allowed) {
      return {
        shouldLock: true,
        reason: 'forbidden_time',
        message: forbiddenCheck.message,
        remainingContinuousMinutes: 0,
        remainingDailyMinutes: 0
      };
    }

    // 检查每日限额
    const totalWithSession = todayMinutes + currentSessionTodayMinutes;
    if (totalWithSession >= policy.dailyLimitMinutes) {
      return {
        shouldLock: true,
        reason: 'daily_limit_exceeded',
        message: `今日阅读时长已达${policy.dailyLimitMinutes}分钟上限`,
        remainingContinuousMinutes: Math.max(0, Math.floor((continuousLimitSeconds - rollingSeconds) / 60)),
        remainingDailyMinutes: 0
      };
    }

    // 检查连续阅读时长
    if (currentSessionSeconds >= continuousLimitSeconds || rollingSeconds > continuousLimitSeconds) {
      return {
        shouldLock: true,
        reason: 'continuous_limit_exceeded',
        message: `最近${rollingWindowMinutes}分钟内阅读已达${policy.continuousLimitMinutes}分钟，请休息${policy.restMinutes}分钟`,
        lockDurationMinutes: policy.restMinutes,
        remainingContinuousMinutes: 0,
        remainingDailyMinutes: Math.max(0, policy.dailyLimitMinutes - totalWithSession)
      };
    }

    return {
      shouldLock: false,
      remainingContinuousMinutes: Math.max(0, Math.floor((continuousLimitSeconds - rollingSeconds) / 60)),
      remainingDailyMinutes: Math.max(0, policy.dailyLimitMinutes - totalWithSession)
    };
  }

  /**
   * 检查禁止时段
   */
  private checkForbiddenTime(policy: ControlPolicy): { allowed: boolean; message?: string } {
    if (!policy.forbiddenStartTime || !policy.forbiddenEndTime) {
      return { allowed: true };
    }

    // 使用北京时间判断当前时段
    const currentMinutes = getBeijingCurrentMinutes();
    const startMinutes = this.timeToMinutes(policy.forbiddenStartTime);
    const endMinutes = this.timeToMinutes(policy.forbiddenEndTime);

    if (startMinutes === null || endMinutes === null) {
      return { allowed: true };
    }

    // 处理跨午夜的情况 (如 22:00 - 07:00)
    if (startMinutes < endMinutes) {
      // 不跨午夜
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return {
          allowed: false,
          message: `当前为禁止阅读时段（${policy.forbiddenStartTime}-${policy.forbiddenEndTime}）`
        };
      }
    } else {
      // 跨午夜
      if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
        return {
          allowed: false,
          message: `当前为禁止阅读时段（${policy.forbiddenStartTime}-${policy.forbiddenEndTime}）`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 获取今日阅读分钟数
   */
  getTodayReadingMinutes(childId: number, excludeSessionId?: string, now: Date = new Date()): number {
    // 读取该孩子的最近重置时间，跳过重置之前的会话
    const childRow = queryOne('SELECT daily_reading_reset_at FROM children WHERE id = ?', [childId]);
    const resetAt = childRow?.daily_reading_reset_at ? parseStoredUtcDateTime(childRow.daily_reading_reset_at) : null;

    const todayRange = getBeijingDayUtcRange(now);
    const params: Array<number | string> = [childId, todayRange.date, todayRange.date];
    let sql = `SELECT id, start_time, end_time, duration_seconds
      FROM reading_sessions
      WHERE child_id = ?
        AND date(datetime(start_time, '+8 hours')) <= ?
        AND date(datetime(COALESCE(end_time, CURRENT_TIMESTAMP), '+8 hours')) >= ?`;

    if (excludeSessionId) {
      sql += ' AND id != ?';
      params.push(excludeSessionId);
    }

    const sessions = query(sql, params);
    const totalSeconds = sessions.reduce((sum, session) => {
      // 跳过重置之前已结束的会话
      if (resetAt && session.end_time) {
        const sessionEnd = parseStoredUtcDateTime(session.end_time);
        if (sessionEnd && sessionEnd <= resetAt) {
          return sum;
        }
      }

      const startTime = parseStoredUtcDateTime(session.start_time);
      if (!startTime) {
        return sum;
      }

      const endTime = parseStoredUtcDateTime(session.end_time) ?? now;
      const effectiveEndTime = this.getSessionEffectiveEndTime(
        startTime,
        endTime,
        session.duration_seconds
      );
      const attributedSeconds = getOverlapSeconds(
        startTime,
        effectiveEndTime,
        todayRange.start,
        todayRange.end
      );
      return sum + attributedSeconds;
    }, 0);

    return Math.floor(totalSeconds / 60);
  }

  /**
   * 重置今日阅读时长
   */
  resetDailyReading(childId: number): void {
    const today = getBeijingDateString();
    const resetAt = new Date().toISOString();
    // 将今日所有已结束的阅读会话标记为已重置，使 getTodayReadingMinutes 跳过它们
    execute(
      `UPDATE reading_sessions SET reset_at = ? WHERE child_id = ? AND end_time IS NOT NULL AND date(datetime(start_time, '+8 hours')) <= ? AND date(datetime(COALESCE(end_time, CURRENT_TIMESTAMP), '+8 hours')) >= ?`,
      [resetAt, childId, today, today]
    );
    execute(
      'UPDATE daily_stats SET total_minutes = 0, pages_read = 0, books_read = 0, sessions_count = 0 WHERE child_id = ? AND stat_date = ?',
      [childId, today]
    );
    execute(
      'UPDATE children SET daily_reading_reset_at = ? WHERE id = ?',
      [resetAt, childId]
    );
  }

  /**
   * 更新每日统计
   */
  updateDailyStats(
    childId: number,
    sessionStartTime: unknown,
    sessionEndTime: unknown,
    durationMinutes: number,
    pagesRead: number,
    bookId: number
  ): void {
    const startTime = parseStoredUtcDateTime(sessionStartTime);
    const endTime = parseStoredUtcDateTime(sessionEndTime);

    if (!startTime || !endTime) {
      return;
    }

    // 如果该会话在重置之前已结束，则不计入统计
    const childRow = queryOne('SELECT daily_reading_reset_at FROM children WHERE id = ?', [childId]);
    if (childRow?.daily_reading_reset_at) {
      const resetAt = parseStoredUtcDateTime(childRow.daily_reading_reset_at);
      if (resetAt && endTime <= resetAt) {
        return;
      }
    }

    const endDate = getBeijingDateString(endTime);
    const safeDurationMinutes = Math.floor(
      clampRecordedDurationSeconds(startTime, endTime, durationMinutes * 60) / 60
    );
    const allocations = distributeRecordedMinutesByBeijingDay(startTime, endTime, safeDurationMinutes);

    allocations.forEach(({ date, minutes }) => {
      const existing = queryOne(
        'SELECT id, total_minutes, pages_read FROM daily_stats WHERE child_id = ? AND stat_date = ?',
        [childId, date]
      );
      const booksRead = this.getBooksReadCountForDate(childId, date);
      const pageIncrement = date === endDate ? pagesRead : 0;

      if (existing) {
        execute(
          `UPDATE daily_stats SET
            total_minutes = ?,
            pages_read = ?,
            books_read = ?,
            sessions_count = sessions_count + 1
          WHERE child_id = ? AND stat_date = ?`,
          [
            (existing.total_minutes as number) + minutes,
            (existing.pages_read as number) + pageIncrement,
            booksRead,
            childId,
            date
          ]
        );
      } else {
        execute(
          `INSERT INTO daily_stats (child_id, stat_date, total_minutes, pages_read, books_read, sessions_count)
          VALUES (?, ?, ?, ?, ?, 1)`,
          [childId, date, minutes, pageIncrement, booksRead]
        );
      }
    });
  }

  private getCurrentSessionTodayDurationSeconds(
    sessionStartTime: unknown,
    recordedDurationSeconds: number,
    now: Date = new Date()
  ): number {
    const startTime = parseStoredUtcDateTime(sessionStartTime);
    if (!startTime) {
      return Math.max(0, recordedDurationSeconds);
    }

    const todayRange = getBeijingDayUtcRange(now);
    const effectiveEndTime = this.getSessionEffectiveEndTime(
      startTime,
      now,
      recordedDurationSeconds
    );
    return getOverlapSeconds(startTime, effectiveEndTime, todayRange.start, todayRange.end);
  }

  private getBooksReadCountForDate(childId: number, statDate: string): number {
    const sessions = query(
      `SELECT DISTINCT book_id FROM reading_sessions
       WHERE child_id = ?
         AND date(datetime(start_time, '+8 hours')) <= ?
         AND date(datetime(COALESCE(end_time, start_time), '+8 hours')) >= ?`,
      [childId, statDate, statDate]
    );

    return sessions.length;
  }
}

// 导出单例
export const antiAddictionService = new AntiAddictionService();
