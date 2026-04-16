/**
 * Formatting helpers. All deterministic, no locale surprises (we force en-US so
 * screenshots look the same worldwide). We never use scientific notation — a
 * wallet report with `1.2e-5 ETH` in it breaks the mood.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const USD_PRECISE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return INT.format(Math.round(n));
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < 1) return USD_PRECISE.format(n);
  return USD.format(n);
}

export function formatUsdPrecise(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return USD_PRECISE.format(n);
}

/**
 * Format a native crypto amount with just enough precision to be honest.
 * BTC gets 8 sig digits, ETH/SOL get a compact form.
 */
export function formatNative(amount: number, ticker: string, decimals: number): string {
  if (!Number.isFinite(amount)) return `— ${ticker}`;
  if (amount === 0) return `0 ${ticker}`;

  const abs = Math.abs(amount);
  const useful = decimals >= 8 ? 8 : decimals >= 6 ? 6 : 4;
  const minFrac = abs < 1 ? Math.min(useful, 8) : 2;
  const maxFrac = abs < 1 ? Math.min(useful, 8) : 4;

  const str = amount.toLocaleString('en-US', {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
    useGrouping: true,
  });
  return `${str} ${ticker}`;
}

export function formatNativeWithUsd(
  amount: number,
  ticker: string,
  decimals: number,
  priceUsd: number,
): string {
  const native = formatNative(amount, ticker, decimals);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return native;
  const usd = amount * priceUsd;
  return `${native} (${formatUsd(usd)})`;
}

export function shortenAddress(addr: string, head = 6, tail = 4): string {
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function pluralize(n: number, one: string, many: string = `${one}s`): string {
  return n === 1 ? one : many;
}

export function daysBetween(aMs: number, bMs: number): number {
  return Math.floor(Math.abs(bMs - aMs) / 86_400_000);
}

/** ISO yyyy-mm-dd for citations/headers. */
export function isoDate(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * "yyyy-mm-dd hh:mm UTC" — compact but unambiguous. Used for the
 * human-facing "generated at" stamp. Full ISO with ms is machine-precise
 * but ugly; this is the compromise.
 */
export function isoDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * "3 years, 2 months" style short durations. Caps at years+months to stay
 * punchy. Used anywhere we talk about age.
 */
export function humanDuration(days: number): string {
  if (!Number.isFinite(days) || days < 0) return '—';
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${pluralize(months, 'month')}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} ${pluralize(years, 'year')}`;
  return `${years} ${pluralize(years, 'year')}, ${remMonths} ${pluralize(remMonths, 'month')}`;
}
