import { execute, query, queryOne } from '../../src/database';
import { AntiAddictionService } from '../../src/services/antiAddiction';

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
}));

describe('AntiAddictionService', () => {
  const service = new AntiAddictionService();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-04-18T10:30:00.000Z'));
    (queryOne as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM control_policies')) {
        return {
          child_id: 7,
          daily_limit_minutes: 120,
          continuous_limit_minutes: 15,
          rest_minutes: 5,
          forbidden_start_time: null,
          forbidden_end_time: null,
          allowed_font_sizes: '["small","medium","large"]',
          allowed_themes: '["yellow","white","dark"]',
        };
      }
      return null;
    });
    (query as jest.Mock).mockReturnValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resetDailyReading zeroes today total_minutes and bumps reset marker', () => {
    service.resetDailyReading(7);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(
      1,
      'UPDATE daily_stats SET total_minutes = 0 WHERE child_id = ? AND stat_date = ?',
      [7, '2026-04-18']
    );
    expect(execute).toHaveBeenNthCalledWith(
      2,
      'UPDATE children SET daily_reading_reset_at = ? WHERE id = ?',
      ['2026-04-18T10:30:00.000Z', 7]
    );
  });

  it('locks when split sessions exceed the dynamic continuous plus rest window', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM reading_sessions')) {
        return [
          {
            id: 'previous-session',
            start_time: '2026-04-18 10:12:00',
            end_time: '2026-04-18 10:22:00',
            duration_seconds: 600,
          },
        ];
      }
      return [];
    });

    const result = service.checkReadingStatus(
      7,
      '2026-04-18 10:22:00',
      301,
      'current-session'
    );

    expect(result.shouldLock).toBe(true);
    expect(result.reason).toBe('continuous_limit_exceeded');
    expect(result.lockDurationMinutes).toBe(5);
  });

  it('does not lock after enough configured rest drops prior reading out of the window', () => {
    (query as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('FROM reading_sessions')) {
        return [
          {
            id: 'previous-session',
            start_time: '2026-04-18 10:00:00',
            end_time: '2026-04-18 10:10:00',
            duration_seconds: 600,
          },
        ];
      }
      return [];
    });

    const result = service.checkReadingStatus(
      7,
      '2026-04-18 10:20:00',
      300,
      'current-session'
    );

    expect(result.shouldLock).toBe(false);
    expect(result.remainingContinuousMinutes).toBe(10);
  });
});
