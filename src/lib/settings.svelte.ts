import { defaultKeymap, type ActionId, type Binding, type Keymap } from './keys';

export type Theme = 'system' | 'dark' | 'light';
export type SideTab = 'transcript' | 'spans' | 'speakers' | 'stats';

interface SettingsData {
  theme: Theme;
  seekSmall: number;
  seekBig: number;
  snap: boolean;
  follow: boolean;
  autoPlayOnTextEdit: boolean;
  autosaveToDisk: boolean;
  /** Seconds after a span ends during which a label key still applies to it. */
  lateWindow: number;
  waveGain: number;
  sideOpen: boolean;
  sideWidth: number;
  sideTab: SideTab;
  keymapOverrides: Partial<Record<ActionId, Binding[]>>;
}

const DEFAULTS: SettingsData = {
  theme: 'system',
  seekSmall: 2,
  seekBig: 10,
  snap: true,
  follow: true,
  autoPlayOnTextEdit: true,
  autosaveToDisk: true,
  lateWindow: 1.5,
  waveGain: 1,
  sideOpen: true,
  sideWidth: 380,
  sideTab: 'transcript',
  keymapOverrides: {},
};

const KEY = 'ael:settings';

function load(): SettingsData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SettingsData>) };
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

class Settings {
  data = $state<SettingsData>(load());

  keymap = $derived.by((): Keymap => {
    const m = defaultKeymap();
    for (const [id, keys] of Object.entries(this.data.keymapOverrides)) {
      if (keys && id in m) m[id as ActionId] = keys;
    }
    return m;
  });

  constructor() {
    $effect.root(() => {
      $effect(() => {
        const snapshot = JSON.stringify(this.data);
        try {
          localStorage.setItem(KEY, snapshot);
        } catch {
          // ignore (private mode etc.)
        }
      });
    });
  }

  setBindings(id: ActionId, keys: Binding[]): void {
    this.data.keymapOverrides = { ...this.data.keymapOverrides, [id]: keys };
  }

  resetKeymap(): void {
    this.data.keymapOverrides = {};
  }

  reset(): void {
    this.data = { ...DEFAULTS };
  }
}

export const settings = new Settings();
