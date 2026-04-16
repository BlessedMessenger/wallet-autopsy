import { describe, expect, it } from 'vitest';
import { analyze } from '../core/copy';
import { getChain } from '../core/registry';
import type { FactSheet } from '../core/types';

function baseFacts(overrides: Partial<FactSheet> = {}): FactSheet {
  return {
    chain: 'btc',
    address: 'bc1qexample',
    generatedAt: Date.parse('2026-04-17T00:00:00Z'),
    txCount: 0,
    totalFeesNative: 0,
    currentBalanceNative: 0,
    totalReceivedNative: 0,
    totalSentNative: 0,
    nativePriceUsd: 50_000,
    ...overrides,
  };
}

describe('copy engine — determinism', () => {
  it('same facts produce the same report (no randomness, no Date.now leaks for content)', () => {
    const facts = baseFacts({
      txCount: 847,
      firstTxAt: Date.parse('2022-01-01T00:00:00Z'),
      lastTxAt: Date.parse('2025-12-01T00:00:00Z'),
      totalFeesNative: 0.003,
      currentBalanceNative: 0.5,
      utxo: {
        utxoCount: 12,
        oldestUtxoAgeDays: 1200,
        dustUtxoCount: 5,
        largestSingleOutputNative: 0.2,
        uniqueCounterparties: 25,
      },
    });

    const a = analyze(facts, getChain('btc'));
    const b = analyze(facts, getChain('btc'));

    expect(a.findings.map((f) => f.id + f.label)).toEqual(b.findings.map((f) => f.id + f.label));
    expect(a.findings.map((f) => f.commentary)).toEqual(b.findings.map((f) => f.commentary));
    expect(a.profile.id).toBe(b.profile.id);
  });
});

describe('copy engine — ghost profile', () => {
  it('assigns the ghost profile to a wallet with zero activity', () => {
    const r = analyze(baseFacts(), getChain('btc'));
    expect(r.profile.id).toBe('ghost');
  });
});

describe('copy engine — rug tourist', () => {
  it('flags EVM wallets with many ERC-20 tokens', () => {
    const r = analyze(
      baseFacts({
        chain: 'eth',
        address: '0xexample',
        nativePriceUsd: 3000,
        txCount: 200,
        firstTxAt: Date.parse('2022-01-01T00:00:00Z'),
        lastTxAt: Date.parse('2026-01-01T00:00:00Z'),
        currentBalanceNative: 0.01,
        totalFeesNative: 0.5,
        evm: {
          gasSpentNative: 0.5,
          failedTxCount: 4,
          erc20TokenCount: 80,
          swapCount: 150,
          uniqueContracts: 60,
          approvalCount: 10,
          biggestSingleFeeNative: 0.05,
        },
      }),
      getChain('eth'),
    );
    expect(['rug_tourist', 'degen', 'paper_hands']).toContain(r.profile.id);
  });
});

describe('copy engine — id numbering', () => {
  it('pads finding ids with leading zero and keeps them stable', () => {
    const r = analyze(
      baseFacts({
        txCount: 5,
        totalFeesNative: 0.0001,
        currentBalanceNative: 0.01,
        firstTxAt: Date.parse('2023-01-01T00:00:00Z'),
      }),
      getChain('btc'),
    );
    for (const f of r.findings) {
      expect(f.id).toMatch(/^\d{2}$/);
    }
    expect(r.findings[0]?.id).toBe('01');
  });
});
