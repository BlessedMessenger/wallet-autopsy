import { fetchJson } from '../utils/fetch';
import { fetchPrices } from '../utils/price';
import { cacheGet, cacheSet } from '../utils/cache';
import { getChain } from '../core/registry';
import { WrapError, type ChainId, type FactSheet } from '../core/types';
import type { AdapterContext, ChainAdapter } from './adapter';

/**
 * Shared adapter for all supported EVM chains via Etherscan V2's multichain
 * API. One free API key from the user covers every chain here.
 */

const CHAIN_NUM: Record<ChainId, number | null> = {
  eth: 1,
  bsc: 56,
  polygon: 137,
  avalanche: 43114,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  btc: null,
  bch: null,
  ltc: null,
  doge: null,
  sol: null,
};

const API = 'https://api.etherscan.io/v2/api';
const PAGE_LIMIT = 10_000;
const APPROVE_METHOD = '0x095ea7b3';

interface EtherscanEnvelope<T> {
  status: string;
  message: string;
  result: T;
}

interface NormalTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  isError: string;
  txreceipt_status?: string;
  input: string;
  contractAddress?: string;
  methodId?: string;
  functionName?: string;
}

interface Erc20Tx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
}

export function createEvmAdapter(chainId: ChainId): ChainAdapter {
  const chainNum = CHAIN_NUM[chainId];
  if (chainNum === null) throw new Error(`no chain id for ${chainId}`);

  return {
    id: `evm:${chainId}`,
    keyless: false,
    async fetchFacts(address: string, ctx: AdapterContext): Promise<FactSheet> {
      const chain = getChain(chainId);
      const key = ctx.config.etherscanApiKey?.trim();
      if (!key) {
        throw new WrapError(
          'missing_key',
          'EVM chains need a free Etherscan API key. Paste one in settings — it stays in your browser.',
        );
      }

      const lowercased = address.toLowerCase();
      const cacheKey = `evm:${chainId}:${lowercased}`;
      type CachedBundle = { txs: NormalTx[]; tokens: Erc20Tx[]; balanceWei: string };
      const cachedEntry = cacheGet<CachedBundle>(cacheKey);
      let bundle: CachedBundle;
      let dataFetchedAt: number;

      if (cachedEntry) {
        bundle = cachedEntry.data;
        dataFetchedAt = cachedEntry.fetchedAt;
      } else {
        ctx.onProgress?.({ stage: 'fetching transactions', detail: chain.label });
        const [txs, tokens, balance] = await Promise.all([
          fetchEtherscan<NormalTx[]>(
            {
              chainid: chainNum,
              module: 'account',
              action: 'txlist',
              address: lowercased,
              startblock: 0,
              endblock: 99_999_999,
              page: 1,
              offset: PAGE_LIMIT,
              sort: 'asc',
              apikey: key,
            },
            ctx.signal,
          ),
          fetchEtherscan<Erc20Tx[]>(
            {
              chainid: chainNum,
              module: 'account',
              action: 'tokentx',
              address: lowercased,
              startblock: 0,
              endblock: 99_999_999,
              page: 1,
              offset: PAGE_LIMIT,
              sort: 'asc',
              apikey: key,
            },
            ctx.signal,
          ),
          fetchEtherscan<string>(
            {
              chainid: chainNum,
              module: 'account',
              action: 'balance',
              address: lowercased,
              tag: 'latest',
              apikey: key,
            },
            ctx.signal,
          ),
        ]);
        bundle = { txs: txs ?? [], tokens: tokens ?? [], balanceWei: balance ?? '0' };
        dataFetchedAt = Date.now();
        cacheSet(cacheKey, bundle);
      }

      ctx.onProgress?.({ stage: 'crunching numbers', detail: `${bundle.txs.length} txs` });

      const divisor = 10 ** chain.decimals;
      const balanceNative = safeWei(bundle.balanceWei) / divisor;
      // Etherscan V2 caps each txlist page at PAGE_LIMIT rows. A full page
      // means there may be more history we didn't fetch — mark fees as
      // sampled so the UI can flag the totals.
      const feesTruncated = bundle.txs.length >= PAGE_LIMIT;

      let feeWei = 0;
      let biggestFeeWei = 0;
      let biggestFeeHash: string | undefined;
      let failedCount = 0;
      let swapCount = 0;
      let approvalCount = 0;
      const contractCounter = new Map<string, number>();
      let firstTxAt: number | undefined;
      let lastTxAt: number | undefined;
      let sentNative = 0;
      let receivedNative = 0;

      for (const t of bundle.txs) {
        const gasUsed = Number(t.gasUsed || 0);
        const gasPrice = Number(t.gasPrice || 0);
        const fee = gasUsed * gasPrice;
        if (t.from.toLowerCase() === lowercased) {
          feeWei += fee;
          if (fee > biggestFeeWei) {
            biggestFeeWei = fee;
            biggestFeeHash = t.hash;
          }
        }

        if (t.isError === '1' || t.txreceipt_status === '0') failedCount++;

        const methodId = (t.methodId ?? (t.input || '').slice(0, 10)).toLowerCase();
        if (methodId === APPROVE_METHOD) approvalCount++;
        if (t.input && t.input.length > 10 && methodId !== APPROVE_METHOD) swapCount++;

        const to = (t.to || '').toLowerCase();
        if (to) contractCounter.set(to, (contractCounter.get(to) ?? 0) + 1);

        const ts = Number(t.timeStamp) * 1000;
        if (Number.isFinite(ts)) {
          if (firstTxAt === undefined || ts < firstTxAt) firstTxAt = ts;
          if (lastTxAt === undefined || ts > lastTxAt) lastTxAt = ts;
        }

        const value = safeWei(t.value) / divisor;
        if (t.from.toLowerCase() === lowercased) sentNative += value;
        if (to === lowercased) receivedNative += value;
      }

      const erc20Contracts = new Set(bundle.tokens.map((t) => t.contractAddress.toLowerCase()));

      let topContract: string | undefined;
      let topContractHits = 0;
      for (const [addr, hits] of contractCounter) {
        if (hits > topContractHits) {
          topContract = addr;
          topContractHits = hits;
        }
      }

      const prices = await fetchPrices([chain.coingeckoId], ctx.signal);
      const nativePriceUsd = prices[chain.coingeckoId] ?? 0;

      const facts: FactSheet = {
        chain: chainId,
        address: lowercased,
        generatedAt: dataFetchedAt,
        feesSampled: feesTruncated,
        txCount: bundle.txs.length,
        ...(firstTxAt !== undefined ? { firstTxAt } : {}),
        ...(lastTxAt !== undefined ? { lastTxAt } : {}),
        totalFeesNative: feeWei / divisor,
        currentBalanceNative: balanceNative,
        totalReceivedNative: receivedNative,
        totalSentNative: sentNative,
        nativePriceUsd,
        evm: {
          gasSpentNative: feeWei / divisor,
          failedTxCount: failedCount,
          erc20TokenCount: erc20Contracts.size,
          swapCount,
          uniqueContracts: contractCounter.size,
          ...(topContract ? { topContract } : {}),
          approvalCount,
          biggestSingleFeeNative: biggestFeeWei / divisor,
          ...(biggestFeeHash ? { biggestSingleFeeHash: biggestFeeHash } : {}),
        },
      };

      ctx.onProgress?.({ stage: 'done' });
      return facts;
    },
  };
}

async function fetchEtherscan<T>(
  params: Record<string, string | number>,
  signal: AbortSignal | undefined,
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const url = `${API}?${qs.toString()}`;

  const body = await fetchJson<EtherscanEnvelope<T>>(url, {
    ...(signal ? { signal } : {}),
    retries: 2,
    timeoutMs: 20_000,
  });

  if (body.status === '0') {
    const msg = typeof body.result === 'string' ? body.result : body.message;
    if (msg === 'No transactions found') return [] as unknown as T;
    if (msg === 'No token transfers found') return [] as unknown as T;
    throw new WrapError('etherscan_error', `${body.message}: ${String(msg).slice(0, 200)}`);
  }
  return body.result;
}

/**
 * Wei values are too big for Number, but we only need rough totals so we
 * convert to Number carefully: if a single value is > 2^53, we fall back to
 * BigInt and divide out a safe number of zeros.
 */
function safeWei(raw: string): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && Number.isSafeInteger(n)) return n;
  try {
    const b = BigInt(raw);
    const SCALE = 1_000_000_000n;
    return Number(b / SCALE) * 1_000_000_000;
  } catch {
    return 0;
  }
}
