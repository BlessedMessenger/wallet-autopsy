/**
 * Append-only terminal log. The scrolling buffer used while a wrap is
 * running. Renders each line as `[hh:mm:ss] text`, optionally with a trailing
 * blinking cursor on the tail line for that live-printing feel.
 */

export class TerminalLog {
  readonly root: HTMLElement;
  private tail: HTMLElement | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'tty';
    this.root.setAttribute('role', 'log');
    this.root.setAttribute('aria-live', 'polite');
    parent.appendChild(this.root);
  }

  line(text: string, kind: 'info' | 'ok' | 'loss' | 'muted' = 'info'): HTMLElement {
    this.clearTail();
    const el = document.createElement('span');
    el.className = `tty-line ${kindClass(kind)}`;
    el.textContent = `[${clock()}] ${text}`;
    this.root.appendChild(el);
    this.tail = el;
    return el;
  }

  raw(text: string): HTMLElement {
    this.clearTail();
    const el = document.createElement('span');
    el.className = 'tty-line';
    el.textContent = text;
    this.root.appendChild(el);
    this.tail = el;
    return el;
  }

  prompt(command: string): HTMLElement {
    this.clearTail();
    const el = document.createElement('span');
    el.className = 'tty-line strong';
    el.innerHTML = '';
    const p = document.createElement('span');
    p.className = 'prompt';
    p.textContent = '$';
    el.appendChild(p);
    const c = document.createTextNode(` ${command}`);
    el.appendChild(c);
    this.root.appendChild(el);
    this.tail = el;
    return el;
  }

  withCursor(): void {
    if (!this.tail) return;
    const existing = this.tail.querySelector('.cursor');
    if (existing) return;
    const c = document.createElement('span');
    c.className = 'cursor';
    c.setAttribute('aria-hidden', 'true');
    this.tail.appendChild(c);
  }

  clear(): void {
    this.root.textContent = '';
    this.tail = null;
  }

  private clearTail(): void {
    if (!this.tail) return;
    const cursor = this.tail.querySelector('.cursor');
    cursor?.remove();
    this.tail = null;
  }
}

function kindClass(k: 'info' | 'ok' | 'loss' | 'muted'): string {
  switch (k) {
    case 'ok':
      return 'ok';
    case 'loss':
      return 'loss';
    case 'muted':
      return 'muted';
    default:
      return '';
  }
}

function clock(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
