import { app } from './app.svelte';
import type { ActionId } from './keys';
import { settings } from './settings.svelte';

/** What each hotkey does. Kept separate from the keymap so keys can be remapped. */
export const RUN: Record<ActionId, () => void> = {
  playPause: () => app.togglePlay(),
  seekBack: () => app.seekBy(-settings.data.seekSmall),
  seekFwd: () => app.seekBy(settings.data.seekSmall),
  seekBackBig: () => app.seekBy(-settings.data.seekBig),
  seekFwdBig: () => app.seekBy(settings.data.seekBig),
  nextSpan: () => app.stepSpan(1),
  prevSpan: () => app.stepSpan(-1),
  nextIncomplete: () => app.stepIncomplete(1),
  prevIncomplete: () => app.stepIncomplete(-1),
  replay: () => app.replay(),
  loop: () => app.toggleLoop(),
  slower: () => app.stepRate(-1),
  faster: () => app.stepRate(1),
  emoPositive: () => app.setEmotion('positive'),
  emoNeutral: () => app.setEmotion('neutral'),
  emoAngry: () => app.setEmotion('angry'),
  emoSad: () => app.setEmotion('sad'),
  emoUnclear: () => app.setEmotion('unclear'),
  emoClear: () => app.setEmotion(null),
  spkConsultant: () => app.speakerKey('consultant', false),
  spkClient: () => app.speakerKey('client', false),
  spkUnclear: () => app.speakerKey('unclear', false),
  spkNewConsultant: () => app.speakerKey('consultant', true),
  spkNewClient: () => app.speakerKey('client', true),
  spkNewUnclear: () => app.speakerKey('unclear', true),
  spkPicker: () => (app.pickerOpen = true),
  mark: () => app.mark(),
  split: () => app.split(),
  merge: () => app.merge(),
  delete: () => app.deleteSelected(),
  editText: () => app.editField('text'),
  editNote: () => app.editField('note'),
  follow: () => app.toggleFollow(),
  zoomIn: () => app.zoom(1.6),
  zoomOut: () => app.zoom(1 / 1.6),
  zoomSel: () => app.zoomToSelection(),
  zoomAll: () => app.view.zoomAll(),
  undo: () => app.undo(),
  redo: () => app.redo(),
  save: () => void app.save(),
  open: () => void app.openDialog(),
  search: () => {
    settings.data.sideOpen = true;
    settings.data.sideTab = 'transcript';
    app.searchToken++;
  },
  help: () => (app.helpOpen = !app.helpOpen),
  escape: () => app.escape(),
};

/** Actions that make sense before any audio is loaded. */
export const GLOBAL_ACTIONS = new Set<ActionId>(['open', 'help', 'escape']);
