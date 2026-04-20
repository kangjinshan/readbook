/**
 * 日期工具函数 - 统一使用北京时间 (Asia/Shanghai)
 */

const BEIJING_TIME_ZONE = 'Asia/Shanghai';

function parseBeijingDateParts(dateString: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) {
    throw new Error(`Invalid Beijing date string: ${dateString}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/**
 * 获取北京时间的日期字符串 (YYYY-MM-DD)
 */
export function getBeijingDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * 获取北京时间的日期时间字符串 (YYYY-MM-DD HH:mm)
 */
export function getBeijingDateTimeString(date: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
  };
}

export function getBeijingDayUtcRange(date: Date = new Date()): { date: string; start: Date; end: Date } {
  const beijingDate = getBeijingDateString(date);
  const { year, month, day } = parseBeijingDateParts(beijingDate);
  const start = new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    date: beijingDate,
    start,
    end,
  };
}

export function getBeijingDayUtcRangeByDateString(dateString: string): { date: string; start: Date; end: Date } {
  const { year, month, day } = parseBeijingDateParts(dateString);
  const start = new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    date: dateString,
    start,
    end,
  };
}

export function getOverlapSeconds(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): number {
  const overlapStart = Math.max(start.getTime(), rangeStart.getTime());
  const overlapEnd = Math.min(end.getTime(), rangeEnd.getTime());
  if (overlapEnd <= overlapStart) {
    return 0;
  }
  return Math.floor((overlapEnd - overlapStart) / 1000);
}

export function clampRecordedDurationSeconds(
  sessionStart: Date,
  sessionEnd: Date,
  recordedDurationSeconds: number,
  graceSeconds = 5
): number {
  const wallSeconds = Math.max(0, Math.floor((sessionEnd.getTime() - sessionStart.getTime()) / 1000));
  const safeRecordedSeconds = Math.max(0, Math.floor(recordedDurationSeconds));
  return Math.min(safeRecordedSeconds, wallSeconds + graceSeconds);
}

export function distributeRecordedMinutesByBeijingDay(
  sessionStart: Date,
  sessionEnd: Date,
  recordedMinutes: number
): Array<{ date: string; minutes: number }> {
  if (recordedMinutes <= 0 || sessionEnd.getTime() <= sessionStart.getTime()) {
    return [];
  }

  const segments: Array<{ date: string; overlapSeconds: number }> = [];
  let cursor = sessionStart;

  while (cursor.getTime() < sessionEnd.getTime()) {
    const dayRange = getBeijingDayUtcRange(cursor);
    const overlapSeconds = getOverlapSeconds(sessionStart, sessionEnd, dayRange.start, dayRange.end);
    if (overlapSeconds > 0) {
      segments.push({
        date: dayRange.date,
        overlapSeconds,
      });
    }
    cursor = dayRange.end;
  }

  const totalOverlapSeconds = segments.reduce((sum, segment) => sum + segment.overlapSeconds, 0);
  if (totalOverlapSeconds <= 0) {
    return [];
  }

  const baseAllocations = segments.map((segment, index) => {
    const rawMinutes = recordedMinutes * (segment.overlapSeconds / totalOverlapSeconds);
    const minutes = Math.floor(rawMinutes);
    return {
      index,
      date: segment.date,
      minutes,
      remainder: rawMinutes - minutes,
    };
  });

  let remainingMinutes = recordedMinutes - baseAllocations.reduce((sum, segment) => sum + segment.minutes, 0);
  baseAllocations
    .slice()
    .sort((a, b) => {
      if (b.remainder !== a.remainder) {
        return b.remainder - a.remainder;
      }
      return a.index - b.index;
    })
    .forEach((segment) => {
      if (remainingMinutes <= 0) {
        return;
      }
      baseAllocations[segment.index].minutes += 1;
      remainingMinutes -= 1;
    });

  return baseAllocations
    .filter(segment => segment.minutes > 0)
    .map(segment => ({
      date: segment.date,
      minutes: segment.minutes,
    }));
}

/**
 * 解析 SQLite `CURRENT_TIMESTAMP` 这类 UTC 时间字符串。
 * SQLite 默认产出 `YYYY-MM-DD HH:mm:ss`，需要按 UTC 解释，不能交给运行环境按本地时区猜测。
 */
export function parseStoredUtcDateTime(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const normalized = value.includes('T')
    ? value
    : value.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const parsed = new Date(withZone);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 判断一个存储的 UTC 时间是否仍在最近窗口内。
 */
export function isStoredUtcDateTimeRecent(
  value: unknown,
  windowMs: number,
  now: Date = new Date()
): boolean {
  const parsed = parseStoredUtcDateTime(value);
  if (!parsed) {
    return false;
  }

  const deltaMs = now.getTime() - parsed.getTime();
  return deltaMs >= 0 && deltaMs <= windowMs;
}

/**
 * 面向 API 输出存储的 UTC 时间，返回带时区的 ISO 字符串，避免前端按本地时区误解 SQLite 原始值。
 */
export function formatStoredUtcDateTimeForApi(value: unknown): string | null {
  const parsed = parseStoredUtcDateTime(value);
  if (!parsed) {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  return parsed.toISOString();
}

/**
 * 获取北京时间的当前小时和分钟
 */
export function getBeijingCurrentMinutes(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BEIJING_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Number(map.hour) * 60 + Number(map.minute);
}
