import type { WalletWrap } from '../core/types';
import { humanDuration, isoDateTime, shortenAddress } from '../utils/format';

/**
 * Renders a finished wrap as plain, selectable DOM. Deliberately not a
 * slideshow — screenshotable as one piece and copy-pasteable as text.
 */
export function renderReport(target: HTMLElement, report: WalletWrap): void {
  target.textContent = '';

  const root = document.createElement('section');
  root.className = 'report';
  root.setAttribute('aria-label', 'wallet wrap');

  root.appendChild(buildHeader(report));
  root.appendChild(buildFindings(report));
  root.appendChild(buildProfile(report));

  target.appendChild(root);
}

function buildHeader(r: WalletWrap): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = 'wallet wrap';
  card.appendChild(title);

  const ageMs = Date.now() - r.generatedAt;
  const cacheTag =
    ageMs > 60_000
      ? ` <span class="muted">(cached · ${escape(briefAgo(ageMs))} ago)</span>`
      : '';
  const sampleTag = r.facts.feesSampled
    ? ` <span class="muted">(fees sampled)</span>`
    : '';

  const kv = document.createElement('dl');
  kv.className = 'kv';
  kv.innerHTML = `
    <dt>subject</dt><dd>${escape(shortenAddress(r.subject, 8, 8))}</dd>
    <dt>chain</dt><dd>${escape(r.chain.label.toLowerCase())}${sampleTag}</dd>
    <dt>data as of</dt><dd>${escape(isoDateTime(r.generatedAt))}${cacheTag}</dd>
  `;
  card.appendChild(kv);

  return card;
}

function briefAgo(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return humanDuration(Math.floor(h / 24));
}

function buildFindings(r: WalletWrap): HTMLElement {
  const ol = document.createElement('ol');
  ol.className = 'findings';

  for (const f of r.findings) {
    const li = document.createElement('li');
    li.className = 'finding';

    const id = document.createElement('span');
    id.className = 'finding-id';
    id.textContent = `[${f.id}]`;
    li.appendChild(id);

    const head = document.createElement('div');
    head.className = 'finding-head';

    const label = document.createElement('div');
    label.className = 'finding-label';
    label.textContent = f.label;
    head.appendChild(label);

    const value = document.createElement('div');
    value.className = 'finding-value';
    value.textContent = f.value;
    head.appendChild(value);

    li.appendChild(head);

    const comment = document.createElement('p');
    comment.className = 'finding-comment';
    comment.textContent = f.commentary;
    li.appendChild(comment);

    if (f.citation) {
      const cite = document.createElement('p');
      cite.className = 'finding-cite';
      const a = document.createElement('a');
      a.href = f.citation.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = `↪ ${f.citation.label}`;
      cite.appendChild(a);
      li.appendChild(cite);
    }

    ol.appendChild(li);
  }

  return ol;
}

function buildProfile(r: WalletWrap): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = 'profile';
  card.appendChild(title);

  const line1 = document.createElement('p');
  line1.innerHTML = `<strong>${escape(r.profile.title)}</strong> <span class="muted">· ${r.profile.confidencePct}% confidence</span>`;
  card.appendChild(line1);

  const line2 = document.createElement('p');
  line2.textContent = r.profile.commentary;
  card.appendChild(line2);

  const confNote = document.createElement('p');
  confNote.className = 'muted small';
  confNote.textContent =
    'confidence is the weight of the top-scoring profile rule against every other rule this wallet matched.';
  card.appendChild(confNote);

  const line3 = document.createElement('p');
  line3.className = 'muted';
  line3.textContent = r.facts.feesSampled
    ? `data as of ${isoDateTime(r.generatedAt)}. totals marked "~" are extrapolated from the most recent sample — the wallet's full history exceeds what public explorers hand out in one call.`
    : `data as of ${isoDateTime(r.generatedAt)}. covers the wallet's full on-chain history on this chain.`;
  card.appendChild(line3);

  return card;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
