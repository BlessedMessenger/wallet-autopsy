import { WrapError } from '../core/types';

/**
 * Map a thrown error to a short, plain-English sentence suitable for the
 * terminal log. The error code is appended in brackets so curious users can
 * still grep for it, but the leading clause never assumes the reader knows
 * what `http_429` or `sol_no_rpc` means.
 */
export function friendlyError(err: unknown): { message: string; code: string } {
  if (err instanceof WrapError) {
    return { message: phraseFor(err.code, err.message), code: err.code };
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { message: 'cancelled.', code: 'aborted' };
  }
  if (err instanceof Error) {
    const msg = err.message || 'unknown error';
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return {
        message: 'network error — check your connection or disable a blocker, then try again.',
        code: 'network',
      };
    }
    return { message: msg, code: err.name || 'error' };
  }
  return { message: 'unknown error.', code: 'unknown' };
}

function phraseFor(code: string, originalMessage: string): string {
  switch (code) {
    case 'missing_key':
      return 'missing etherscan api key — open "settings" above, paste a free one, try again.';
    case 'rate_limited':
      return 'the block explorer is rate-limiting this ip. wait a minute and try again.';
    case 'no_address':
      return 'no on-chain record for this address yet. fresh wallet, typo, or wrong chain?';
    case 'sol_no_rpc':
      return 'no public solana rpc is reachable right now. try again in a minute.';
    case 'etherscan_error':
      if (/invalid api key/i.test(originalMessage)) {
        return 'etherscan rejected the api key. paste a valid one in "settings".';
      }
      if (/max rate limit/i.test(originalMessage)) {
        return 'etherscan is rate-limiting your key. wait a few seconds and rerun.';
      }
      return 'etherscan returned an error. this usually clears up on retry.';
    case 'http_429':
      return 'too many requests — the explorer needs a break. try again in a minute.';
    case 'fetch_failed':
      return 'network request failed. retry, or try a different chain.';
    default:
      if (code.startsWith('http_5')) {
        return 'the block explorer had a server error. not you — them. retry shortly.';
      }
      return originalMessage || 'something went wrong.';
  }
}

/**
 * Format a friendly error for the terminal log: sentence first, short code
 * in square brackets at the end for debug value.
 */
export function formatTerminalError(err: unknown): string {
  const { message, code } = friendlyError(err);
  return `${message} [${code}]`;
}
