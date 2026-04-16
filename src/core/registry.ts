import type { ChainDef, ChainId } from './types';

/**
 * Chain registry. Patterns lean conservative — we'd rather fail to auto-detect
 * an obscure address format than mis-route a user's BTC to a Solana adapter.
 */
export const CHAINS: Record<ChainId, ChainDef> = {
  btc: {
    id: 'btc',
    kind: 'utxo',
    label: 'Bitcoin',
    ticker: 'BTC',
    decimals: 8,
    coingeckoId: 'bitcoin',
    addressPatterns: [
      /^bc1[a-z0-9]{25,87}$/,
      /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    ],
    explorerTx: (h) => `https://mempool.space/tx/${h}`,
    explorerAddress: (a) => `https://mempool.space/address/${a}`,
  },

  bch: {
    id: 'bch',
    kind: 'utxo',
    label: 'Bitcoin Cash',
    ticker: 'BCH',
    decimals: 8,
    coingeckoId: 'bitcoin-cash',
    addressPatterns: [
      /^bitcoincash:[qp][a-z0-9]{41,64}$/,
      /^[qp][a-z0-9]{41,64}$/,
    ],
    explorerTx: (h) => `https://blockchair.com/bitcoin-cash/transaction/${h}`,
    explorerAddress: (a) => `https://blockchair.com/bitcoin-cash/address/${a}`,
  },

  ltc: {
    id: 'ltc',
    kind: 'utxo',
    label: 'Litecoin',
    ticker: 'LTC',
    decimals: 8,
    coingeckoId: 'litecoin',
    addressPatterns: [
      /^ltc1[a-z0-9]{25,87}$/,
      /^[LM][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    ],
    explorerTx: (h) => `https://blockchair.com/litecoin/transaction/${h}`,
    explorerAddress: (a) => `https://blockchair.com/litecoin/address/${a}`,
  },

  doge: {
    id: 'doge',
    kind: 'utxo',
    label: 'Dogecoin',
    ticker: 'DOGE',
    decimals: 8,
    coingeckoId: 'dogecoin',
    addressPatterns: [/^D[a-km-zA-HJ-NP-Z1-9]{33}$/],
    explorerTx: (h) => `https://blockchair.com/dogecoin/transaction/${h}`,
    explorerAddress: (a) => `https://blockchair.com/dogecoin/address/${a}`,
  },

  eth: {
    id: 'eth',
    kind: 'evm',
    label: 'Ethereum',
    ticker: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    addressPatterns: [/^0x[a-fA-F0-9]{40}$/],
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    explorerAddress: (a) => `https://etherscan.io/address/${a}`,
  },

  arbitrum: {
    id: 'arbitrum',
    kind: 'evm',
    label: 'Arbitrum',
    ticker: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    addressPatterns: [/^0x[a-fA-F0-9]{40}$/],
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
    explorerAddress: (a) => `https://arbiscan.io/address/${a}`,
  },

  optimism: {
    id: 'optimism',
    kind: 'evm',
    label: 'Optimism',
    ticker: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    addressPatterns: [/^0x[a-fA-F0-9]{40}$/],
    explorerTx: (h) => `https://optimistic.etherscan.io/tx/${h}`,
    explorerAddress: (a) => `https://optimistic.etherscan.io/address/${a}`,
  },

  base: {
    id: 'base',
    kind: 'evm',
    label: 'Base',
    ticker: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    addressPatterns: [/^0x[a-fA-F0-9]{40}$/],
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
    explorerAddress: (a) => `https://basescan.org/address/${a}`,
  },

  polygon: {
    id: 'polygon',
    kind: 'evm',
    label: 'Polygon',
    ticker: 'POL',
    decimals: 18,
    coingeckoId: 'matic-network',
    addressPatterns: [/^0x[a-fA-F0-9]{40}$/],
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
    explorerAddress: (a) => `https://polygonscan.com/address/${a}`,
  },

  bsc: {
    id: 'bsc',
    kind: 'evm',
    label: 'BNB Chain',
    ticker: 'BNB',
    decimals: 18,
    coingeckoId: 'binancecoin',
    addressPatterns: [/^0x[a-fA-F0-9]{40}$/],
    explorerTx: (h) => `https://bscscan.com/tx/${h}`,
    explorerAddress: (a) => `https://bscscan.com/address/${a}`,
  },

  avalanche: {
    id: 'avalanche',
    kind: 'evm',
    label: 'Avalanche C-Chain',
    ticker: 'AVAX',
    decimals: 18,
    coingeckoId: 'avalanche-2',
    addressPatterns: [/^0x[a-fA-F0-9]{40}$/],
    explorerTx: (h) => `https://snowtrace.io/tx/${h}`,
    explorerAddress: (a) => `https://snowtrace.io/address/${a}`,
  },

  sol: {
    id: 'sol',
    kind: 'solana',
    label: 'Solana',
    ticker: 'SOL',
    decimals: 9,
    coingeckoId: 'solana',
    addressPatterns: [/^[1-9A-HJ-NP-Za-km-z]{32,44}$/],
    explorerTx: (h) => `https://solscan.io/tx/${h}`,
    explorerAddress: (a) => `https://solscan.io/account/${a}`,
  },
};

export const CHAIN_IDS: ChainId[] = Object.keys(CHAINS) as ChainId[];

export function getChain(id: ChainId): ChainDef {
  return CHAINS[id];
}
