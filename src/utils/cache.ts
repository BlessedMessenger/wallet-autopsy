/**
 * Tiny localStorage-backed cache. We do NOT want to hammer free public APIs
 * every time someone re-runs on the same address, and users who share links
 * with #address=... will also hit it repeatedly.
 */

const PREFIX = 'cw:';
const DEFAULT_TTL_MS = 15 * 60 * 1000;

interface Envelope<T> {
  v: 1;
  e: number;
  d: T;
}

export interface CachedValue<T> {
  data: T;
  fetchedAt: number;
}

export function cacheGet<T>(key: string, maxAgeMs = DEFAULT_TTL_MS): CachedValue<T> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.v !== 1) return null;
    if (Date.now() - env.e > maxAgeMs) return null;
    return { data: env.d, fetchedAt: env.e };
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const env: Envelope<T> = { v: 1, e: Date.now(), d: data };
    localStorage.setItem(PREFIX + key, JSON.stringify(env));
  } catch {
    // quota exceeded / private mode — ignore silently
  }
}

export function cacheClear(prefix?: string): void {
  if (typeof localStorage === 'undefined') return;
  const full = PREFIX + (prefix ?? '');
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(full)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

/**
 * Settings keys we expose separately (not cache entries, different lifecycle).
 */
export const Settings = {
  get(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(PREFIX + 'cfg:' + key);
  },
  set(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(PREFIX + 'cfg:' + key, value);
    } catch {
      // ignore
    }
  },
  delete(key: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(PREFIX + 'cfg:' + key);
  },
};
