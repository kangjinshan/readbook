import { execute } from '../../src/database';
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
});
