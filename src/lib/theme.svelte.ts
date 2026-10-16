import { untrack } from 'svelte';
import type { Theme } from './settings.svelte';

class ThemeState {
  /** Bumped whenever colors change so canvases re-read the palette. */
  version = $state(0);
  effective = $state<'dark' | 'light'>('dark');
  private mq: MediaQueryList | null = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  private chosen: Theme = 'system';

  constructor() {
    this.mq?.addEventListener('change', () => this.apply(this.chosen));
  }

  apply(t: Theme): void {
    this.chosen = t;
    const eff = t === 'system' ? (this.mq && !this.mq.matches ? 'light' : 'dark') : t;
    this.effective = eff;
    document.documentElement.dataset.theme = eff;
    untrack(() => this.version++);
  }
}

export const theme = new ThemeState();
