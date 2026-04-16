import type { FactSheet, ProgressCallback } from '../core/types';

export interface AdapterContext {
  /**
   * User-scoped config passed from the UI. Mostly API keys the user pasted
   * themselves — keys never leave their browser's localStorage.
   */
  config: {
    etherscanApiKey?: string;
  };
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

export interface ChainAdapter {
  readonly id: string;
  /** True iff this adapter can work without any user-supplied API keys. */
  readonly keyless: boolean;
  /** Fetch the normalized fact sheet for an address. */
  fetchFacts(address: string, ctx: AdapterContext): Promise<FactSheet>;
}
