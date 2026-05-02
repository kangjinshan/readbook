type AttemptEntry = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number;
};

const attempts = new Map<string, AttemptEntry>();

const MAX_ENTRIES = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastCleanup = Date.now();

function now(): number {
  return Date.now();
}

function getClientKey(ip: string, username: string): string {
  return `${ip}::${username.trim().toLowerCase()}`;
}

function clearExpired(entry: AttemptEntry, windowMs: number): void {
  if (entry.blockedUntil > 0 && entry.blockedUntil <= now()) {
    entry.blockedUntil = 0;
    entry.count = 0;
    entry.firstAttemptAt = 0;
    return;
  }

  if (entry.firstAttemptAt > 0 && now() - entry.firstAttemptAt > windowMs) {
    entry.count = 0;
    entry.firstAttemptAt = 0;
  }
}

function evictStaleEntries(): void {
  const cutoff = now() - 60 * 60 * 1000; // 1 hour
  for (const [key, entry] of attempts) {
    if (entry.blockedUntil <= cutoff && entry.firstAttemptAt <= cutoff) {
      attempts.delete(key);
    }
  }
}

function maybeCleanup(): void {
  if (now() - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now();
  evictStaleEntries();
  // Hard cap on map size
  if (attempts.size > MAX_ENTRIES) {
    const entries = [...attempts.entries()].sort((a, b) => a[1].firstAttemptAt - b[1].firstAttemptAt);
    attempts.clear();
    entries.slice(-MAX_ENTRIES).forEach(([k, v]) => attempts.set(k, v));
  }
}

export function isLoginBlocked(
  ip: string,
  username: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number
): boolean {
  const key = getClientKey(ip, username);
  const entry = attempts.get(key);
  if (!entry) {
    return false;
  }

  clearExpired(entry, windowMs);

  if (entry.blockedUntil > now()) {
    return true;
  }

  if (entry.count >= maxAttempts && entry.firstAttemptAt > 0 && now() - entry.firstAttemptAt <= windowMs) {
    return true;
  }

  return false;
}

export function recordLoginFailure(
  ip: string,
  username: string,
  maxAttempts: number,
  windowMs: number,
  blockMs: number
): void {
  const key = getClientKey(ip, username);
  let entry = attempts.get(key);

  if (!entry) {
    entry = { count: 0, firstAttemptAt: 0, blockedUntil: 0 };
    attempts.set(key, entry);
  }

  clearExpired(entry, windowMs);

  if (entry.count === 0) {
    entry.firstAttemptAt = now();
  }

  entry.count += 1;

  if (entry.count >= maxAttempts && entry.blockedUntil <= now()) {
    entry.blockedUntil = now() + blockMs;
  }

  maybeCleanup();
}

export function clearLoginFailures(ip: string, username: string): void {
  attempts.delete(getClientKey(ip, username));
}
