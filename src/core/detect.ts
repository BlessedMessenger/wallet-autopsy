import { CHAINS, CHAIN_IDS } from './registry';
import type { ChainDef, ChainId } from './types';

/**
 * Detect candidate chains for an address. The ordering is deliberate: the
 * EVM-and-SOL family both match broad base58/hex-looking strings, so we
 * short-circuit on clearly-identifying prefixes first.
 */
export function detectChains(input: string): ChainDef[] {
  const s = input.trim();
  if (!s) return [];

  // Unambiguous prefixes win immediately.
  if (s.startsWith('0x')) return matchPatterns(s, ['eth']);
  if (s.startsWith('bc1')) return matchPatterns(s, ['btc']);
  if (s.startsWith('ltc1')) return matchPatterns(s, ['ltc']);
  if (s.startsWith('bitcoincash:')) return matchPatterns(s, ['bch']);

  // Leading-letter heuristics for UTXO chains.
  const first = s[0];
  if (first === 'L' || first === 'M') return matchPatterns(s, ['ltc']);
  if (first === '1' || first === '3') return matchPatterns(s, ['btc', 'bch']);
  if (first === 'D' && s.length <= 35) return matchPatterns(s, ['doge']);

  // Everything else falls through to general base58 (Solana) matching.
  const matches = matchPatterns(s, CHAIN_IDS);
  if (matches.length > 0) return matches;

  return [];
}

function matchPatterns(input: string, ids: ChainId[]): ChainDef[] {
  const out: ChainDef[] = [];
  for (const id of ids) {
    const def = CHAINS[id];
    if (def.addressPatterns.some((re) => re.test(input))) out.push(def);
  }
  return out;
}

/**
 * Normalize an address for display (e.g. Ethereum to checksum-less lower case,
 * BCH cashaddr trimmed of prefix). Keeps things tidy without hiding typos.
 */
export function normalizeAddress(addr: string, chain: ChainDef): string {
  const s = addr.trim();
  switch (chain.kind) {
    case 'evm':
      return s.toLowerCase();
    case 'utxo':
      if (chain.id === 'bch' && s.startsWith('bitcoincash:')) {
        return s.slice('bitcoincash:'.length);
      }
      return s;
    case 'solana':
      return s;
    default:
      return s;
  }
}
