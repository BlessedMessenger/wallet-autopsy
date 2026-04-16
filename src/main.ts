import './style.css';

import { createBtcMempoolAdapter, withFallback } from './adapters/btc-mempool';
import { createEvmAdapter } from './adapters/evm';
import { createSolanaAdapter } from './adapters/solana';
import { createUtxoAdapter } from './adapters/utxo';
import type { ChainAdapter } from './adapters/adapter';
import { TIP_BTC, REPO_URL, SITE_URL } from './config';
import { analyze } from './core/copy';
import { detectChains, normalizeAddress } from './core/detect';
import { CHAINS, getChain } from './core/registry';
import type { ChainDef, ChainId, WalletWrap } from './core/types';
import { WrapError } from './core/types';
import { renderReport } from './ui/report';
import { buildSummaryText, buildTweetIntent, downloadShareCard } from './ui/share';
import { TerminalLog } from './ui/terminal';
import { Settings } from './utils/cache';
import { formatTerminalError } from './utils/errors';

const EVM_IDS: ChainId[] = ['eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc', 'avalanche'];

interface AppEls {
  log: HTMLElement;
  report: HTMLElement;
  input: HTMLInputElement;
  run: HTMLButtonElement;
  chainPicker: HTMLElement;
  hint: HTMLElement;
  settings: HTMLElement;
  resultActions: HTMLElement;
}

interface AppState {
  selectedChainId: ChainId | null;
  candidates: ChainDef[];
  currentAbort: AbortController | null;
  lastReport: WalletWrap | null;
}

const state: AppState = {
  selectedChainId: null,
  candidates: [],
  currentAbort: null,
  lastReport: null,
};

boot();

function boot(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app');

  const els = mountShell(root);
  wire(els);

  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const presetAddress = params.get('address');
  const presetChain = params.get('chain') as ChainId | null;
  if (presetAddress) {
    els.input.value = presetAddress;
    if (presetChain && presetChain in CHAINS) state.selectedChainId = presetChain;
    onAddressChange(els);
    if (canRun(els)) void runWrap(els);
  }
}

/* -------------------------------------------------------- *
 * Shell mounting
 * -------------------------------------------------------- */

function mountShell(root: HTMLElement): AppEls {
  root.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'app-shell';
  root.appendChild(shell);

  shell.appendChild(buildHeader());

  // Intro paragraph
  const intro = document.createElement('p');
  intro.className = 'muted';
  intro.textContent =
    'wrap any crypto wallet. 12 chains. everything runs in your browser — no server, no tracking, no accounts.';
  shell.appendChild(intro);

  // Form
  const form = document.createElement('form');
  form.className = 'form';
  form.setAttribute('autocomplete', 'off');

  const row = document.createElement('div');
  row.className = 'row';
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'address';
  input.placeholder = 'paste a wallet address';
  input.spellcheck = false;
  input.autocapitalize = 'off';
  input.setAttribute('aria-label', 'wallet address');
  row.appendChild(input);
  const run = document.createElement('button');
  run.type = 'submit';
  run.textContent = 'run';
  run.disabled = true;
  row.appendChild(run);
  form.appendChild(row);

  const chainPicker = document.createElement('div');
  chainPicker.className = 'hint';
  chainPicker.hidden = true;
  form.appendChild(chainPicker);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.innerHTML = buildSupportedHint();
  form.appendChild(hint);

  const settings = document.createElement('details');
  settings.className = 'hint';
  const summary = document.createElement('summary');
  summary.textContent = 'settings — etherscan api key (for all evm chains)';
  settings.appendChild(summary);
  const body = document.createElement('div');
  body.style.display = 'grid';
  body.style.gap = '8px';
  body.style.marginTop = '8px';

  const note = document.createElement('p');
  note.innerHTML = `get a free one at <a href="https://etherscan.io/myapikey" target="_blank" rel="noopener noreferrer">etherscan.io/myapikey</a>. stored only in your browser.`;
  body.appendChild(note);

  const keyRow = document.createElement('div');
  keyRow.className = 'row';
  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.placeholder = 'your etherscan api key';
  keyInput.name = 'etherscanKey';
  keyInput.value = Settings.get('etherscan-key') ?? '';
  keyInput.spellcheck = false;
  keyRow.appendChild(keyInput);
  const saveKey = document.createElement('button');
  saveKey.type = 'button';
  saveKey.textContent = 'save';
  keyRow.appendChild(saveKey);
  body.appendChild(keyRow);
  const keyStatus = document.createElement('div');
  keyStatus.className = 'muted';
  keyStatus.textContent = keyInput.value ? 'key saved' : 'no key set';
  body.appendChild(keyStatus);

  saveKey.addEventListener('click', () => {
    const v = keyInput.value.trim();
    if (v) {
      Settings.set('etherscan-key', v);
      keyStatus.textContent = 'key saved';
    } else {
      Settings.delete('etherscan-key');
      keyStatus.textContent = 'key cleared';
    }
    const prev = saveKey.textContent;
    saveKey.textContent = 'saved ✓';
    saveKey.disabled = true;
    setTimeout(() => {
      saveKey.textContent = prev;
      saveKey.disabled = false;
    }, 1200);
  });

  settings.appendChild(body);
  form.appendChild(settings);

  shell.appendChild(form);

  // Log + report panels
  const log = document.createElement('div');
  log.className = 'card';
  log.style.display = 'none';
  shell.appendChild(log);

  const report = document.createElement('div');
  shell.appendChild(report);

  const resultActions = document.createElement('div');
  resultActions.className = 'actions-row';
  resultActions.style.display = 'none';
  shell.appendChild(resultActions);

  shell.appendChild(buildFooter());

  return {
    log,
    report,
    input,
    run,
    chainPicker,
    hint,
    settings,
    resultActions,
  };
}

function buildSupportedHint(): string {
  const groups: { kind: string; ids: ChainId[] }[] = [
    { kind: 'utxo', ids: ['btc', 'bch', 'ltc', 'doge'] },
    { kind: 'evm', ids: EVM_IDS },
    { kind: 'solana', ids: ['sol'] },
  ];
  const parts = groups.map((g) => {
    const labels = g.ids.map((id) => getChain(id).label.toLowerCase()).join(', ');
    return `<strong>${g.kind}</strong> (${labels})`;
  });
  return `supported · ${parts.join(' · ')}`;
}

function buildHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'header';
  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.innerHTML = `chain wrapped<span class="punct"> · the lifetime wrap for any on-chain wallet</span>`;
  header.appendChild(brand);

  const links = document.createElement('div');
  links.className = 'header-links';
  const gh = document.createElement('a');
  gh.href = REPO_URL;
  gh.target = '_blank';
  gh.rel = 'noopener noreferrer';
  gh.textContent = 'github';
  links.appendChild(gh);
  header.appendChild(links);

  return header;
}

function buildFooter(): HTMLElement {
  const foot = document.createElement('footer');
  foot.className = 'footer';

  const tip = document.createElement('div');
  tip.className = 'tip';
  const tipLabel = document.createElement('span');
  tipLabel.textContent = 'tip if it helped · btc ';
  tip.appendChild(tipLabel);

  const tipLink = document.createElement('a');
  tipLink.href = `bitcoin:${TIP_BTC}`;
  tipLink.className = 'strong tip-addr';
  tipLink.textContent = TIP_BTC;
  tipLink.rel = 'noopener noreferrer';
  tip.appendChild(tipLink);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'tip-copy';
  copyBtn.textContent = 'copy';
  copyBtn.setAttribute('aria-label', 'copy btc tip address');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(TIP_BTC);
      copyBtn.textContent = 'copied ✓';
    } catch {
      copyBtn.textContent = 'copy failed';
    }
    setTimeout(() => (copyBtn.textContent = 'copy'), 1500);
  });
  tip.appendChild(copyBtn);

  foot.appendChild(tip);

  const meta = document.createElement('div');
  meta.innerHTML = `<a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">${SITE_URL}</a> · open source (mit)`;
  foot.appendChild(meta);

  return foot;
}

/* -------------------------------------------------------- *
 * Wiring
 * -------------------------------------------------------- */

function wire(els: AppEls): void {
  els.input.addEventListener('input', () => onAddressChange(els));
  els.input.addEventListener('paste', () => setTimeout(() => onAddressChange(els), 0));

  const form = els.input.closest('form')!;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (canRun(els)) void runWrap(els);
  });

  // Restore the wrap that matches the URL hash when the user navigates with
  // browser Back/Forward.
  window.addEventListener('popstate', () => {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const address = params.get('address');
    const chain = params.get('chain') as ChainId | null;
    if (address) {
      els.input.value = address;
      if (chain && chain in CHAINS) state.selectedChainId = chain;
      onAddressChange(els);
      if (canRun(els)) void runWrap(els);
    } else {
      els.input.value = '';
      els.report.textContent = '';
      els.log.style.display = 'none';
      els.resultActions.style.display = 'none';
      state.lastReport = null;
      state.selectedChainId = null;
      state.candidates = [];
      onAddressChange(els);
    }
  });
}

function onAddressChange(els: AppEls): void {
  const value = els.input.value.trim();
  const evmMode = /^0x[a-fA-F0-9]{40}$/.test(value);

  // For EVM addresses, every L1/L2 in our registry is a valid candidate;
  // detectChains would only return ['eth'] and fail matchesCandidate() for any
  // other EVM selection the user makes.
  state.candidates = evmMode ? EVM_IDS.map((id) => getChain(id)) : detectChains(value);
  state.selectedChainId =
    state.selectedChainId && matchesCandidate() ? state.selectedChainId : null;

  if (state.candidates.length > 1) {
    renderChainPicker(els, state.candidates);
  } else if (state.candidates.length === 1) {
    state.selectedChainId = state.candidates[0]!.id;
    els.chainPicker.hidden = true;
    els.chainPicker.textContent = '';
  } else if (value.length > 0) {
    els.chainPicker.hidden = false;
    els.chainPicker.textContent = '';
    const msg = document.createElement('span');
    msg.className = 'loss';
    msg.textContent = "can't recognize this as a wallet on any supported chain.";
    els.chainPicker.appendChild(msg);
    state.selectedChainId = null;
  } else {
    els.chainPicker.hidden = true;
    els.chainPicker.textContent = '';
    state.selectedChainId = null;
  }

  els.run.disabled = !canRun(els);
  if (els.run.disabled) {
    if (!value) els.run.title = 'paste a wallet address first';
    else if (state.candidates.length === 0) els.run.title = "can't detect a chain for this address";
    else if (!state.selectedChainId) els.run.title = 'pick a chain above';
    else els.run.title = '';
  } else {
    els.run.title = '';
  }
}

function matchesCandidate(): boolean {
  if (!state.selectedChainId) return false;
  return state.candidates.some((c) => c.id === state.selectedChainId);
}

function renderChainPicker(els: AppEls, chains: ChainDef[]): void {
  els.chainPicker.hidden = false;
  els.chainPicker.textContent = '';
  const label = document.createElement('span');
  label.textContent = 'chain: ';
  els.chainPicker.appendChild(label);

  for (const c of chains) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = c.label.toLowerCase();
    btn.style.marginRight = '6px';
    btn.style.marginTop = '4px';
    if (state.selectedChainId === c.id) {
      btn.style.background = '#000';
      btn.style.color = '#fff';
    }
    btn.addEventListener('click', () => {
      state.selectedChainId = c.id;
      renderChainPicker(els, chains);
      els.run.disabled = !canRun(els);
    });
    els.chainPicker.appendChild(btn);
  }
}

function canRun(_els: AppEls): boolean {
  return !!state.selectedChainId && !state.currentAbort;
}

/* -------------------------------------------------------- *
 * Running a wrap
 * -------------------------------------------------------- */

async function runWrap(els: AppEls): Promise<void> {
  if (!state.selectedChainId) return;

  const chain = getChain(state.selectedChainId);
  const rawAddress = els.input.value.trim();
  const address = normalizeAddress(rawAddress, chain);

  state.currentAbort?.abort();
  state.currentAbort = new AbortController();
  const { signal } = state.currentAbort;

  els.run.disabled = true;
  els.input.disabled = true;
  els.report.textContent = '';
  els.resultActions.style.display = 'none';
  els.log.style.display = '';
  els.log.textContent = '';

  const term = new TerminalLog(els.log);
  term.prompt(`cw wrap --chain=${chain.id} ${address}`);

  try {
    const adapter = pickAdapter(state.selectedChainId);
    if (!adapter.keyless && !Settings.get('etherscan-key')) {
      throw new WrapError(
        'missing_key',
        'EVM chains need a free Etherscan API key — open "settings" above, paste one, then run again.',
      );
    }

    const startedAt = performance.now();
    const facts = await adapter.fetchFacts(address, {
      config: { ...(Settings.get('etherscan-key') ? { etherscanApiKey: Settings.get('etherscan-key')! } : {}) },
      signal,
      onProgress: (p) => {
        term.line(`${p.stage}${p.detail ? ' · ' + p.detail : ''}`);
      },
    });
    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);

    term.line(`wrap complete in ${elapsed}s`, 'ok');

    const report = analyze(facts, chain);
    state.lastReport = report;
    renderReport(els.report, report);
    mountResultActions(els);
    updateHash(address, chain.id);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      term.line('cancelled.', 'muted');
    } else {
      term.line(`failed — ${formatTerminalError(err)}`, 'loss');
    }
  } finally {
    state.currentAbort = null;
    els.run.disabled = !canRun(els);
    els.input.disabled = false;
  }
}

function pickAdapter(id: ChainId): ChainAdapter {
  const chain = getChain(id);
  switch (chain.kind) {
    case 'utxo':
      if (id === 'btc') {
        return withFallback(createBtcMempoolAdapter(), createUtxoAdapter('btc'));
      }
      return createUtxoAdapter(id);
    case 'evm':
      return createEvmAdapter(id);
    case 'solana':
      return createSolanaAdapter();
  }
}

function mountResultActions(els: AppEls): void {
  els.resultActions.textContent = '';
  els.resultActions.style.display = '';

  const download = document.createElement('button');
  download.type = 'button';
  download.textContent = 'download share image (png)';
  download.addEventListener('click', async () => {
    if (!state.lastReport) return;
    download.disabled = true;
    const original = download.textContent;
    download.textContent = 'rendering…';
    try {
      await downloadShareCard(state.lastReport);
    } catch (e) {
      console.error(e);
      alert('share image generation failed. try again.');
    } finally {
      download.textContent = original;
      download.disabled = false;
    }
  });

  const copySummary = document.createElement('button');
  copySummary.type = 'button';
  copySummary.textContent = 'copy summary';
  copySummary.addEventListener('click', async () => {
    if (!state.lastReport) return;
    const text = buildSummaryText(state.lastReport, location.href);
    try {
      await navigator.clipboard.writeText(text);
      copySummary.textContent = 'copied ✓';
    } catch {
      copySummary.textContent = 'copy failed';
    }
    setTimeout(() => (copySummary.textContent = 'copy summary'), 1500);
  });

  const shareX = document.createElement('button');
  shareX.type = 'button';
  shareX.textContent = 'share on x';
  shareX.addEventListener('click', () => {
    if (!state.lastReport) return;
    const intent = buildTweetIntent(state.lastReport, location.href);
    window.open(intent, '_blank', 'noopener,noreferrer');
  });

  const again = document.createElement('button');
  again.type = 'button';
  again.textContent = 'another wallet';
  again.addEventListener('click', () => {
    els.input.value = '';
    els.input.focus();
    els.report.textContent = '';
    els.log.style.display = 'none';
    els.resultActions.style.display = 'none';
    state.lastReport = null;
    state.selectedChainId = null;
    state.candidates = [];
    onAddressChange(els);
    // pushState (not replace) so browser Back brings the prior wrap back.
    history.pushState(null, '', location.pathname + location.search);
  });

  els.resultActions.appendChild(download);
  els.resultActions.appendChild(copySummary);
  els.resultActions.appendChild(shareX);
  els.resultActions.appendChild(again);
}

function updateHash(address: string, chainId: ChainId): void {
  const p = new URLSearchParams();
  p.set('address', address);
  p.set('chain', chainId);
  history.replaceState(null, '', `#${p.toString()}`);
}
