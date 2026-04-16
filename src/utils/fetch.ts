import { WrapError } from '../core/types';

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const DEFAULTS: Required<Omit<FetchJsonOptions, 'headers' | 'signal'>> = {
  timeoutMs: 15_000,
  retries: 2,
  retryDelayMs: 700,
};

/**
 * Resilient JSON fetcher for flaky public explorers:
 *  - Aborts on timeout.
 *  - Retries idempotent GETs on 5xx / 429 / network error with backoff.
 *  - Surfaces WrapError with a stable code so the UI can show a clean line.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const ctrl = new AbortController();
    const onParentAbort = () => ctrl.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', onParentAbort, { once: true });

    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', ...options.headers },
        signal: ctrl.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        throw new WrapError(`http_${res.status}`, `upstream ${res.status}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new WrapError(
          `http_${res.status}`,
          `${res.status} ${res.statusText}: ${text.slice(0, 160)}`,
        );
      }

      const json = (await res.json()) as T;
      return json;
    } catch (err) {
      lastError = err;
      if (options.signal?.aborted) throw err;
      const retryable = isRetryable(err);
      if (!retryable || attempt === opts.retries) break;
      await sleep(opts.retryDelayMs * (attempt + 1));
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onParentAbort);
    }
  }

  if (lastError instanceof WrapError) throw lastError;
  throw new WrapError(
    'fetch_failed',
    lastError instanceof Error ? lastError.message : 'unknown fetch error',
  );
}

function isRetryable(err: unknown): boolean {
  if (err instanceof WrapError) {
    return (
      err.code === 'http_429' ||
      err.code.startsWith('http_5') ||
      err.code === 'fetch_failed'
    );
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * JSON-RPC helper. Some public RPCs still return 200 with an `error` body, so
 * we unwrap the result and map errors into WrapError.
 */
export async function rpc<T = unknown>(
  url: string,
  method: string,
  params: unknown[],
  options: FetchJsonOptions = {},
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: options.signal ?? null,
  });

  if (!res.ok) {
    throw new WrapError(`rpc_http_${res.status}`, `${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
  if (body.error) {
    throw new WrapError(`rpc_${body.error.code}`, body.error.message);
  }
  if (body.result === undefined) {
    throw new WrapError('rpc_empty', 'empty rpc result');
  }
  return body.result;
}
