/**
 * Hotkeys are matched on KeyboardEvent.code (the physical key), so they work the
 * same with any keyboard layout (e.g. Russian ЙЦУКЕН).
 */

export interface Binding {
  code: string;
  shift?: boolean;
  /** Ctrl on Windows/Linux, ⌘ on macOS. */
  mod?: boolean;
  alt?: boolean;
}

export type ActionId =
  | 'playPause'
  | 'seekBack'
  | 'seekFwd'
  | 'seekBackBig'
  | 'seekFwdBig'
  | 'nextSpan'
  | 'prevSpan'
  | 'nextIncomplete'
  | 'prevIncomplete'
  | 'replay'
  | 'loop'
  | 'slower'
  | 'faster'
  | 'emoPositive'
  | 'emoNeutral'
  | 'emoAngry'
  | 'emoSad'
  | 'emoUnclear'
  | 'emoClear'
  | 'spkConsultant'
  | 'spkClient'
  | 'spkUnclear'
  | 'spkNewConsultant'
  | 'spkNewClient'
  | 'spkNewUnclear'
  | 'spkPicker'
  | 'mark'
  | 'split'
  | 'merge'
  | 'delete'
  | 'editText'
  | 'editNote'
  | 'follow'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomSel'
  | 'zoomAll'
  | 'undo'
  | 'redo'
  | 'save'
  | 'open'
  | 'search'
  | 'help'
  | 'escape';

export interface ActionDef {
  id: ActionId;
  label: string;
  group: 'Playback' | 'Navigate' | 'Emotion' | 'Speaker' | 'Edit' | 'View' | 'File';
  keys: Binding[];
}

const k = (code: string, extra: Omit<Binding, 'code'> = {}): Binding => ({ code, ...extra });

export const ACTIONS: ActionDef[] = [
  { id: 'playPause', label: 'Play / pause', group: 'Playback', keys: [k('Space')] },
  { id: 'replay', label: 'Play selected span', group: 'Playback', keys: [k('KeyR')] },
  { id: 'loop', label: 'Loop selected span', group: 'Playback', keys: [k('KeyL')] },
  { id: 'slower', label: 'Slower', group: 'Playback', keys: [k('BracketLeft')] },
  { id: 'faster', label: 'Faster', group: 'Playback', keys: [k('BracketRight')] },

  { id: 'seekBack', label: 'Back (small step)', group: 'Navigate', keys: [k('KeyA'), k('ArrowLeft')] },
  { id: 'seekFwd', label: 'Forward (small step)', group: 'Navigate', keys: [k('KeyD'), k('ArrowRight')] },
  { id: 'seekBackBig', label: 'Back (big step)', group: 'Navigate', keys: [k('KeyA', { shift: true }), k('ArrowLeft', { shift: true })] },
  { id: 'seekFwdBig', label: 'Forward (big step)', group: 'Navigate', keys: [k('KeyD', { shift: true }), k('ArrowRight', { shift: true })] },
  { id: 'nextSpan', label: 'Next span', group: 'Navigate', keys: [k('Tab')] },
  { id: 'prevSpan', label: 'Previous span', group: 'Navigate', keys: [k('Tab', { shift: true })] },
  { id: 'nextIncomplete', label: 'Next unlabeled', group: 'Navigate', keys: [k('KeyG')] },
  { id: 'prevIncomplete', label: 'Previous unlabeled', group: 'Navigate', keys: [k('KeyG', { shift: true })] },

  { id: 'emoPositive', label: 'Positive', group: 'Emotion', keys: [k('Digit1'), k('Numpad1')] },
  { id: 'emoNeutral', label: 'Neutral', group: 'Emotion', keys: [k('Digit2'), k('Numpad2')] },
  { id: 'emoAngry', label: 'Angry', group: 'Emotion', keys: [k('Digit3'), k('Numpad3')] },
  { id: 'emoSad', label: 'Sad', group: 'Emotion', keys: [k('Digit4'), k('Numpad4')] },
  { id: 'emoUnclear', label: 'Unclear', group: 'Emotion', keys: [k('Digit5'), k('Numpad5')] },
  { id: 'emoClear', label: 'Clear emotion', group: 'Emotion', keys: [k('Digit0'), k('Numpad0'), k('Backquote')] },

  { id: 'spkConsultant', label: 'Consultant (current #)', group: 'Speaker', keys: [k('KeyQ')] },
  { id: 'spkClient', label: 'Client (current #)', group: 'Speaker', keys: [k('KeyW')] },
  { id: 'spkUnclear', label: 'Unclear speaker (current #)', group: 'Speaker', keys: [k('KeyE')] },
  { id: 'spkNewConsultant', label: 'New numbered consultant', group: 'Speaker', keys: [k('KeyQ', { shift: true })] },
  { id: 'spkNewClient', label: 'New numbered client', group: 'Speaker', keys: [k('KeyW', { shift: true })] },
  { id: 'spkNewUnclear', label: 'New numbered unclear speaker', group: 'Speaker', keys: [k('KeyE', { shift: true })] },
  { id: 'spkPicker', label: 'Pick speaker…', group: 'Speaker', keys: [k('KeyS')] },

  { id: 'mark', label: 'Mark span start / end at playhead', group: 'Edit', keys: [k('Enter'), k('NumpadEnter')] },
  { id: 'split', label: 'Split span at playhead', group: 'Edit', keys: [k('KeyX')] },
  { id: 'merge', label: 'Merge with next / merge selected', group: 'Edit', keys: [k('KeyM')] },
  { id: 'delete', label: 'Delete selected', group: 'Edit', keys: [k('Delete'), k('Backspace')] },
  { id: 'editText', label: 'Edit text (prefilled from transcript)', group: 'Edit', keys: [k('KeyT')] },
  { id: 'editNote', label: 'Edit note', group: 'Edit', keys: [k('KeyN')] },
  { id: 'undo', label: 'Undo', group: 'Edit', keys: [k('KeyZ', { mod: true })] },
  { id: 'redo', label: 'Redo', group: 'Edit', keys: [k('KeyZ', { mod: true, shift: true }), k('KeyY', { mod: true })] },

  { id: 'follow', label: 'Follow playhead', group: 'View', keys: [k('KeyF')] },
  { id: 'zoomIn', label: 'Zoom in', group: 'View', keys: [k('Equal'), k('NumpadAdd')] },
  { id: 'zoomOut', label: 'Zoom out', group: 'View', keys: [k('Minus'), k('NumpadSubtract')] },
  { id: 'zoomSel', label: 'Zoom to selection', group: 'View', keys: [k('KeyZ')] },
  { id: 'zoomAll', label: 'Zoom to whole recording', group: 'View', keys: [k('KeyZ', { shift: true })] },
  { id: 'search', label: 'Search transcript', group: 'View', keys: [k('KeyF', { mod: true })] },
  { id: 'help', label: 'Keyboard shortcuts', group: 'View', keys: [k('Slash', { shift: true }), k('F1')] },
  { id: 'escape', label: 'Deselect / cancel', group: 'View', keys: [k('Escape')] },

  { id: 'save', label: 'Save labels', group: 'File', keys: [k('KeyS', { mod: true })] },
  { id: 'open', label: 'Open files', group: 'File', keys: [k('KeyO', { mod: true })] },
];

export const ACTION_BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const CODE_NAMES: Record<string, string> = {
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Equal: '=',
  Minus: '−',
  Slash: '/',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Enter: 'Enter',
  NumpadEnter: 'Num Enter',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num −',
  Escape: 'Esc',
  Delete: 'Del',
  Backspace: '⌫',
  Tab: 'Tab',
};

export function codeName(code: string): string {
  if (CODE_NAMES[code]) return CODE_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export function bindingLabel(b: Binding): string {
  if (b.code === 'Slash' && b.shift && !b.mod && !b.alt) return '?';
  const parts: string[] = [];
  if (b.mod) parts.push(isMac ? '⌘' : 'Ctrl');
  if (b.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (b.shift) parts.push(isMac ? '⇧' : 'Shift');
  parts.push(codeName(b.code));
  return parts.join(isMac ? '' : '+');
}

export function sameBinding(a: Binding, b: Binding): boolean {
  return a.code === b.code && !!a.shift === !!b.shift && !!a.mod === !!b.mod && !!a.alt === !!b.alt;
}

const KEY_TO_CODE: Record<string, string> = {
  ' ': 'Space',
  '=': 'Equal',
  '+': 'Equal',
  '-': 'Minus',
  _: 'Minus',
  '[': 'BracketLeft',
  '{': 'BracketLeft',
  ']': 'BracketRight',
  '}': 'BracketRight',
  '`': 'Backquote',
  '~': 'Backquote',
  '/': 'Slash',
  '?': 'Slash',
  '\\': 'Backslash',
  ',': 'Comma',
  '.': 'Period',
  ';': 'Semicolon',
  "'": 'Quote',
  ')': 'Digit0',
  '!': 'Digit1',
  '@': 'Digit2',
  '#': 'Digit3',
  $: 'Digit4',
  '%': 'Digit5',
};
const RU_KEYS = 'йцукенгшщзфывапролдячсмить';
const EN_KEYS = 'qwertyuiopasdfghjklzxcvbnm';

/** Some virtual keyboards and remote sessions send an empty `code`; derive it from `key`. */
function codeOf(e: KeyboardEvent): string {
  if (e.code && e.code !== 'Unidentified') return e.code;
  const k = e.key;
  if (k.length !== 1) return k; // Enter, Escape, ArrowLeft… match their codes
  let c = k.toLowerCase();
  const ru = RU_KEYS.indexOf(c);
  if (ru >= 0) c = EN_KEYS[ru];
  if (c >= 'a' && c <= 'z') return 'Key' + c.toUpperCase();
  if (c >= '0' && c <= '9') return 'Digit' + c;
  return KEY_TO_CODE[c] ?? k;
}

export function eventBinding(e: KeyboardEvent): Binding {
  return { code: codeOf(e), shift: e.shiftKey, mod: isMac ? e.metaKey : e.ctrlKey, alt: e.altKey };
}

export type Keymap = Record<ActionId, Binding[]>;

export function defaultKeymap(): Keymap {
  const m = {} as Keymap;
  for (const a of ACTIONS) m[a.id] = a.keys.map((b) => ({ ...b }));
  return m;
}

export function findAction(map: Keymap, e: KeyboardEvent): ActionId | null {
  const b = eventBinding(e);
  for (const id of Object.keys(map) as ActionId[]) {
    if (map[id].some((x) => sameBinding(x, b))) return id;
  }
  return null;
}

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset'].includes(type);
  }
  return false;
}
