import { fetchJson } from '../utils/fetch';
import { fetchPrices } from '../utils/price';
import { cacheGet, cacheSet } from '../utils/cache';
import { getChain } from '../core/registry';
import type { FactSheet } from '../core/types';
import type { AdapterContext, ChainAdapter } from './adapter';

/**
 * Mempool.space adapter for Bitcoin. Keyless, generous rate limits, returns
 * per-transaction fees directly so we don't need to batch-fetch tx details
 * separately. Used as the primary BTC path; Blockchair is the fallback.
 */

interface AddressStats {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    tx_count: number;
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
}

interface MempoolTx {
  txid: string;
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
  size: number;
  weight: number;
  fee: number;
  status: { confirmed: boolean; block_time?: number };
}

interface MempoolUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_time?: number };
}

const API = 'https://mempool.space/api';
const SATS = 100_000_000;
const DUST_SATS = 1000;
const DAY_MS = 86_400_000;

export function createBtcMempoolAdapter(): ChainAdapter {
  return {
    id: 'btc:mempool',
    keyless: true,
    async fetchFacts(address: string, ctx: AdapterContext): Promise<FactSheet> {
      const chain = getChain('btc');
      const { signal, onProgress } = ctx;
      const cacheKey = `btc-mempool:${address}`;

      type CachedBundle = {
        stats: AddressStats;
        txs: MempoolTx[];
        utxos: MempoolUtxo[];
      };
      let bundle: CachedBundle;
      let dataFetchedAt: number;
      const cached = cacheGet<CachedBundle>(cacheKey);
      if (cached) {
        bundle = cached.data;
        dataFetchedAt = cached.fetchedAt;
      } else {
        onProgress?.({ stage: 'fetching address', detail: 'bitcoin · mempool.space' });
        const stats = await fetchJson<AddressStats>(`${API}/address/${address}`, {
          ...(signal ? { signal } : {}),
          retries: 2,
        });

        onProgress?.({ stage: 'fetching transactions' });
        const txs = await fetchAllTxs(address, signal);

        onProgress?.({ stage: 'fetching utxos' });
        const utxos = await fetchJson<MempoolUtxo[]>(`${API}/address/${address}/utxo`, {
          ...(signal ? { signal } : {}),
          retries: 1,
        }).catch(() => [] as MempoolUtxo[]);

        bundle = { stats, txs, utxos };
        dataFetchedAt = Date.now();
        cacheSet(cacheKey, bundle);
      }

      const { stats, txs, utxos } = bundle;
      const balanceSat =
        stats.chain_stats.funded_txo_sum - stats.chain_stats.spent_txo_sum +
        stats.mempool_stats.funded_txo_sum - stats.mempool_stats.spent_txo_sum;

      const totalTx = stats.chain_stats.tx_count + stats.mempool_stats.tx_count;
      const sampledFee = txs.reduce((s, t) => s + (t.fee ?? 0), 0);
      const feesExtrapolated = txs.length > 0 && totalTx > txs.length;
      const estTotalFee = feesExtrapolated
        ? Math.round((sampledFee / txs.length) * totalTx)
        : sampledFee;

      let largestOutputSat = 0;
      let txWithMostOutputs: { hash: string; outputCount: number } | undefined;
      let maxOutputs = 0;
      const counterparties = new Set<string>();
      let firstTxAt: number | undefined;
      let lastTxAt: number | undefined;

      for (const t of txs) {
        for (const o of t.vout) {
          if (o.value > largestOutputSat) largestOutputSat = o.value;
          if (o.scriptpubkey_address && o.scriptpubkey_address !== address) {
            counterparties.add(o.scriptpubkey_address);
          }
        }
        if (t.vout.length > maxOutputs) {
          maxOutputs = t.vout.length;
          txWithMostOutputs = { hash: t.txid, outputCount: t.vout.length };
        }
        const ts = (t.status?.block_time ?? 0) * 1000;
        if (ts > 0) {
          if (firstTxAt === undefined || ts < firstTxAt) firstTxAt = ts;
          if (lastTxAt === undefined || ts > lastTxAt) lastTxAt = ts;
        }
      }

      const now = Date.now();
      const utxoTimes: number[] = [];
      let dustUtxoCount = 0;
      for (const u of utxos) {
        if (u.value < DUST_SATS) dustUtxoCount++;
        if (u.status?.block_time) utxoTimes.push(u.status.block_time * 1000);
      }
      const oldestUtxoAgeDays =
        utxoTimes.length > 0
          ? Math.floor((now - Math.min(...utxoTimes)) / DAY_MS)
          : 0;

      const prices = await fetchPrices([chain.coingeckoId], signal);
      const btcPrice = prices[chain.coingeckoId] ?? 0;

      const facts: FactSheet = {
        chain: 'btc',
        address,
        generatedAt: dataFetchedAt,
        feesSampled: feesExtrapolated,
        txCount: totalTx,
        ...(firstTxAt !== undefined ? { firstTxAt } : {}),
        ...(lastTxAt !== undefined ? { lastTxAt } : {}),
        totalFeesNative: estTotalFee / SATS,
        currentBalanceNative: balanceSat / SATS,
        totalReceivedNative: stats.chain_stats.funded_txo_sum / SATS,
        totalSentNative: stats.chain_stats.spent_txo_sum / SATS,
        nativePriceUsd: btcPrice,
        utxo: {
          utxoCount: utxos.length,
          oldestUtxoAgeDays,
          dustUtxoCount,
          largestSingleOutputNative: largestOutputSat / SATS,
          uniqueCounterparties: counterparties.size,
          ...(txWithMostOutputs ? { txWithMostOutputs } : {}),
        },
      };

      onProgress?.({ stage: 'done' });
      return facts;
    },
  };
}

/**
 * Page through mempool.space's /txs endpoint. It returns 25 confirmed txs
 * per call plus mempool txs on the first page. We cap at 100 for cost.
 */
async function fetchAllTxs(address: string, signal: AbortSignal | undefined): Promise<MempoolTx[]> {
  const all: MempoolTx[] = [];
  const first = await fetchJson<MempoolTx[]>(`${API}/address/${address}/txs`, {
    ...(signal ? { signal } : {}),
    retries: 2,
  });
  all.push(...first);

  // Paginate chain-confirmed only, up to 3 extra pages (≈ 75 more txs).
  let last = all[all.length - 1]?.txid;
  for (let p = 0; p < 3 && last && all.length < 100; p++) {
    try {
      const more = await fetchJson<MempoolTx[]>(
        `${API}/address/${address}/txs/chain/${last}`,
        { ...(signal ? { signal } : {}), retries: 1 },
      );
      if (!more.length) break;
      all.push(...more);
      last = more[more.length - 1]?.txid;
    } catch {
      break;
    }
  }
  return all;
}

/**
 * Compose two adapters: try `primary` first, fall back to `secondary` on any
 * non-abort error. Used to keep BTC working even if the primary provider is
 * having a bad day.
 */
export function withFallback(primary: ChainAdapter, secondary: ChainAdapter): ChainAdapter {
  return {
    id: `${primary.id}->${secondary.id}`,
    keyless: primary.keyless && secondary.keyless,
    async fetchFacts(address, ctx) {
      try {
        return await primary.fetchFacts(address, ctx);
      } catch (err) {
        if (ctx.signal?.aborted) throw err;
        ctx.onProgress?.({ stage: 'primary provider failed, trying fallback' });
        return secondary.fetchFacts(address, ctx);
      }
    },
  };
}
