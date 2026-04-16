/**
 * Minimal typewriter helper. Writes characters into a node at a steady pace,
 * honors `prefers-reduced-motion` by snapping instantly, and supports an
 * abort signal so we can cancel an in-flight typewriter when the user runs
 * another wrap.
 */

interface TypeOptions {
  speedMs?: number;
  signal?: AbortSignal;
  onDone?: () => void;
}

export function type(node: HTMLElement, text: string, opts: TypeOptions = {}): Promise<void> {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const speed = opts.speedMs ?? 14;

  if (reduced || speed <= 0) {
    node.textContent = text;
    opts.onDone?.();
    return Promise.resolve();
  }

  node.textContent = '';
  return new Promise<void>((resolve) => {
    let i = 0;
    const step = () => {
      if (opts.signal?.aborted) {
        node.textContent = text;
        resolve();
        return;
      }
      node.textContent = text.slice(0, ++i);
      if (i < text.length) {
        setTimeout(step, speed);
      } else {
        opts.onDone?.();
        resolve();
      }
    };
    step();
  });
}

export function makeCursor(): HTMLSpanElement {
  const c = document.createElement('span');
  c.className = 'cursor';
  c.setAttribute('aria-hidden', 'true');
  return c;
}
