import type { ChainDef, FactSheet, Finding, Profile, WalletWrap } from './types';
import {
  formatInt,
  formatNativeWithUsd,
  humanDuration,
  isoDate,
  shortenAddress,
} from '../utils/format';

/**
 * The copy engine. Every finding is a pure function of facts — same wallet
 * always yields the same wrap. Lines are terse by design; if we have
 * nothing specific to say, the finding is skipped rather than padded.
 *
 * Tone: dry, understated, numerate. Never cruel, never cringe. Humor comes
 * from the data, not the framing.
 */
export function analyze(facts: FactSheet, chain: ChainDef): WalletWrap {
  const findings: Omit<Finding, 'id'>[] = [];

  pushUniversal(findings, facts, chain);
  if (facts.utxo) pushUtxo(findings, facts, chain);
  if (facts.evm) pushEvm(findings, facts, chain);
  if (facts.solana) pushSolana(findings, facts, chain);

  const numbered: Finding[] = findings.map((f, i) => ({
    id: String(i + 1).padStart(2, '0'),
    ...f,
  }));

  const profile = decideProfile(facts, chain);

  return {
    subject: facts.address,
    chain,
    generatedAt: facts.generatedAt,
    findings: numbered,
    profile,
    facts,
  };
}

/* ------------------------------------------------------------------ *
 * Universal findings
 * ------------------------------------------------------------------ */

function pushUniversal(out: Omit<Finding, 'id'>[], f: FactSheet, chain: ChainDef): void {
  out.push({
    label: 'transactions',
    value: formatInt(f.txCount),
    commentary: txCountCommentary(f.txCount),
  });

  const ageDays =
    f.firstTxAt !== undefined ? Math.floor((Date.now() - f.firstTxAt) / 86_400_000) : 0;
  if (f.firstTxAt !== undefined && ageDays > 0) {
    out.push({
      label: 'wallet age',
      value: `${humanDuration(ageDays)} (since ${isoDate(f.firstTxAt)})`,
      commentary: walletAgeCommentary(ageDays),
    });
  }

  const feesUsd = f.totalFeesNative * f.nativePriceUsd;
  const feesValue = formatNativeWithUsd(
    f.totalFeesNative,
    chain.ticker,
    chain.decimals,
    f.nativePriceUsd,
  );
  out.push({
    label: 'fees paid',
    value: f.feesSampled ? `~${feesValue}` : feesValue,
    commentary: f.feesSampled
      ? `${feesCommentary(feesUsd, chain)} (extrapolated from a sample — full tx count exceeds provider limits.)`
      : feesCommentary(feesUsd, chain),
  });

  const balanceUsd = f.currentBalanceNative * f.nativePriceUsd;
  out.push({
    label: 'balance',
    value: formatNativeWithUsd(
      f.currentBalanceNative,
      chain.ticker,
      chain.decimals,
      f.nativePriceUsd,
    ),
    commentary: balanceCommentary(f, balanceUsd),
  });

  const dormancyDays =
    f.lastTxAt !== undefined ? Math.floor((Date.now() - f.lastTxAt) / 86_400_000) : -1;
  if (dormancyDays >= 180) {
    out.push({
      label: 'last activity',
      value: `${humanDuration(dormancyDays)} ago (${isoDate(f.lastTxAt!)})`,
      commentary: dormancyCommentary(dormancyDays),
    });
  }
}

function txCountCommentary(n: number): string {
  if (n === 0) return 'Pristine. Either newly funded, or an exchange withdrawal destination.';
  if (n <= 10) return 'Cautious. Refreshingly sensible, in this industry.';
  if (n <= 100) return 'Enough to know better. Not enough to be fully traumatized.';
  if (n <= 500) return 'A working relationship with this chain.';
  if (n <= 2000) return 'You and the mempool are on a first-name basis.';
  if (n <= 10_000) return 'This is not a wallet. This is a lifestyle.';
  return 'Either a bot, or someone who should have been.';
}

function walletAgeCommentary(days: number): string {
  if (days < 30) return 'Fresh. The chain welcomes you. The chain always welcomes you.';
  if (days < 365) return 'Less than a year. You remember when everything was the "next ATH".';
  if (days < 365 * 3) return 'A cycle or two in. You have opinions now.';
  if (days < 365 * 7) return 'Deep in it. The wallet has outlasted several relationships.';
  return 'Early. Respect. Also: please update your seed-phrase threat model.';
}

function feesCommentary(usd: number, chain: ChainDef): string {
  if (usd < 1) return 'Barely a rounding error. The validators noticed nothing.';
  if (usd < 25) return 'A coffee’s worth of thanks to the network.';
  if (usd < 100) return 'A nice dinner. You paid for it; someone else ate it.';
  if (usd < 1000) return 'You could have bought a decent GPU. You bought blockspace instead.';
  if (usd < 10_000) return `${chain.label} thanks you for your continued service.`;
  return 'You are personally keeping the lights on. Do not stop.';
}

function balanceCommentary(f: FactSheet, balanceUsd: number): string {
  if (f.currentBalanceNative <= 0) return 'Empty. The rest of this report will explain.';
  if (balanceUsd < 1) return 'Dust. Sentimental, unmovable, forever.';
  if (balanceUsd < 100) return 'Pocket change. We are not here to judge.';
  if (balanceUsd < 10_000) return 'Meaningful, but not life-changing. Not yet, anyway.';
  if (balanceUsd < 100_000) return 'This wallet matters. Handle it like it does.';
  return 'Please stop storing this on a hot wallet.';
}

function dormancyCommentary(days: number): string {
  if (days < 365) return 'You have gone quiet. The chain has not missed you; the chain does not miss.';
  if (days < 365 * 3) return 'Long silence. Either conviction, or a lost device.';
  return 'Dormant. The wallet waits, indifferent, as wallets do.';
}

/* ------------------------------------------------------------------ *
 * UTXO findings
 * ------------------------------------------------------------------ */

function pushUtxo(out: Omit<Finding, 'id'>[], f: FactSheet, chain: ChainDef): void {
  const u = f.utxo!;

  if (u.utxoCount > 0) {
    out.push({
      label: 'unspent outputs',
      value: formatInt(u.utxoCount),
      commentary: utxoCountCommentary(u.utxoCount),
    });
  }

  if (u.oldestUtxoAgeDays >= 365) {
    out.push({
      label: 'oldest unspent',
      value: humanDuration(u.oldestUtxoAgeDays),
      commentary: oldestUtxoCommentary(u.oldestUtxoAgeDays),
    });
  }

  if (u.dustUtxoCount >= 3) {
    out.push({
      label: 'dust outputs',
      value: formatInt(u.dustUtxoCount),
      commentary: 'Tiny outputs you will never economically spend. The chain remembers them anyway.',
    });
  }

  if (u.largestSingleOutputNative > 0) {
    out.push({
      label: 'largest output',
      value: formatNativeWithUsd(
        u.largestSingleOutputNative,
        chain.ticker,
        chain.decimals,
        f.nativePriceUsd,
      ),
      commentary: 'Your biggest single move through this wallet.',
      ...(u.txWithMostOutputs
        ? {
            citation: {
              label: `tx ${shortenAddress(u.txWithMostOutputs.hash, 8, 6)}`,
              url: chain.explorerTx(u.txWithMostOutputs.hash),
            },
          }
        : {}),
    });
  }

  if (u.uniqueCounterparties >= 10) {
    out.push({
      label: 'counterparties',
      value: formatInt(u.uniqueCounterparties),
      commentary: `${u.uniqueCounterparties} distinct addresses. Half are probably you.`,
    });
  }
}

function utxoCountCommentary(n: number): string {
  if (n <= 3) return 'Tidy. An uncommon trait.';
  if (n <= 20) return 'Reasonable. Consolidation optional.';
  if (n <= 100) return 'A lot of change in your pockets. Consider consolidating.';
  return 'Your wallet is a junk drawer. Fees to consolidate will hurt. Do it anyway.';
}

function oldestUtxoCommentary(days: number): string {
  if (days < 365 * 3) return 'Held quietly, as intended.';
  if (days < 365 * 7) return 'Longer than most marriages. Do not move it for sentimental reasons now.';
  return 'Ancient. Coinbase did not exist properly when this was last touched.';
}

/* ------------------------------------------------------------------ *
 * EVM findings
 * ------------------------------------------------------------------ */

function pushEvm(out: Omit<Finding, 'id'>[], f: FactSheet, chain: ChainDef): void {
  const e = f.evm!;

  if (e.gasSpentNative > 0) {
    const usd = e.gasSpentNative * f.nativePriceUsd;
    const gasValue = formatNativeWithUsd(
      e.gasSpentNative,
      chain.ticker,
      chain.decimals,
      f.nativePriceUsd,
    );
    out.push({
      label: 'gas burned',
      value: f.feesSampled ? `~${gasValue}` : gasValue,
      commentary: f.feesSampled
        ? `${gasCommentary(usd)} (wallet has more history than Etherscan hands out in one page — figure is a floor.)`
        : gasCommentary(usd),
    });
  }

  if (e.failedTxCount > 0) {
    out.push({
      label: 'failed transactions',
      value: formatInt(e.failedTxCount),
      commentary: failedCommentary(e.failedTxCount),
    });
  }

  if (e.erc20TokenCount > 0) {
    out.push({
      label: 'tokens touched',
      value: formatInt(e.erc20TokenCount),
      commentary: erc20Commentary(e.erc20TokenCount),
    });
  }

  if (e.swapCount > 5) {
    out.push({
      label: 'contract calls',
      value: formatInt(e.swapCount),
      commentary: 'Non-trivial transactions. Buttons were pressed with confidence.',
    });
  }

  if (e.uniqueContracts >= 10) {
    out.push({
      label: 'unique contracts',
      value: formatInt(e.uniqueContracts),
      commentary: 'You are curious. Curiosity is expensive here.',
    });
  }

  if (e.approvalCount >= 3) {
    out.push({
      label: 'token approvals',
      value: formatInt(e.approvalCount),
      commentary:
        'Each one is a running credit line against your wallet. Revoke the ones you no longer use.',
    });
  }

  if (e.biggestSingleFeeNative > 0 && e.biggestSingleFeeHash) {
    out.push({
      label: 'worst single fee',
      value: formatNativeWithUsd(
        e.biggestSingleFeeNative,
        chain.ticker,
        chain.decimals,
        f.nativePriceUsd,
      ),
      commentary: 'One transaction, this much gas. We hope it was worth it.',
      citation: {
        label: `tx ${shortenAddress(e.biggestSingleFeeHash, 8, 6)}`,
        url: chain.explorerTx(e.biggestSingleFeeHash),
      },
    });
  }
}

function gasCommentary(usd: number): string {
  if (usd < 10) return 'Practically free. We are in an easier era now.';
  if (usd < 100) return 'A reasonable toll to exist on Ethereum.';
  if (usd < 1000) return 'A respectable gas bill. It funded someone else’s MEV bot.';
  if (usd < 10_000) return 'You have personally subsidized multiple proposer-builders. Consider a thank-you note.';
  return 'Your gas could have funded a small validator. In a way, it did.';
}

function failedCommentary(n: number): string {
  if (n <= 2) return 'A forgivable number. It happens.';
  if (n <= 10) return 'You have paid gas to fail — a specialty.';
  return 'You have paid to fail more times than most people have paid to succeed. Slow down.';
}

function erc20Commentary(n: number): string {
  if (n <= 5) return 'A tight portfolio. Discipline or disinterest.';
  if (n <= 25) return 'A serious collection. Most are probably no longer worth discussing.';
  if (n <= 100) return 'Your wallet is a memecoin graveyard. Some tombstones still have value.';
  return 'An unexplainable number of tickers. Even the block explorer is tired.';
}

/* ------------------------------------------------------------------ *
 * Solana findings
 * ------------------------------------------------------------------ */

function pushSolana(out: Omit<Finding, 'id'>[], f: FactSheet, chain: ChainDef): void {
  const s = f.solana!;

  if (s.failedTxCount > 0) {
    out.push({
      label: 'failed transactions',
      value: formatInt(s.failedTxCount),
      commentary:
        s.failedTxCount > 20
          ? 'Solana is famously fast at many things, including failing on your behalf.'
          : 'A normal amount of Solana. Fees were minimal; dignity less so.',
    });
  }

  if (s.splTokenCount > 0) {
    out.push({
      label: 'token accounts',
      value: formatInt(s.splTokenCount),
      commentary:
        s.splTokenCount > 30
          ? `${s.splTokenCount} token accounts. Each one costs rent. You can reclaim it. You will not.`
          : 'Active token accounts. Each carries a small rent deposit you forgot you paid.',
    });
  }

  if (s.uniquePrograms >= 3) {
    out.push({
      label: 'programs used',
      value: formatInt(s.uniquePrograms),
      commentary: 'Distinct on-chain programs. Half are probably no longer maintained.',
    });
  }

  if (s.biggestSingleFeeNative > 0 && s.biggestSingleFeeHash) {
    out.push({
      label: 'worst single fee',
      value: formatNativeWithUsd(
        s.biggestSingleFeeNative,
        chain.ticker,
        chain.decimals,
        f.nativePriceUsd,
      ),
      commentary: 'Priority fees add up when the chain is hot. This one was.',
      citation: {
        label: `tx ${shortenAddress(s.biggestSingleFeeHash, 8, 6)}`,
        url: chain.explorerTx(s.biggestSingleFeeHash),
      },
    });
  }
}

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

interface ProfileRule {
  id: string;
  title: string;
  test: (f: FactSheet) => boolean;
  weight: (f: FactSheet) => number;
  commentary: (f: FactSheet) => string;
}

const PROFILES: ProfileRule[] = [
  {
    id: 'ghost',
    title: 'ghost',
    test: (f) => f.txCount === 0,
    weight: () => 10,
    commentary: () => 'The wallet exists. Nothing else. Funded once, perhaps, then forgotten.',
  },
  {
    id: 'fresh_arrival',
    title: 'fresh_arrival',
    test: (f) => f.txCount > 0 && ageDays(f) < 45 && f.txCount < 15,
    weight: (f) => Math.max(1, 15 - f.txCount),
    commentary: () => 'New. The market is already forming its first opinion of you.',
  },
  {
    id: 'diamond_hands_by_forgetfulness',
    title: 'diamond_hands_by_forgetfulness',
    test: (f) => ageDays(f) > 365 * 2 && dormantDays(f) > 365 && f.currentBalanceNative > 0,
    weight: (f) => Math.min(10, dormantDays(f) / 365),
    commentary: () =>
      'Old wallet, quiet lately, still holding. Conviction or a missing seed phrase — the chain cannot tell the difference.',
  },
  {
    id: 'paper_hands',
    title: 'paper_hands',
    test: (f) => f.txCount > 50 && f.currentBalanceNative * f.nativePriceUsd < 5,
    weight: (f) => Math.min(10, f.txCount / 100),
    commentary: () =>
      'High churn, near-zero balance. Everything that came in eventually found a reason to leave.',
  },
  {
    id: 'gas_addict',
    title: 'gas_addict',
    test: (f) => {
      const gasUsd = (f.evm?.gasSpentNative ?? 0) * f.nativePriceUsd;
      const balanceUsd = f.currentBalanceNative * f.nativePriceUsd;
      return !!f.evm && gasUsd > Math.max(50, balanceUsd * 0.2);
    },
    weight: (f) => {
      const gasUsd = (f.evm?.gasSpentNative ?? 0) * f.nativePriceUsd;
      return Math.min(10, Math.log10(gasUsd + 1));
    },
    commentary: () =>
      'You have paid the network more in fees than many people ever hold on-chain. An honest achievement.',
  },
  {
    id: 'rug_tourist',
    title: 'rug_tourist',
    test: (f) => (f.evm?.erc20TokenCount ?? 0) > 40,
    weight: (f) => Math.min(10, (f.evm?.erc20TokenCount ?? 0) / 20),
    commentary: () =>
      'You have touched more tickers than a Bloomberg terminal. The survivors are a minority.',
  },
  {
    id: 'memecoin_archaeologist',
    title: 'memecoin_archaeologist',
    test: (f) => (f.solana?.splTokenCount ?? 0) > 25,
    weight: (f) => Math.min(10, (f.solana?.splTokenCount ?? 0) / 15),
    commentary: () =>
      'Dozens of token accounts, most with stories nobody wants to hear again. Rent is still being paid.',
  },
  {
    id: 'hodler_by_discipline',
    title: 'hodler_by_discipline',
    test: (f) =>
      ageDays(f) > 365 * 2 &&
      f.txCount < 30 &&
      f.currentBalanceNative * f.nativePriceUsd > 1000,
    weight: (f) => Math.min(10, ageDays(f) / 365),
    commentary: () =>
      'Old, quiet, still funded. A rare profile in this industry. Do not tell anyone.',
  },
  {
    id: 'degen',
    title: 'degen',
    test: (f) => f.txCount > 500,
    weight: (f) => Math.min(10, f.txCount / 500),
    commentary: () =>
      'Thousands of actions, each individually justifiable, collectively less so. The pattern is the diagnosis.',
  },
  {
    id: 'tourist',
    title: 'tourist',
    test: (f) => f.txCount > 0 && f.txCount < 10 && ageDays(f) > 365,
    weight: () => 3,
    commentary: () =>
      'Passed through once or twice, a while ago. The chain does not ask where you went.',
  },
  {
    id: 'working_user',
    title: 'working_user',
    test: (f) => f.txCount >= 10,
    weight: () => 1,
    commentary: () =>
      'Consistent, functional activity. Not dramatic enough to make a movie. That is a feature.',
  },
];

function ageDays(f: FactSheet): number {
  return f.firstTxAt !== undefined ? Math.floor((Date.now() - f.firstTxAt) / 86_400_000) : 0;
}

function dormantDays(f: FactSheet): number {
  return f.lastTxAt !== undefined ? Math.floor((Date.now() - f.lastTxAt) / 86_400_000) : 0;
}

function decideProfile(facts: FactSheet, _chain: ChainDef): Profile {
  const candidates = PROFILES.filter((r) => r.test(facts)).map((r) => ({
    rule: r,
    w: r.weight(facts),
  }));

  if (candidates.length === 0) {
    return {
      id: 'undetermined',
      title: 'undetermined',
      commentary: 'The data is thin. The wallet keeps its reasons to itself.',
      confidencePct: 50,
    };
  }

  candidates.sort((a, b) => b.w - a.w);
  const top = candidates[0]!;
  const totalW = candidates.reduce((s, c) => s + c.w, 0);
  const confidence = Math.min(99, Math.max(55, Math.round((top.w / totalW) * 100)));

  return {
    id: top.rule.id,
    title: top.rule.title,
    commentary: top.rule.commentary(facts),
    confidencePct: confidence,
  };
}
