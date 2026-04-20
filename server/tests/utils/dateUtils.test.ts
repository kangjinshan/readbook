import { isStoredUtcDateTimeRecent, parseStoredUtcDateTime } from '../../src/utils/dateUtils';

describe('dateUtils stored UTC parsing', () => {
  it('treats SQLite CURRENT_TIMESTAMP strings as UTC', () => {
    expect(parseStoredUtcDateTime('2026-04-18 10:00:00')?.toISOString()).toBe('2026-04-18T10:00:00.000Z');
  });

  it('detects recency from stored UTC timestamps', () => {
    const now = new Date('2026-04-18T10:01:30.000Z');

    expect(isStoredUtcDateTimeRecent('2026-04-18 10:00:00', 2 * 60 * 1000, now)).toBe(true);
    expect(isStoredUtcDateTimeRecent('2026-04-18 09:58:59', 2 * 60 * 1000, now)).toBe(false);
  });
});
