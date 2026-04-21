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
  canStartReading(childId: number): { allowed: boolean; reason?: string; message?: string } {
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
        message: `今日阅读时长已达${policy.dailyLimitMinutes}分钟上限`
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
    const todayMinutes = this.getTodayReadingMinutes(childId, currentSessionId);
    const currentSessionTodayMinutes = Math.floor(
      this.getCurrentSessionTodayDurationSeconds(sessionStartTime, currentSessionDuration) / 60
    );

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
        remainingContinuousMinutes: Math.max(0, policy.continuousLimitMinutes - currentSessionTodayMinutes),
        remainingDailyMinutes: 0
      };
    }

    // 检查连续阅读时长
    const continuousMinutes = currentSessionTodayMinutes;
    if (continuousMinutes >= policy.continuousLimitMinutes) {
      return {
        shouldLock: true,
        reason: 'continuous_limit_exceeded',
        message: `连续阅读已达${policy.continuousLimitMinutes}分钟，请休息${policy.restMinutes}分钟`,
        lockDurationMinutes: policy.restMinutes,
        remainingContinuousMinutes: 0,
        remainingDailyMinutes: Math.max(0, policy.dailyLimitMinutes - totalWithSession)
      };
    }

    return {
      shouldLock: false,
      remainingContinuousMinutes: policy.continuousLimitMinutes - continuousMinutes,
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
    execute(
      'UPDATE daily_stats SET total_minutes = 0 WHERE child_id = ? AND stat_date = ?',
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
