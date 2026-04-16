import { describe, expect, it } from 'vitest';
import {
  formatInt,
  formatNative,
  formatNativeWithUsd,
  formatUsd,
  humanDuration,
  shortenAddress,
} from '../utils/format';

describe('format.formatInt', () => {
  it('groups thousands', () => {
    expect(formatInt(1234567)).toBe('1,234,567');
    expect(formatInt(847)).toBe('847');
  });
  it('handles non-finite', () => {
    expect(formatInt(NaN)).toBe('—');
    expect(formatInt(Infinity)).toBe('—');
  });
});

describe('format.formatUsd', () => {
  it('rounds whole dollars for big values', () => {
    expect(formatUsd(1420)).toBe('$1,420');
  });
  it('keeps cents for fractional values', () => {
    expect(formatUsd(0.42)).toBe('$0.42');
  });
});

describe('format.formatNative', () => {
  it('uses ticker suffix', () => {
    expect(formatNative(0.00312, 'BTC', 8)).toContain('BTC');
  });
  it('never returns scientific notation', () => {
    const s = formatNative(0.0000001, 'BTC', 8);
    expect(s.toLowerCase()).not.toContain('e');
  });
});

describe('format.formatNativeWithUsd', () => {
  it('omits usd suffix when price unknown', () => {
    expect(formatNativeWithUsd(1.5, 'ETH', 18, 0)).not.toContain('$');
  });
  it('appends usd suffix when price known', () => {
    expect(formatNativeWithUsd(1.5, 'ETH', 18, 2000)).toContain('$3,000');
  });
});

describe('format.shortenAddress', () => {
  it('uses ellipsis between head and tail', () => {
    const s = shortenAddress('bc1qabcdefghijklmnopqrstuvwxyz', 6, 4);
    expect(s.startsWith('bc1qab')).toBe(true);
    expect(s.includes('…')).toBe(true);
  });
  it('returns original for already-short', () => {
    expect(shortenAddress('short', 6, 4)).toBe('short');
  });
});

describe('format.humanDuration', () => {
  it('formats days', () => {
    expect(humanDuration(1)).toBe('1 day');
    expect(humanDuration(5)).toBe('5 days');
  });
  it('formats months', () => {
    expect(humanDuration(45)).toContain('month');
  });
  it('formats years+months', () => {
    expect(humanDuration(400)).toMatch(/year/);
  });
});
