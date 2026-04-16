import { toPng } from 'html-to-image';
import type { WalletWrap } from '../core/types';
import { isoDate, shortenAddress } from '../utils/format';
import { TIP_BTC, SITE_URL } from '../config';

/**
 * Generate a 1200x630 PNG "share card" for a completed wrap. Uses an
 * off-screen stage so it doesn't flash over the user's viewport while the
 * exporter walks the DOM.
 */
export async function downloadShareCard(report: WalletWrap): Promise<void> {
  const stage = buildStage(report);
  document.body.appendChild(stage);

  try {
    // Web fonts must be ready, otherwise the capture happens before
    // monospace fonts swap in and text renders blank or misaligned.
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    // Force one layout + paint cycle so html-to-image sees a settled tree.
    stage.getBoundingClientRect();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const dataUrl = await toPng(stage, {
      width: 1200,
      height: 630,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ffffff',
      // The cloned node inherits .share-stage's `position: fixed; left:
      // -10000px`, which would render it outside the SVG foreignObject's
      // own viewport and produce a blank PNG. Neutralize positioning on
      // the clone so the inner content draws at (0,0) inside the canvas.
      style: {
        position: 'static',
        left: '0',
        top: '0',
        margin: '0',
        transform: 'none',
      },
    });

    if (!dataUrl || dataUrl.length < 1024) {
      throw new Error('share image came back empty');
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `chain-wrapped_${shortenAddress(report.subject, 6, 4).replace(/…/g, '_')}_${report.chain.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    stage.remove();
  }
}

/**
 * A short, paste-anywhere text snippet for the wrap. Used by the
 * "copy summary" button so what lands in the clipboard is meaningful
 * even before any platform unfurls the URL into the OG card.
 */
export function buildSummaryText(r: WalletWrap, url: string): string {
  const top = r.findings.slice(0, 3);
  const lines = [
    `chain wrapped · ${r.chain.label.toLowerCase()} · ${shortenAddress(r.subject, 6, 6)}`,
    `profile: ${r.profile.title} · ${r.profile.confidencePct}% confidence`,
    ...top.map((f) => `· ${f.label.toLowerCase()}: ${f.value}`),
    url,
  ];
  return lines.join('\n');
}

/**
 * Twitter/X compose-intent URL pre-filled with a one-line profile and the
 * deep link to this wrap. The platform unfurls the URL into our OG card.
 */
export function buildTweetIntent(r: WalletWrap, url: string): string {
  const text = `${r.chain.label.toLowerCase()} wallet ${shortenAddress(r.subject, 6, 6)} — profile: ${r.profile.title} (${r.profile.confidencePct}%)`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function buildStage(r: WalletWrap): HTMLElement {
  const root = document.createElement('div');
  root.className = 'share-stage';
  root.setAttribute('aria-hidden', 'true');

  const head = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'share-title';
  title.textContent = 'chain wrapped';
  head.appendChild(title);
  const sub = document.createElement('div');
  sub.className = 'share-sub';
  sub.textContent = `${r.chain.label.toLowerCase()} · ${shortenAddress(r.subject, 10, 8)} · ${isoDate(r.generatedAt)}`;
  head.appendChild(sub);
  root.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'share-findings';
  const top = r.findings.slice(0, 6);
  for (const f of top) {
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = f.label;
    const v = document.createElement('div');
    v.className = 'v';
    v.textContent = f.value;
    grid.appendChild(k);
    grid.appendChild(v);
  }
  root.appendChild(grid);

  const footWrap = document.createElement('div');
  const profile = document.createElement('div');
  profile.className = 'share-profile';
  profile.textContent = `profile: ${r.profile.title}  ·  ${r.profile.confidencePct}%`;
  footWrap.appendChild(profile);

  const foot = document.createElement('div');
  foot.className = 'share-foot';
  const left = document.createElement('div');
  left.textContent = SITE_URL;
  const right = document.createElement('div');
  right.textContent = `tip · btc ${shortenAddress(TIP_BTC, 6, 6)}`;
  foot.appendChild(left);
  foot.appendChild(right);
  footWrap.appendChild(foot);

  root.appendChild(footWrap);
  return root;
}
