import { fetchJson } from '../utils/fetch';
import { fetchPrices } from '../utils/price';
import { cacheGet, cacheSet } from '../utils/cache';
import { getChain } from '../core/registry';
import { WrapError, type ChainId, type FactSheet } from '../core/types';
import type { AdapterContext, ChainAdapter } from './adapter';

/**
 * Shared adapter for BTC, BCH, LTC, DOGE. Blockchair exposes one API shape
 * across all four, so a single implementation covers them by swapping the
 * `slug` in the URL.
 */

interface DashAddress {
  type?: string;
  balance: number;
  received: number;
  spent: number;
  transaction_count: number;
  first_seen_receiving?: string;
  last_seen_receiving?: string;
  first_seen_spending?: string;
  last_seen_spending?: string;
}

interface DashUtxo {
  block_id: number;
  transaction_hash: string;
  index: number;
  value: number;
}

interface DashResponse {
  data:
    | Record<
        string,
        {
          address: DashAddress;
          transactions?: string[];
          utxo?: DashUtxo[];
        }
      >
    | null;
  context: {
    code: number;
    state?: number;
    error?: string;
    cache?: { since?: string };
  };
}

interface TxResponse {
  data: Record<
    string,
    {
      transaction: {
        hash: string;
        time: string;
        fee: number;
        input_count: number;
        output_count: number;
        input_total: number;
        output_total: number;
      };
      inputs: Array<{ recipient: string; value: number }>;
      outputs: Array<{ recipient: string; value: number }>;
    }
  >;
}

const CHAIN_SLUGS: Record<ChainId, string | null> = {
  btc: 'bitcoin',
  bch: 'bitcoin-cash',
  ltc: 'litecoin',
  doge: 'dogecoin',
  eth: null,
  arbitrum: null,
  optimism: null,
  base: null,
  polygon: null,
  bsc: null,
  avalanche: null,
  sol: null,
};

const DAY_MS = 86_400_000;
const DUST_SATS = 1000;
const MAX_TX_DETAILS = 100;
const BATCH_SIZE = 10;

export function createUtxoAdapter(chainId: ChainId): ChainAdapter {
  const slug = CHAIN_SLUGS[chainId];
  if (!slug) throw new Error(`no Blockchair slug for chain ${chainId}`);

  return {
    id: `utxo:${chainId}`,
    keyless: true,
    async fetchFacts(address: string, ctx: AdapterContext): Promise<FactSheet> {
      const chain = getChain(chainId);
      const { signal, onProgress } = ctx;

      onProgress?.({ stage: 'fetching dashboard', detail: chain.label });

      const cacheKey = `utxo:${slug}:${address}`;
      let dash: DashResponse;
      let dataFetchedAt: number;
      const cached = cacheGet<DashResponse>(cacheKey);
      if (cached) {
        dash = cached.data;
        dataFetchedAt = cached.fetchedAt;
      } else {
        dash = await fetchJson<DashResponse>(
          `https://api.blockchair.com/${slug}/dashboards/address/${encodeURIComponent(
            address,
          )}?limit=${MAX_TX_DETAILS},100`,
          { ...(signal ? { signal } : {}), retries: 2 },
        );
        dataFetchedAt = Date.now();
        if (dash.data) cacheSet(cacheKey, dash);
      }

      if (!dash.data) {
        const err = dash.context?.error ?? '';
        if (dash.context?.code === 430 || /blacklist|exceed/i.test(err)) {
          throw new WrapError(
            'rate_limited',
            'Blockchair is rate-limiting this IP. Try again in a minute, or try a different wallet address.',
          );
        }
        throw new WrapError(
          'no_address',
          err || `Blockchair returned no data for this address.`,
        );
      }

      const entry = Object.values(dash.data)[0];
      if (!entry?.address) {
        throw new WrapError('no_address', `No on-chain record for ${address} yet.`);
      }

      const a = entry.address;
      const divisor = 10 ** chain.decimals;
      const txHashes = entry.transactions ?? [];
      const utxos = entry.utxo ?? [];

      onProgress?.({ stage: 'fetching transaction fees', detail: `${txHashes.length} txs` });

      const txs = await fetchTransactions(slug, txHashes.slice(0, MAX_TX_DETAILS), signal);

      const totalFeesSat = txs.reduce((sum, t) => sum + t.transaction.fee, 0);
      const sampledCount = txs.length;
      const feesExtrapolated = sampledCount > 0 && txHashes.length > sampledCount;
      const estimatedTotalFeesSat = feesExtrapolated
        ? Math.round((totalFeesSat / sampledCount) * txHashes.length)
        : totalFeesSat;

      let largestSingleOutputSat = 0;
      let txWithMostOutputs: { hash: string; outputCount: number } | undefined;
      let maxOutputs = 0;
      const counterparties = new Set<string>();

      for (const t of txs) {
        for (const o of t.outputs) {
          if (o.value > largestSingleOutputSat) largestSingleOutputSat = o.value;
          if (o.recipient && o.recipient !== address) counterparties.add(o.recipient);
        }
        if (t.transaction.output_count > maxOutputs) {
          maxOutputs = t.transaction.output_count;
          txWithMostOutputs = { hash: t.transaction.hash, outputCount: t.transaction.output_count };
        }
      }

      const now = Date.now();
      const oldestUtxo = utxos.reduce<number | undefined>((min, u) => {
        if (!u.transaction_hash) return min;
        const tx = txs.find((t) => t.transaction.hash === u.transaction_hash);
        if (!tx) return min;
        const age = Date.parse(tx.transaction.time.replace(' ', 'T') + 'Z');
        if (!Number.isFinite(age)) return min;
        return min === undefined ? age : Math.min(min, age);
      }, undefined);
      const oldestUtxoAgeDays =
        oldestUtxo !== undefined ? Math.floor((now - oldestUtxo) / DAY_MS) : 0;
      const dustUtxoCount = utxos.filter((u) => u.value < DUST_SATS).length;

      const prices = await fetchPrices([chain.coingeckoId], signal);
      const nativePriceUsd = prices[chain.coingeckoId] ?? 0;

      const firstTxAt = parseBlockchairDate(
        a.first_seen_receiving ?? a.first_seen_spending,
      );
      const lastTxAt = parseBlockchairDate(
        a.last_seen_spending ?? a.last_seen_receiving,
      );

      const facts: FactSheet = {
        chain: chainId,
        address,
        generatedAt: dataFetchedAt,
        feesSampled: feesExtrapolated,
        txCount: a.transaction_count,
        ...(firstTxAt !== undefined ? { firstTxAt } : {}),
        ...(lastTxAt !== undefined ? { lastTxAt } : {}),
        totalFeesNative: estimatedTotalFeesSat / divisor,
        currentBalanceNative: a.balance / divisor,
        totalReceivedNative: a.received / divisor,
        totalSentNative: a.spent / divisor,
        nativePriceUsd,
        utxo: {
          utxoCount: utxos.length,
          oldestUtxoAgeDays,
          dustUtxoCount,
          largestSingleOutputNative: largestSingleOutputSat / divisor,
          uniqueCounterparties: counterparties.size,
          ...(txWithMostOutputs ? { txWithMostOutputs } : {}),
        },
      };

      onProgress?.({ stage: 'done' });
      return facts;
    },
  };
}

function parseBlockchairDate(s?: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : undefined;
}

async function fetchTransactions(
  slug: string,
  hashes: string[],
  signal: AbortSignal | undefined,
): Promise<TxResponse['data'][string][]> {
  const out: TxResponse['data'][string][] = [];
  for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
    const batch = hashes.slice(i, i + BATCH_SIZE);
    const url = `https://api.blockchair.com/${slug}/dashboards/transactions/${batch.join(',')}`;

    const cacheKey = `utxo:${slug}:txs:${batch.join(',')}`;
    const cached = cacheGet<TxResponse>(cacheKey, 24 * 60 * 60 * 1000);
    let body: TxResponse;
    if (cached) {
      body = cached.data;
    } else {
      body = await fetchJson<TxResponse>(url, {
        ...(signal ? { signal } : {}),
        retries: 1,
      });
      cacheSet(cacheKey, body);
    }

    for (const h of batch) {
      const entry = body.data?.[h];
      if (entry) out.push(entry);
    }
  }
  return out;
}
