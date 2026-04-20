import { query, queryOne, execute } from '../database';
import {
  clampRecordedDurationSeconds,
  getBeijingDayUtcRange,
  getBeijingDateString,
  getBeijingDateTimeString,
  getOverlapSeconds,
  isStoredUtcDateTimeRecent,
  parseStoredUtcDateTime
} from '../utils/dateUtils';

const DEVICE_ONLINE_WINDOW_MS = 2 * 60 * 1000;

/**
 * 统计引擎
 */
export class StatsEngine {

  private escapeCsvCell(value: unknown): string {
    const raw = String(value ?? '');
    const escaped = raw.replace(/"/g, '""');
    const sanitized = /^[=+\-@]/.test(escaped) ? `'${escaped}` : escaped;
    return `"${sanitized}"`;
  }

  private sessionDateExpression(column: string): string {
    return `date(datetime(${column}, '+8 hours'))`;
  }

  private formatRecordDate(value: unknown): string {
    const parsed = parseStoredUtcDateTime(value);
    if (parsed) {
      return getBeijingDateTimeString(parsed).date;
    }

    if (typeof value === 'string') {
      return value.split(/[ T]/)[0] || '';
    }

    return '';
  }

  private formatRecordTime(value: unknown): string | null {
    const parsed = parseStoredUtcDateTime(value);
    if (parsed) {
      return getBeijingDateTimeString(parsed).time;
    }

    if (typeof value === 'string') {
      const match = value.match(/\b\d{2}:\d{2}\b/);
      return match ? match[0] : null;
    }

    return null;
  }

  private getActiveSessionDurationSeconds(session: Record<string, unknown>): number {
    const startedAt = parseStoredUtcDateTime(session.start_time);

    if (!startedAt) {
      return Number(session.duration_seconds || 0);
    }

    return clampRecordedDurationSeconds(
      startedAt,
      new Date(),
      Number(session.duration_seconds || 0)
    );
  }

  getLiveTodayReadingMinutes(childId: number): number {
    const persistedMinutes = this.getTodayReadingMinutes(childId);
    const activeSession = queryOne(
      `SELECT start_time, duration_seconds, d.last_online_at
       FROM reading_sessions rs
       JOIN devices d ON rs.device_id = d.id
       WHERE rs.child_id = ? AND rs.end_time IS NULL
       ORDER BY rs.start_time DESC
       LIMIT 1`,
      [childId]
    );

    if (!activeSession) {
      return persistedMinutes;
    }

    if (!isStoredUtcDateTimeRecent(activeSession.last_online_at, DEVICE_ONLINE_WINDOW_MS)) {
      return persistedMinutes;
    }

    const startedAt = parseStoredUtcDateTime(activeSession.start_time);
    if (!startedAt) {
      return persistedMinutes;
    }

    const now = new Date();
    const todayRange = getBeijingDayUtcRange(now);
    const overlapSeconds = getOverlapSeconds(startedAt, now, todayRange.start, todayRange.end);
    const activeTodaySeconds = Math.min(this.getActiveSessionDurationSeconds(activeSession), overlapSeconds);

    return persistedMinutes + Math.floor(activeTodaySeconds / 60);
  }

  /**
   * 获取实时阅读状态
   */
  getRealtimeStatus(childId: number): {
    isReading: boolean;
    bookTitle?: string;
    currentPage?: number;
    todayReadMinutes: number;
    deviceName?: string;
  } {
    // 查找当前活跃的会话
    const activeSession = queryOne(
      `SELECT rs.*, b.title, d.device_name, d.last_online_at,
              rp.current_page AS progress_current_page,
              rp.last_read_at AS progress_last_read_at
       FROM reading_sessions rs
       JOIN books b ON rs.book_id = b.id
       JOIN devices d ON rs.device_id = d.id
       LEFT JOIN reading_progress rp ON rp.child_id = rs.child_id AND rp.book_id = rs.book_id
       WHERE rs.child_id = ? AND rs.end_time IS NULL
       ORDER BY COALESCE(rp.last_read_at, rs.start_time) DESC, rs.start_time DESC
       LIMIT 1`,
      [childId]
    );

    const todayMinutes = this.getLiveTodayReadingMinutes(childId);

    if (activeSession && isStoredUtcDateTimeRecent(activeSession.last_online_at, DEVICE_ONLINE_WINDOW_MS)) {
      return {
        isReading: true,
        bookTitle: activeSession.title as string,
        currentPage: Number(
          activeSession.progress_current_page
          ?? activeSession.end_page
          ?? activeSession.start_page
        ),
        todayReadMinutes: todayMinutes,
        deviceName: activeSession.device_name as string
      };
    }

    // 获取最近阅读的书籍
    const lastProgress = queryOne(
      `SELECT rp.current_page, b.title, rp.last_read_at,
              (
                SELECT d.device_name
                FROM devices d
                WHERE d.child_id = rp.child_id
                ORDER BY d.last_online_at DESC
                LIMIT 1
              ) AS device_name
       FROM reading_progress rp
       JOIN books b ON rp.book_id = b.id
       WHERE rp.child_id = ?
       ORDER BY rp.last_read_at DESC LIMIT 1`,
      [childId]
    );

    return {
      isReading: false,
      bookTitle: lastProgress?.title as string | undefined,
      currentPage: lastProgress?.current_page as number | undefined,
      todayReadMinutes: todayMinutes,
      deviceName: lastProgress?.device_name as string | undefined
    };
  }

  /**
   * 获取今日阅读分钟数
   */
  getTodayReadingMinutes(childId: number): number {
    const today = getBeijingDateString();
    const row = queryOne(
      'SELECT total_minutes FROM daily_stats WHERE child_id = ? AND stat_date = ?',
      [childId, today]
    );
    return row ? (row.total_minutes as number) : 0;
  }

  /**
   * 获取历史阅读记录
   */
  getHistory(childId: number, startDate: string, endDate: string, page: number, limit: number): {
    total: number;
    records: any[];
  } {
    const offset = (page - 1) * limit;

    // 获取总数
    const countRow = queryOne(
      `SELECT COUNT(*) as count FROM reading_sessions
       WHERE child_id = ? AND ${this.sessionDateExpression('start_time')} BETWEEN ? AND ?`,
      [childId, startDate, endDate]
    );
    const total = countRow?.count as number || 0;

    // 获取记录
    const records = query(
      `SELECT rs.*, b.title as book_title
       FROM reading_sessions rs
       JOIN books b ON rs.book_id = b.id
       WHERE rs.child_id = ? AND ${this.sessionDateExpression('rs.start_time')} BETWEEN ? AND ?
       ORDER BY rs.start_time DESC
       LIMIT ? OFFSET ?`,
      [childId, startDate, endDate, limit, offset]
    );

    return {
      total,
      records: records.map(r => ({
        date: this.formatRecordDate(r.start_time),
        bookTitle: r.book_title,
        durationMinutes: Math.floor((r.duration_seconds as number || 0) / 60),
        pages: Math.max(0, Number(r.end_page ?? r.start_page) - Number(r.start_page)),
        startTime: this.formatRecordTime(r.start_time) || '',
        endTime: this.formatRecordTime(r.end_time),
      }))
    };
  }

  /**
   * 获取每日统计
   */
  getDailyStats(childId: number, startDate: string, endDate: string): any[] {
    const rows = query(
      `SELECT stat_date, total_minutes, books_read, pages_read
       FROM daily_stats
       WHERE child_id = ? AND stat_date BETWEEN ? AND ?
       ORDER BY stat_date`,
      [childId, startDate, endDate]
    );

    return rows.map(r => ({
      date: r.stat_date,
      totalMinutes: r.total_minutes,
      booksRead: r.books_read,
      pagesRead: r.pages_read
    }));
  }

  /**
   * 获取阅读总结
   */
  getSummary(childId: number, period: 'day' | 'week' | 'month'): {
    period: string;
    totalMinutes: number;
    totalBooks: number;
    totalPages: number;
    averageDailyMinutes: number;
    mostReadBook: { id: number; title: string; minutes: number } | null;
    completionRate: number;
  } {
    const now = new Date();
    let startDate: string;

    switch (period) {
      case 'day':
        startDate = getBeijingDateString();
        break;
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate = getBeijingDateString(weekAgo);
        break;
      case 'month':
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate = getBeijingDateString(monthAgo);
        break;
    }

    const endDate = getBeijingDateString();

    // 总计数据
    const stats = queryOne(
      `SELECT
        SUM(total_minutes) as total_minutes,
        SUM(pages_read) as total_pages,
        COUNT(DISTINCT stat_date) as days
       FROM daily_stats
       WHERE child_id = ? AND stat_date BETWEEN ? AND ?`,
      [childId, startDate, endDate]
    );

    const totalMinutes = (stats?.total_minutes as number) || 0;
    const totalPages = (stats?.total_pages as number) || 0;
    const days = (stats?.days as number) || 1;

    // 阅读的书籍数
    const booksCount = queryOne(
      `SELECT COUNT(DISTINCT book_id) as count
       FROM reading_sessions
       WHERE child_id = ? AND ${this.sessionDateExpression('start_time')} BETWEEN ? AND ?`,
      [childId, startDate, endDate]
    );
    const totalBooks = (booksCount?.count as number) || 0;

    // 最常读的书
    const mostRead = queryOne(
      `SELECT b.id, b.title, SUM(rs.duration_seconds) as total_seconds
       FROM reading_sessions rs
       JOIN books b ON rs.book_id = b.id
       WHERE rs.child_id = ? AND ${this.sessionDateExpression('rs.start_time')} BETWEEN ? AND ?
       GROUP BY rs.book_id
       ORDER BY total_seconds DESC
       LIMIT 1`,
      [childId, startDate, endDate]
    );

    // 完成率（已完成书籍 / 授权书籍）
    const assignedCount = queryOne(
      'SELECT COUNT(*) as count FROM book_assignments WHERE child_id = ?',
      [childId]
    );
    const completedCount = queryOne(
      `SELECT COUNT(*) as count
       FROM reading_progress rp
       JOIN books b ON rp.book_id = b.id
       WHERE rp.child_id = ? AND rp.current_page >= b.total_pages`,
      [childId]
    );
    const completionRate = assignedCount && (assignedCount.count as number) > 0
      ? ((completedCount?.count as number) || 0) / (assignedCount.count as number)
      : 0;

    return {
      period,
      totalMinutes,
      totalBooks,
      totalPages,
      averageDailyMinutes: days > 0 ? Math.round(totalMinutes / days) : 0,
      mostReadBook: mostRead ? {
        id: mostRead.id as number,
        title: mostRead.title as string,
        minutes: Math.round((mostRead.total_seconds as number) / 60)
      } : null,
      completionRate: Math.round(completionRate * 100) / 100
    };
  }

  /**
   * 获取书籍阅读排行
   */
  getBookRanking(childId: number, limit: number = 10): any[] {
    const rows = query(
      `SELECT b.id, b.title, b.total_pages,
        SUM(rs.duration_seconds) as total_seconds,
        MAX(rp.current_page) as current_page
       FROM reading_sessions rs
       JOIN books b ON rs.book_id = b.id
       LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.child_id = rs.child_id
       WHERE rs.child_id = ?
       GROUP BY rs.book_id
       ORDER BY total_seconds DESC
       LIMIT ?`,
      [childId, limit]
    );

    return rows.map(r => ({
      bookId: r.id,
      title: r.title,
      minutes: Math.round((r.total_seconds as number) / 60),
      progress: Math.min(1, (r.current_page as number) / (r.total_pages as number))
    }));
  }

  /**
   * 导出数据为CSV
   */
  exportToCsv(childId: number, startDate: string, endDate: string): string {
    const records = this.getHistory(childId, startDate, endDate, 1, 10000);

    const headers = ['日期', '书籍', '时长(分钟)', '页数', '开始时间', '结束时间'];
    const rows = records.records.map(r => [
      r.date,
      r.bookTitle,
      r.durationMinutes,
      r.pages,
      r.startTime || '',
      r.endTime || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => this.escapeCsvCell(cell)).join(','))
      .join('\n');

    return csvContent;
  }
}

// 导出单例
export const statsEngine = new StatsEngine();
