import { query, queryOne, execute } from '../../src/database';
import { AntiAddictionService } from '../../src/services/antiAddiction';
import { StatsEngine } from '../../src/services/statsEngine';

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
}));

describe('cross-midnight reading handling', () => {
  const antiAddictionService = new AntiAddictionService();
  const statsEngine = new StatsEngine();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-04-20T00:30:00.000+08:00'));
    (queryOne as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM control_policies')) {
        return {
          child_id: 1,
          daily_limit_minutes: 480,
          continuous_limit_minutes: 120,
          rest_minutes: 15,
          forbidden_start_time: null,
          forbidden_end_time: null,
          allowed_font_sizes: '["small","medium","large"]',
          allowed_themes: '["yellow","white","dark"]',
        };
      }
      return null;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts only post-midnight minutes for daily limit checks', () => {
    (query as jest.Mock).mockImplementation((_sql: string, params: unknown[]) => {
      if (params.includes('session-1')) {
        return [];
      }
      return [
        {
          id: 'session-1',
          start_time: '2026-04-19 15:30:00',
          end_time: null,
          duration_seconds: 3600,
        },
      ];
    });

    const result = antiAddictionService.checkReadingStatus(
      1,
      '2026-04-19 15:30:00',
      3600,
      'session-1'
    );

    expect(result.shouldLock).toBe(false);
    expect(result.remainingDailyMinutes).toBe(450);
    expect(result.remainingContinuousMinutes).toBe(60);
  });

  it('splits end-session daily stats across Beijing dates', () => {
    (queryOne as jest.Mock)
      .mockReturnValueOnce({ id: 1, total_minutes: 120, pages_read: 20 })
      .mockReturnValueOnce({ id: 2, total_minutes: 10, pages_read: 2 });
    (query as jest.Mock)
      .mockReturnValueOnce([{ book_id: 12 }])
      .mockReturnValueOnce([{ book_id: 12 }]);

    antiAddictionService.updateDailyStats(
      1,
      '2026-04-19 15:30:00',
      '2026-04-19T16:30:00.000Z',
      60,
      30,
      12
    );

    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE daily_stats SET'),
      [150, 20, 1, 1, '2026-04-19']
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE daily_stats SET'),
      [40, 32, 1, 1, '2026-04-20']
    );
  });

  it('adds only todays slice from an active cross-midnight session to realtime stats', () => {
    (queryOne as jest.Mock)
      .mockReturnValueOnce({
        title: 'Book A',
        device_name: '客厅电视',
        last_online_at: '2026-04-19 16:29:30',
        start_time: '2026-04-19 15:30:00',
        start_page: 70,
        end_page: 88,
        progress_current_page: 89,
      })
      .mockReturnValueOnce({
        total_minutes: 120,
      })
      .mockReturnValueOnce({
        start_time: '2026-04-19 15:30:00',
        duration_seconds: 3600,
        last_online_at: '2026-04-19 16:29:30',
      });

    const result = statsEngine.getRealtimeStatus(1);

    expect(result.todayReadMinutes).toBe(150);
  });

  it('clamps impossible overlong same-day sessions before counting todays minutes', () => {
    (query as jest.Mock).mockReturnValue([
      {
        id: 'session-188',
        start_time: '2026-04-19 16:02:25',
        end_time: '2026-04-19 16:02:26',
        duration_seconds: 28801,
      },
    ]);

    expect(antiAddictionService.getTodayReadingMinutes(1)).toBe(0);
  });
});
