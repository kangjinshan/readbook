type AttemptEntry = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number;
};

const attempts = new Map<string, AttemptEntry>();

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
    entry.blockedUntil = now() + blockMs;
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
  const entry = attempts.get(key) ?? { count: 0, firstAttemptAt: 0, blockedUntil: 0 };

  clearExpired(entry, windowMs);

  if (entry.count === 0) {
    entry.firstAttemptAt = now();
  }

  entry.count += 1;

  if (entry.count >= maxAttempts) {
    entry.blockedUntil = now() + blockMs;
  }

  attempts.set(key, entry);
}

export function clearLoginFailures(ip: string, username: string): void {
  attempts.delete(getClientKey(ip, username));
}
