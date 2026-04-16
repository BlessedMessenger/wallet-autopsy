import { fetchJson } from './fetch';
import { cacheGet, cacheSet } from './cache';

interface LlamaCoinsResponse {
  coins: Record<string, { price: number; confidence?: number }>;
}

const PRICE_TTL_MS = 10 * 60 * 1000;

/**
 * Fetch current USD prices for a set of CoinGecko IDs via DefiLlama's coins
 * API. CORS-open, keyless, sane rate limits. We cache per-id for 10 minutes so
 * multiple chain lookups in a row don't thrash the endpoint.
 */
export async function fetchPrices(
  coingeckoIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  const unique = Array.from(new Set(coingeckoIds.filter(Boolean)));
  if (unique.length === 0) return {};

  const result: Record<string, number> = {};
  const missing: string[] = [];

  for (const id of unique) {
    const cached = cacheGet<number>(`price:${id}`, PRICE_TTL_MS);
    if (cached !== null) result[id] = cached.data;
    else missing.push(id);
  }

  if (missing.length === 0) return result;

  const query = missing.map((id) => `coingecko:${id}`).join(',');
  const url = `https://coins.llama.fi/prices/current/${query}`;

  try {
    const body = await fetchJson<LlamaCoinsResponse>(url, {
      timeoutMs: 10_000,
      retries: 1,
      ...(signal ? { signal } : {}),
    });
    for (const [k, v] of Object.entries(body.coins ?? {})) {
      const id = k.replace(/^coingecko:/, '');
      if (typeof v?.price === 'number' && Number.isFinite(v.price) && v.price > 0) {
        result[id] = v.price;
        cacheSet(`price:${id}`, v.price);
      }
    }
  } catch {
    // Best-effort — missing prices become 0 and the copy engine handles it.
  }

  for (const id of missing) if (result[id] === undefined) result[id] = 0;
  return result;
}
