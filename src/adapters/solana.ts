import { rpc } from '../utils/fetch';
import { fetchPrices } from '../utils/price';
import { cacheGet, cacheSet } from '../utils/cache';
import { getChain } from '../core/registry';
import { WrapError, type FactSheet } from '../core/types';
import type { AdapterContext, ChainAdapter } from './adapter';

/**
 * Solana adapter using the public Solana RPC. Keyless, browser-friendly CORS.
 * We sample fees from the most-recent batch of transactions and extrapolate
 * when the wallet is beyond our signature scan window — honest and cheap.
 */

const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana.drpc.org',
];

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const LAMPORTS_PER_SOL = 1_000_000_000;
const SIG_PAGE = 1000;
const FEE_SAMPLE = 100;

interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
}

interface TxResult {
  slot: number;
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string }>;
      instructions?: Array<{ programIdIndex?: number }>;
    };
  };
  meta: {
    fee: number;
    err: unknown;
  } | null;
  blockTime: number | null;
}

export function createSolanaAdapter(): ChainAdapter {
  return {
    id: 'solana:sol',
    keyless: true,
    async fetchFacts(address: string, ctx: AdapterContext): Promise<FactSheet> {
      const chain = getChain('sol');
      const { signal, onProgress } = ctx;

      onProgress?.({ stage: 'fetching signatures', detail: 'solana' });
      const cacheKey = `sol:${address}`;

      type CachedBundle = {
        balanceLamports: number;
        signatures: SignatureInfo[];
        txs: TxResult[];
        tokenAccounts: number;
      };
      let bundle: CachedBundle;
      let dataFetchedAt: number;
      const cachedEntry = cacheGet<CachedBundle>(cacheKey);

      if (cachedEntry) {
        bundle = cachedEntry.data;
        dataFetchedAt = cachedEntry.fetchedAt;
      } else {
        const rpcUrl = await pickEndpoint(signal);

        const [balanceRes, sigs, tokenRes] = await Promise.all([
          rpc<{ value: number } | number>(rpcUrl, 'getBalance', [address], {
            ...(signal ? { signal } : {}),
          }),
          rpc<SignatureInfo[]>(rpcUrl, 'getSignaturesForAddress', [
            address,
            { limit: SIG_PAGE },
          ], { ...(signal ? { signal } : {}) }),
          rpc<{ value: Array<unknown> }>(rpcUrl, 'getTokenAccountsByOwner', [
            address,
            { programId: TOKEN_PROGRAM_ID },
            { encoding: 'base64' },
          ], { ...(signal ? { signal } : {}) }).catch(() => ({ value: [] })),
        ]);

        const balanceLamports =
          typeof balanceRes === 'number' ? balanceRes : (balanceRes.value ?? 0);

        onProgress?.({
          stage: 'sampling transactions',
          detail: `${Math.min(sigs.length, FEE_SAMPLE)} of ${sigs.length}`,
        });

        const sampled = sigs.slice(0, FEE_SAMPLE);
        const txs: TxResult[] = [];
        for (const s of sampled) {
          try {
            const tx = await rpc<TxResult | null>(rpcUrl, 'getTransaction', [
              s.signature,
              { encoding: 'json', maxSupportedTransactionVersion: 0 },
            ], { ...(signal ? { signal } : {}) });
            if (tx) txs.push(tx);
          } catch {
            // Skip individual tx errors — RPCs occasionally refuse historical lookups.
          }
        }

        bundle = {
          balanceLamports,
          signatures: sigs,
          txs,
          tokenAccounts: tokenRes.value?.length ?? 0,
        };
        dataFetchedAt = Date.now();
        cacheSet(cacheKey, bundle);
      }

      const sigs = bundle.signatures;
      const txs = bundle.txs;

      const firstTx = sigs.reduce<number | undefined>((min, s) => {
        if (s.blockTime == null) return min;
        return min === undefined ? s.blockTime : Math.min(min, s.blockTime);
      }, undefined);
      const lastTx = sigs.reduce<number | undefined>((max, s) => {
        if (s.blockTime == null) return max;
        return max === undefined ? s.blockTime : Math.max(max, s.blockTime);
      }, undefined);

      const failedInSigs = sigs.filter((s) => s.err != null).length;

      let sampledFeeLamports = 0;
      let biggestFeeLamports = 0;
      let biggestFeeHash: string | undefined;
      const programCounter = new Map<string, number>();

      for (const t of txs) {
        const fee = t.meta?.fee ?? 0;
        sampledFeeLamports += fee;
        if (fee > biggestFeeLamports) {
          biggestFeeLamports = fee;
          const sig = sigs.find((s) => s.slot === t.slot)?.signature;
          if (sig) biggestFeeHash = sig;
        }
        const accountKeys = t.transaction?.message?.accountKeys ?? [];
        const instructions = t.transaction?.message?.instructions ?? [];
        for (const ix of instructions) {
          const idx = ix.programIdIndex;
          if (idx == null) continue;
          const key = accountKeys[idx];
          const programId = typeof key === 'string' ? key : key?.pubkey;
          if (!programId) continue;
          programCounter.set(programId, (programCounter.get(programId) ?? 0) + 1);
        }
      }

      const feesExtrapolated = txs.length > 0 && sigs.length > txs.length;
      const estFeeLamports = feesExtrapolated
        ? Math.round((sampledFeeLamports / txs.length) * sigs.length)
        : sampledFeeLamports;

      let topProgram: string | undefined;
      let topProgramHits = 0;
      for (const [p, hits] of programCounter) {
        if (hits > topProgramHits) {
          topProgram = p;
          topProgramHits = hits;
        }
      }

      const prices = await fetchPrices([chain.coingeckoId], signal);
      const solPrice = prices[chain.coingeckoId] ?? 0;

      const facts: FactSheet = {
        chain: 'sol',
        address,
        generatedAt: dataFetchedAt,
        feesSampled: feesExtrapolated,
        txCount: sigs.length,
        ...(firstTx !== undefined ? { firstTxAt: firstTx * 1000 } : {}),
        ...(lastTx !== undefined ? { lastTxAt: lastTx * 1000 } : {}),
        totalFeesNative: estFeeLamports / LAMPORTS_PER_SOL,
        currentBalanceNative: bundle.balanceLamports / LAMPORTS_PER_SOL,
        totalReceivedNative: 0,
        totalSentNative: 0,
        nativePriceUsd: solPrice,
        solana: {
          failedTxCount: failedInSigs,
          splTokenCount: bundle.tokenAccounts,
          uniquePrograms: programCounter.size,
          ...(topProgram ? { topProgram } : {}),
          biggestSingleFeeNative: biggestFeeLamports / LAMPORTS_PER_SOL,
          ...(biggestFeeHash ? { biggestSingleFeeHash: biggestFeeHash } : {}),
        },
      };

      onProgress?.({ stage: 'done' });
      return facts;
    },
  };
}

async function pickEndpoint(signal: AbortSignal | undefined): Promise<string> {
  for (const url of RPC_ENDPOINTS) {
    try {
      await rpc(url, 'getHealth', [], {
        timeoutMs: 3000,
        retries: 0,
        ...(signal ? { signal } : {}),
      });
      return url;
    } catch {
      // try next
    }
  }
  throw new WrapError('sol_no_rpc', 'no Solana RPC endpoint is reachable right now');
}
