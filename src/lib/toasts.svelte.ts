export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warn' | 'error';
  text: string;
  action?: { label: string; run: () => void };
}

let nextId = 1;

class Toasts {
  list = $state<Toast[]>([]);

  show(text: string, kind: Toast['kind'] = 'info', opts: { action?: Toast['action']; ms?: number } = {}): number {
    const id = nextId++;
    // Collapse identical consecutive toasts (e.g. repeated hotkey presses).
    this.list = [...this.list.filter((t) => t.text !== text), { id, kind, text, action: opts.action }].slice(-4);
    const ms = opts.ms ?? (kind === 'error' ? 8000 : kind === 'warn' ? 6000 : 3000);
    if (ms > 0) setTimeout(() => this.dismiss(id), ms);
    return id;
  }

  dismiss(id: number): void {
    this.list = this.list.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
