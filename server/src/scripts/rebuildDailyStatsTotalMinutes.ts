import { closeDatabase, execute, initDatabase, query } from '../database';
import {
  clampRecordedDurationSeconds,
  distributeRecordedMinutesByBeijingDay,
  parseStoredUtcDateTime
} from '../utils/dateUtils';

type DailyStatRow = {
  child_id: number;
  stat_date: string;
};

type SessionRow = {
  id: number;
  child_id: number;
  book_id: number;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
};

type ReadingProgressRow = {
  child_id: number;
  book_id: number;
};

async function main() {
  await initDatabase();

  const existingRows = query(
    'SELECT child_id, stat_date FROM daily_stats'
  ) as DailyStatRow[];

  const existingKeys = new Set(existingRows.map(row => `${row.child_id}:${row.stat_date}`));
  const totals = new Map<string, number>();

  existingRows.forEach((row) => {
    totals.set(`${row.child_id}:${row.stat_date}`, 0);
  });

  const sessions = query(
    `SELECT id, child_id, book_id, start_time, end_time, duration_seconds
     FROM reading_sessions
     WHERE duration_seconds IS NOT NULL
       AND duration_seconds > 0`
  ) as SessionRow[];

  const progressTotals = new Map<string, number>();

  sessions.forEach((session) => {
    const startTime = parseStoredUtcDateTime(session.start_time);
    const endTime = parseStoredUtcDateTime(session.end_time) ?? new Date();
    const safeDurationSeconds = startTime
      ? clampRecordedDurationSeconds(startTime, endTime, Number(session.duration_seconds || 0))
      : Math.max(0, Number(session.duration_seconds || 0));

    if (safeDurationSeconds !== Number(session.duration_seconds || 0)) {
      execute(
        'UPDATE reading_sessions SET duration_seconds = ? WHERE id = ?',
        [safeDurationSeconds, session.id]
      );
    }

    const progressKey = `${session.child_id}:${session.book_id}`;
    progressTotals.set(progressKey, (progressTotals.get(progressKey) || 0) + safeDurationSeconds);

    const durationMinutes = Math.floor(safeDurationSeconds / 60);
    if (!startTime || !session.end_time || durationMinutes <= 0) {
      return;
    }

    const allocations = distributeRecordedMinutesByBeijingDay(startTime, endTime, durationMinutes);
    allocations.forEach(({ date, minutes }) => {
      const key = `${session.child_id}:${date}`;
      if (!existingKeys.has(key)) {
        return;
      }
      totals.set(key, (totals.get(key) || 0) + minutes);
    });
  });

  execute('UPDATE daily_stats SET total_minutes = 0');
  execute('UPDATE reading_progress SET total_time_seconds = 0');

  totals.forEach((minutes, key) => {
    const [childIdRaw, statDate] = key.split(':');
    execute(
      'UPDATE daily_stats SET total_minutes = ? WHERE child_id = ? AND stat_date = ?',
      [minutes, Number(childIdRaw), statDate]
    );
  });

  const progressRows = query(
    'SELECT child_id, book_id FROM reading_progress'
  ) as ReadingProgressRow[];

  progressRows.forEach((row) => {
    const key = `${row.child_id}:${row.book_id}`;
    execute(
      'UPDATE reading_progress SET total_time_seconds = ? WHERE child_id = ? AND book_id = ?',
      [progressTotals.get(key) || 0, row.child_id, row.book_id]
    );
  });

  console.log(`Rebuilt total_minutes for ${totals.size} daily_stats rows and ${progressRows.length} reading_progress rows`);
  closeDatabase();
}

main().catch((error) => {
  console.error('Failed to rebuild daily_stats total_minutes', error);
  closeDatabase();
  process.exitCode = 1;
});
