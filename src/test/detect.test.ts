import { describe, expect, it } from 'vitest';
import { detectChains } from '../core/detect';

describe('address detection', () => {
  it('detects a mainnet bech32 btc address', () => {
    // BIP-173 example address, owned by nobody.
    const r = detectChains('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    expect(r.map((c) => c.id)).toEqual(['btc']);
  });

  it('detects a legacy btc address', () => {
    const r = detectChains('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(r.map((c) => c.id)).toContain('btc');
  });

  it('detects doge from leading D', () => {
    const r = detectChains('DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L');
    expect(r.map((c) => c.id)).toEqual(['doge']);
  });

  it('detects ltc bech32', () => {
    const r = detectChains('ltc1qhuv3dhpnm0wktasd3v0kt6e4aqfqsd0uhfdu7d');
    expect(r.map((c) => c.id)).toEqual(['ltc']);
  });

  it('detects ltc legacy (L prefix)', () => {
    const r = detectChains('LM2WMpR1Rp6j3Sa59cMXMs1SPzj9eXpGc1');
    expect(r.map((c) => c.id)).toEqual(['ltc']);
  });

  it('detects an EVM address', () => {
    const r = detectChains('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(r.map((c) => c.id)).toEqual(['eth']);
  });

  it('detects a solana address', () => {
    const r = detectChains('5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9');
    expect(r.map((c) => c.id)).toContain('sol');
  });

  it('rejects obvious garbage', () => {
    expect(detectChains('')).toEqual([]);
    expect(detectChains('hello world')).toEqual([]);
    expect(detectChains('0xNOT_HEX')).toEqual([]);
  });
});
