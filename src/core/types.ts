export type ChainKind = 'utxo' | 'evm' | 'solana';

export type ChainId =
  | 'btc'
  | 'bch'
  | 'ltc'
  | 'doge'
  | 'eth'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'polygon'
  | 'bsc'
  | 'avalanche'
  | 'sol';

export interface ChainDef {
  readonly id: ChainId;
  readonly kind: ChainKind;
  readonly label: string;
  readonly ticker: string;
  readonly decimals: number;
  readonly coingeckoId: string;
  readonly addressPatterns: RegExp[];
  readonly explorerTx: (hash: string) => string;
  readonly explorerAddress: (addr: string) => string;
}

/**
 * Neutral set of numbers an adapter hands back. Shared shape so the copy
 * engine stays chain-agnostic for universal metrics and only branches when it
 * has to.
 */
export interface FactSheet {
  chain: ChainId;
  address: string;
  /** When the underlying on-chain data was fetched. On cache hits this is
   *  the original fetch time, not "now" — so UIs can honestly show age. */
  generatedAt: number;
  /** True when the wallet has more txs than the adapter fetched; totals like
   *  `totalFeesNative` are extrapolated from a sample and should be shown
   *  with a `~` prefix. */
  feesSampled?: boolean;

  txCount: number;
  firstTxAt?: number;
  lastTxAt?: number;
  totalFeesNative: number;
  currentBalanceNative: number;
  totalReceivedNative: number;
  totalSentNative: number;
  nativePriceUsd: number;

  utxo?: UtxoFacts;
  evm?: EvmFacts;
  solana?: SolanaFacts;
}

export interface UtxoFacts {
  utxoCount: number;
  oldestUtxoAgeDays: number;
  dustUtxoCount: number;
  largestSingleOutputNative: number;
  uniqueCounterparties: number;
  txWithMostOutputs?: { hash: string; outputCount: number };
}

export interface EvmFacts {
  gasSpentNative: number;
  failedTxCount: number;
  erc20TokenCount: number;
  swapCount: number;
  uniqueContracts: number;
  topContract?: string;
  approvalCount: number;
  biggestSingleFeeNative: number;
  biggestSingleFeeHash?: string;
}

export interface SolanaFacts {
  failedTxCount: number;
  splTokenCount: number;
  uniquePrograms: number;
  topProgram?: string;
  biggestSingleFeeNative: number;
  biggestSingleFeeHash?: string;
}

export interface Finding {
  id: string;
  label: string;
  value: string;
  commentary: string;
  citation?: { label: string; url: string };
}

/**
 * A categorical label assigned to a wallet based on its on-chain pattern,
 * with a confidence score and one-line commentary. Replaces the older
 * "verdict" framing — same shape, gentler word.
 */
export interface Profile {
  id: string;
  title: string;
  commentary: string;
  confidencePct: number;
}

/**
 * The full wrap of a wallet: subject, chain, list of numbered findings,
 * and a single overall profile.
 */
export interface WalletWrap {
  subject: string;
  chain: ChainDef;
  generatedAt: number;
  findings: Finding[];
  profile: Profile;
  facts: FactSheet;
}

export interface FetchProgress {
  stage: string;
  detail?: string;
}

export type ProgressCallback = (p: FetchProgress) => void;

export class WrapError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'WrapError';
    this.code = code;
  }
}
