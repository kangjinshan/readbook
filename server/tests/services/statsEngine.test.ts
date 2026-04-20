import { query, queryOne } from '../../src/database';
import { StatsEngine } from '../../src/services/statsEngine';

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
}));

describe('StatsEngine', () => {
  const engine = new StatsEngine();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-04-18T10:05:30.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats history records in Beijing time and avoids negative pages', () => {
    (queryOne as jest.Mock).mockReturnValue({ count: 2 });
    (query as jest.Mock).mockReturnValue([
      {
        start_time: '2026-04-17 18:30:00',
        end_time: '2026-04-17 19:15:00',
        duration_seconds: 2700,
        start_page: 10,
        end_page: 15,
        book_title: 'Book A',
      },
      {
        start_time: '2026-04-17 20:00:00',
        end_time: null,
        duration_seconds: 600,
        start_page: 12,
        end_page: null,
        book_title: 'Book B',
      },
    ]);

    const result = engine.getHistory(1, '2026-04-18', '2026-04-18', 1, 10);

    expect((queryOne as jest.Mock).mock.calls[0][0]).toContain("date(datetime(start_time, '+8 hours'))");
    expect((query as jest.Mock).mock.calls[0][0]).toContain("date(datetime(rs.start_time, '+8 hours'))");
    expect(result).toEqual({
      total: 2,
      records: [
        {
          date: '2026-04-18',
          bookTitle: 'Book A',
          durationMinutes: 45,
          pages: 5,
          startTime: '02:30',
          endTime: '03:15',
        },
        {
          date: '2026-04-18',
          bookTitle: 'Book B',
          durationMinutes: 10,
          pages: 0,
          startTime: '04:00',
          endTime: null,
        },
      ],
    });
  });

  it('uses the live session page and live today minutes when the device is online', () => {
    (queryOne as jest.Mock)
      .mockReturnValueOnce({
        title: 'Book A',
        device_name: '客厅电视',
        last_online_at: '2026-04-18 10:04:30',
        start_time: '2026-04-18 10:00:00',
        start_page: 70,
        end_page: 88,
        progress_current_page: 89,
      })
      .mockReturnValueOnce({
        total_minutes: 12,
      })
      .mockReturnValueOnce({
        start_time: '2026-04-18 10:00:00',
        duration_seconds: 120,
        last_online_at: '2026-04-18 10:04:30',
      });

    const result = engine.getRealtimeStatus(1);

    expect(result).toEqual({
      isReading: true,
      bookTitle: 'Book A',
      currentPage: 89,
      todayReadMinutes: 14,
      deviceName: '客厅电视',
    });
  });

  it('ignores stale open sessions and falls back to the latest saved progress', () => {
    (queryOne as jest.Mock)
      .mockReturnValueOnce({
        title: 'Stale Book',
        device_name: '客厅电视',
        last_online_at: '2026-04-18 09:00:00',
        start_time: '2026-04-18 09:00:00',
        start_page: 10,
        end_page: 20,
        progress_current_page: 20,
      })
      .mockReturnValueOnce({
        total_minutes: 8,
      })
      .mockReturnValueOnce({
        start_time: '2026-04-18 09:00:00',
        duration_seconds: 900,
        last_online_at: '2026-04-18 09:00:00',
      })
      .mockReturnValueOnce({
        current_page: 42,
        title: 'Newest Book',
        device_name: '卧室电视',
      });

    const result = engine.getRealtimeStatus(1);

    expect(result).toEqual({
      isReading: false,
      bookTitle: 'Newest Book',
      currentPage: 42,
      todayReadMinutes: 8,
      deviceName: '卧室电视',
    });
  });
});
