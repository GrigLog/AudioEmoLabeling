import { Player } from './audio/player';
import { PeakData, RawCache, startPeaks, type PeakJob } from './audio/peaks';
import { binSamplesFor, binCount } from './audio/peaksCore';
import { fileReader, readWavInfo, type WavInfo } from './audio/wav';
import { History } from './model/history';
import { assignLanes } from './model/lanes';
import {
  MIN_SPAN,
  insertSegment,
  lowerBound,
  maxDuration,
  mergeSegments,
  newId,
  nextSegment,
  normalizeRange,
  removeSegments,
  round3,
  segmentsAt,
  segmentsInRange,
  splitSegment,
  updateSegments,
  withField,
} from './model/ops';
import { ensureSpeakers, nextNumber, parseSpeakerId, speakerId, speakerLabel, sortSpeakers } from './model/speakers';
import {
  EMOTION_LABEL,
  isComplete,
  type AudioMeta,
  type CurrentSpeakers,
  type Emotion,
  type LabelsDoc,
  type Role,
  type Segment,
  type Speaker,
  type TranscriptLine,
} from './model/types';
import {
  canSaveInPlace,
  classify,
  downloadText,
  hasPermission,
  labelsFileName,
  pickFiles,
  pickSaveTarget,
  writeToHandle,
  type Picked,
} from './io/files';
import { audioMismatch, buildDoc, defaultCurrent, serializeDoc } from './io/labels';
import {
  deleteSession,
  getPeaks,
  getSession,
  listSessions,
  putPeaks,
  saveSession,
  sessionKey,
  storageKind,
  type SessionRecord,
} from './io/persist';
import { TranscriptIndex } from './io/transcript';
import { Viewport } from './timeline/view';
import { settings } from './settings.svelte';
import { toasts } from './toasts.svelte';
import { fmtTime } from './format';

interface Snapshot {
  segments: Segment[];
  speakers: Speaker[];
  selection: string[];
}

export interface DialogButton {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

interface DialogReq {
  title: string;
  message: string;
  buttons: DialogButton[];
  resolve: (id: string | null) => void;
}

export interface Recording {
  start: number;
  speaker: string | null;
  emotion: Emotion | null;
}

type LabelKind = 'speaker' | 'emotion';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];

class App {
  // ---- audio ----
  screen = $state<'start' | 'main'>('start');
  audio = $state.raw<AudioMeta | null>(null);
  audioFile: File | null = null;
  audioHandle: FileSystemFileHandle | null = null;
  wav: WavInfo | null = null;
  peaks = $state.raw<PeakData | null>(null);
  raw: RawCache | null = null;
  peaksProgress = $state(0);
  busy = $state<string | null>(null);
  private peakJob: PeakJob | null = null;

  // ---- transcript ----
  transcriptName = $state<string | null>(null);
  transcript = $state.raw<TranscriptLine[]>([]);
  tindex = $derived(new TranscriptIndex(this.transcript));

  // ---- labels ----
  segments = $state.raw<Segment[]>([]);
  speakers = $state.raw<Speaker[]>([]);
  current = $state<CurrentSpeakers>(defaultCurrent());
  createdAt = new Date().toISOString();
  listenedUntil = $state(0);
  lanes = $derived(assignLanes(this.segments));
  maxDur = $derived(maxDuration(this.segments));
  segById = $derived(new Map(this.segments.map((s) => [s.id, s])));
  /** Transcript lines with no span covering their midpoint. */
  uncovered = $derived.by(() => {
    const out: TranscriptLine[] = [];
    for (const l of this.transcript) {
      const mid = (l.start + l.end) / 2;
      if (segmentsAt(this.segments, mid, this.maxDur).length === 0) out.push(l);
    }
    return out;
  });

  // ---- selection ----
  selection = $state.raw<string[]>([]);
  selSet = $derived(new Set(this.selection));
  selected = $derived(this.selection.map((id) => this.segById.get(id)).filter((s): s is Segment => !!s));
  primary = $derived(this.selected.length === 1 ? this.selected[0] : null);
  /** Transcript line under the playhead that has no span yet (labels would create one). */
  lineTarget = $state.raw<TranscriptLine | null>(null);
  private lastActiveId: string | null = null;

  // ---- playback ----
  player = new Player();
  view = new Viewport();
  time = $state(0);
  playing = $state(false);
  rate = $state(1);
  loopOn = $state(false);
  recording = $state.raw<Recording | null>(null);
  private lastTickTime = 0;
  /** Follow-scrolling pauses briefly after the user scrolls the timeline by hand. */
  followPausedUntil = 0;

  // ---- UI ----
  editing = $state<{ kind: 'text' | 'note'; id: string } | null>(null);
  pickerOpen = $state(false);
  helpOpen = $state(false);
  settingsOpen = $state(false);
  searchToken = $state(0);
  dialog = $state.raw<DialogReq | null>(null);
  menu = $state<{ x: number; y: number; id: string } | null>(null);
  dragOver = $state(false);
  pending = $state.raw<{ labels?: { doc: LabelsDoc; picked: Picked }; transcript?: { lines: TranscriptLine[]; name: string } } | null>(null);
  recent = $state.raw<SessionRecord[]>([]);

  // ---- saving ----
  revision = $state(0);
  diskRevision = $state(0);
  autosavedAt = $state<number | null>(null);
  diskSavedAt = $state<number | null>(null);
  labelsHandle = $state.raw<FileSystemFileHandle | null>(null);
  labelsName = $state<string | null>(null);
  diskWritable = $state(false);
  storage = $state<'indexeddb' | 'localstorage' | 'none'>('indexeddb');
  canUndo = $state(false);
  canRedo = $state(false);
  private history = new History<Snapshot>();
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private diskTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<boolean> | null = null;
  private lastPeriodicAutosave = 0;
  private lastDiskReminder = 0;

  constructor() {
    this.player.onStateChange = (p) => {
      this.playing = p;
      if (!p) this.time = this.player.time();
    };
    this.player.onError = (m) => toasts.show(m, 'error');
    // requestAnimationFrame stops in background tabs; timeupdate keeps span-end stops and progress working.
    this.player.el.addEventListener('timeupdate', () => this.tick());
    void storageKind().then((k) => (this.storage = k));
  }

  get dirtyOnDisk(): boolean {
    return this.revision !== this.diskRevision;
  }

  get key(): string | null {
    return this.audio ? sessionKey(this.audio.name, this.audio.size) : null;
  }

  // =====================================================================
  // Loading
  // =====================================================================

  async refreshRecent(): Promise<void> {
    try {
      this.recent = await listSessions();
    } catch {
      this.recent = [];
    }
  }

  async openDialog(): Promise<void> {
    const picked = await pickFiles('any');
    if (picked.length) await this.openPicked(picked);
  }

  /** Entry point for dropped or picked files in any combination. */
  async openPicked(picked: Picked[]): Promise<void> {
    const c = await classify(picked);
    for (const e of c.errors) toasts.show(e, 'error');
    const transcript = c.transcript ? { lines: c.transcript.lines, name: c.transcript.picked.file.name } : undefined;
    if (c.audio) {
      await this.loadAudio(c.audio, c.labels, transcript);
      return;
    }
    if (this.audio) {
      if (transcript) this.setTranscript(transcript.name, transcript.lines);
      if (c.labels) await this.applyLabelsFile(c.labels.doc, c.labels.picked);
      return;
    }
    if (c.labels || transcript) {
      this.pending = {
        labels: c.labels ?? this.pending?.labels,
        transcript: transcript ?? this.pending?.transcript,
      };
      const want = c.labels ? ` "${c.labels.doc.audio.name}"` : '';
      toasts.show(`Now add the audio file${want}.`, 'info', { ms: 6000 });
    }
  }

  private resetState(): void {
    this.peakJob?.cancel();
    this.peakJob = null;
    this.player.unload();
    this.peaks = null;
    this.raw = null;
    this.peaksProgress = 0;
    this.transcript = [];
    this.transcriptName = null;
    this.segments = [];
    this.speakers = [];
    this.current = defaultCurrent();
    this.selection = [];
    this.lineTarget = null;
    this.lastActiveId = null;
    this.recording = null;
    this.editing = null;
    this.listenedUntil = 0;
    this.labelsHandle = null;
    this.labelsName = null;
    this.diskWritable = false;
    this.history.clear();
    this.revision = 0;
    this.diskRevision = 0;
    this.autosavedAt = null;
    this.diskSavedAt = null;
    this.updateUndo();
  }

  async loadAudio(
    picked: Picked,
    labels?: { doc: LabelsDoc; picked: Picked },
    transcript?: { lines: TranscriptLine[]; name: string },
  ): Promise<void> {
    const file = picked.file;
    let info: WavInfo;
    try {
      info = await readWavInfo(fileReader(file), file.size);
    } catch (e) {
      toasts.show(`${file.name}: ${e instanceof Error ? e.message : e}`, 'error');
      return;
    }
    if (this.audio) await this.flushAutosave();
    labels ??= this.pending?.labels;
    transcript ??= this.pending?.transcript;
    this.pending = null;
    this.resetState();

    const meta: AudioMeta = {
      name: file.name,
      size: file.size,
      duration: info.duration,
      sampleRate: info.sampleRate,
      channels: info.channels,
    };
    this.audio = meta;
    this.audioFile = file;
    this.audioHandle = picked.handle ?? null;
    this.wav = info;
    this.player.load(file);
    this.player.rate = this.rate;
    this.view.setDuration(info.duration);
    this.raw = new RawCache(file, info, () => this.view.version++);
    void this.loadPeaks(file, info);

    const key = sessionKey(meta.name, meta.size);
    let rec: SessionRecord | null = null;
    try {
      rec = await getSession(key);
    } catch {
      rec = null;
    }

    let doc: LabelsDoc | null = null;
    let fromFile = false;
    if (labels) {
      const mism = audioMismatch(labels.doc, meta);
      let use = true;
      if (mism.length) {
        const r = await this.ask(
          'Labels file may not match this audio',
          `"${labels.picked.file.name}": ${mism.join('; ')}. Use it anyway?`,
          [
            { id: 'use', label: 'Use labels', primary: true },
            { id: 'skip', label: 'Ignore labels file' },
          ],
        );
        use = r === 'use';
      }
      if (use) {
        doc = labels.doc;
        fromFile = true;
        const fileTime = Date.parse(labels.doc.updatedAt) || 0;
        if (rec && rec.updatedAt > fileTime + 1000 && rec.doc.segments.length > 0) {
          const r = await this.ask(
            'Browser autosave is newer than the labels file',
            `Autosave: ${new Date(rec.updatedAt).toLocaleString()}, ${rec.doc.segments.length} spans.\n` +
              `File "${labels.picked.file.name}": ${fileTime ? new Date(fileTime).toLocaleString() : 'unknown time'}, ${labels.doc.segments.length} spans.`,
            [
              { id: 'auto', label: 'Use autosave', primary: true },
              { id: 'file', label: 'Use file' },
            ],
          );
          if (r === 'auto') {
            doc = rec.doc;
            fromFile = false;
          }
        }
        if (labels.picked.handle) {
          this.labelsHandle = labels.picked.handle;
          this.labelsName = labels.picked.handle.name;
        } else this.labelsName = labels.picked.file.name;
      }
    }
    if (!doc && rec) {
      doc = rec.doc;
      toasts.show(`Restored autosaved session from ${new Date(rec.updatedAt).toLocaleString()} (${rec.doc.segments.length} spans).`, 'success', {
        ms: 5000,
      });
    }
    if (!this.labelsHandle && rec?.labelsHandle) {
      this.labelsHandle = rec.labelsHandle;
      this.labelsName = rec.labelsName ?? rec.labelsHandle.name;
    } else if (!this.labelsName && rec?.labelsName) this.labelsName = rec.labelsName;
    if (this.labelsHandle) this.diskWritable = await hasPermission(this.labelsHandle, 'readwrite', false);
    if (!this.audioHandle && rec?.audioHandle) this.audioHandle = rec.audioHandle;

    if (transcript) this.setTranscript(transcript.name, transcript.lines, false);
    else if (rec?.transcript) this.setTranscript(rec.transcript.name, rec.transcript.lines, false);

    if (doc) this.applyDoc(doc);
    // Unsaved-to-disk state carries over from the autosave.
    const diskDirty = !fromFile && !!rec && doc === rec.doc && rec.diskDirty !== false;
    this.revision = diskDirty ? 1 : 0;
    this.diskRevision = 0;

    if (doc?.transcript?.name && !this.transcriptName) {
      toasts.show(`This session used transcript "${doc.transcript.name}" — drop it here to show it.`, 'info', { ms: 7000 });
    }

    const pos = doc?.progress.position ?? 0;
    this.player.seek(pos);
    this.time = pos;
    if (rec?.ui && doc === rec.doc) this.view.set(rec.ui.viewStart, rec.ui.pxPerSec);
    else {
      this.view.set(0, this.view.width / Math.min(60, info.duration || 60));
      this.view.ensureVisible(pos, 0.2);
    }
    this.screen = 'main';
    this.scheduleAutosave(100);
  }

  private async loadPeaks(file: File, info: WavInfo): Promise<void> {
    const key = sessionKey(file.name, file.size);
    const binSamples = binSamplesFor(info.sampleRate);
    const bins = binCount(info, binSamples);
    const cached = await getPeaks(key);
    if (this.audioFile !== file) return;
    if (cached && cached.binSamples === binSamples && cached.bins === bins && cached.sampleRate === info.sampleRate) {
      this.peaks = new PeakData(info.sampleRate, binSamples, bins, cached.min, cached.max);
      this.peaksProgress = 1;
      this.view.version++;
      return;
    }
    const job = startPeaks(file, info, (f) => {
      this.peaksProgress = f;
      this.view.version++;
    });
    this.peakJob = job;
    this.peaks = job.peaks;
    try {
      await job.done;
      if (this.peakJob !== job) return;
      this.peaksProgress = 1;
      this.view.version++;
      void putPeaks({
        key,
        usedAt: Date.now(),
        binSamples,
        sampleRate: info.sampleRate,
        bins,
        min: job.peaks.base.min,
        max: job.peaks.base.max,
      });
    } catch (e) {
      if (this.peakJob === job) toasts.show(`Waveform failed: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  private applyDoc(doc: LabelsDoc): void {
    this.segments = doc.segments;
    this.speakers = sortSpeakers(ensureSpeakers(doc.speakers.slice(), doc.segments.map((s) => s.speaker)));
    this.current = { ...defaultCurrent(), ...doc.progress.current };
    this.createdAt = doc.createdAt;
    this.listenedUntil = doc.progress.listenedUntil;
    this.selection = [];
  }

  /** Loading a labels file while audio is open replaces the labels (undoable). */
  private async applyLabelsFile(doc: LabelsDoc, picked: Picked): Promise<void> {
    if (!this.audio) return;
    const mism = audioMismatch(doc, this.audio);
    const msgs: string[] = [];
    if (mism.length) msgs.push(`It may not match the open audio: ${mism.join('; ')}.`);
    if (this.segments.length) msgs.push(`The current ${this.segments.length} spans will be replaced (you can undo).`);
    if (msgs.length) {
      const r = await this.ask(`Load "${picked.file.name}"?`, msgs.join('\n'), [
        { id: 'ok', label: `Load ${doc.segments.length} spans`, primary: true },
        { id: 'cancel', label: 'Cancel' },
      ]);
      if (r !== 'ok') return;
    }
    this.history.record(this.snapshot());
    this.applyDoc(doc);
    this.labelsHandle = picked.handle ?? null;
    this.labelsName = picked.handle?.name ?? picked.file.name;
    this.diskWritable = picked.handle ? await hasPermission(picked.handle, 'readwrite', false) : false;
    this.changed();
    this.diskRevision = this.revision;
    toasts.show(`Loaded ${doc.segments.length} spans from "${picked.file.name}".`, 'success');
  }

  setTranscript(name: string, lines: TranscriptLine[], announce = true): void {
    this.transcript = lines;
    this.transcriptName = name;
    if (announce) {
      toasts.show(`Transcript "${name}": ${lines.length} lines.`, 'success');
      this.changed();
    }
    this.view.version++;
  }

  removeTranscript(): void {
    this.transcript = [];
    this.transcriptName = null;
    this.changed();
  }

  async reopen(rec: SessionRecord): Promise<void> {
    let picked: Picked | null = null;
    if (rec.audioHandle) {
      try {
        if (await hasPermission(rec.audioHandle, 'read', true)) {
          const file = await rec.audioHandle.getFile();
          picked = { file, handle: rec.audioHandle };
        }
      } catch {
        picked = null;
      }
    }
    if (!picked) {
      toasts.show(`Select "${rec.audioName}" to continue this session.`, 'info');
      const files = await pickFiles('audio');
      if (!files.length) return;
      picked = files[0];
    }
    if (picked.file.name !== rec.audioName || picked.file.size !== rec.audioSize) {
      const r = await this.ask(
        'Different audio file',
        `The session was for "${rec.audioName}" (${rec.audioSize} bytes), but you picked "${picked.file.name}" (${picked.file.size} bytes). Open it as a separate session?`,
        [
          { id: 'ok', label: 'Open it', primary: true },
          { id: 'cancel', label: 'Cancel' },
        ],
      );
      if (r !== 'ok') return;
    }
    await this.loadAudio(picked);
  }

  async forget(rec: SessionRecord): Promise<void> {
    const r = await this.ask(
      'Forget this session?',
      `Removes the browser autosave for "${rec.audioName}" (${rec.doc.segments.length} spans). Labels files you saved to disk are not affected.`,
      [
        { id: 'del', label: 'Forget', danger: true },
        { id: 'cancel', label: 'Cancel' },
      ],
    );
    if (r !== 'del') return;
    await deleteSession(rec.key);
    await this.refreshRecent();
  }

  async closeAudio(): Promise<void> {
    if (this.dirtyOnDisk) {
      const r = await this.ask('Close this recording?', 'Your work is autosaved in this browser, but the latest changes are not saved to a labels file yet.', [
        { id: 'save', label: 'Save & close', primary: true },
        { id: 'close', label: 'Close anyway' },
        { id: 'cancel', label: 'Cancel' },
      ]);
      if (r === 'cancel' || r === null) return;
      if (r === 'save' && !(await this.save())) return;
    }
    await this.flushAutosave();
    this.resetState();
    this.audio = null;
    this.audioFile = null;
    this.wav = null;
    this.screen = 'start';
    await this.refreshRecent();
  }

  // =====================================================================
  // History / change tracking
  // =====================================================================

  private snapshot(): Snapshot {
    return { segments: this.segments, speakers: this.speakers, selection: this.selection };
  }

  private restore(s: Snapshot): void {
    this.segments = s.segments;
    this.speakers = s.speakers;
    this.selection = s.selection.filter((id) => s.segments.some((x) => x.id === id));
  }

  private updateUndo(): void {
    this.canUndo = this.history.canUndo;
    this.canRedo = this.history.canRedo;
  }

  private changed(): void {
    this.revision++;
    this.updateUndo();
    this.view.version++;
    this.scheduleAutosave();
    this.scheduleDiskSave();
  }

  private commit(segments: Segment[], opts: { selection?: string[]; speakers?: Speaker[]; key?: string | null } = {}): void {
    this.history.record(this.snapshot(), opts.key ?? null);
    this.segments = segments;
    this.speakers = ensureSpeakers(opts.speakers ?? this.speakers, segments.map((s) => s.speaker));
    if (opts.selection) this.selection = opts.selection;
    this.changed();
  }

  undo(): void {
    const prev = this.history.undo(this.snapshot());
    if (!prev) return void toasts.show('Nothing to undo.');
    this.restore(prev);
    this.changed();
  }

  redo(): void {
    const next = this.history.redo(this.snapshot());
    if (!next) return void toasts.show('Nothing to redo.');
    this.restore(next);
    this.changed();
  }

  // =====================================================================
  // Selection
  // =====================================================================

  select(ids: string[], opts: { seek?: boolean; reveal?: boolean } = {}): void {
    this.selection = ids;
    const first = ids.length ? this.segById.get(ids[0]) : undefined;
    if (first) {
      this.lastActiveId = first.id;
      if (opts.seek) this.seek(first.start, false);
      if (opts.reveal !== false) this.view.reveal(first.start, first.end);
    }
    this.view.version++;
  }

  toggleSelect(id: string): void {
    this.selection = this.selSet.has(id) ? this.selection.filter((x) => x !== id) : [...this.selection, id];
    this.view.version++;
  }

  clearSelection(): void {
    this.selection = [];
    this.view.version++;
  }

  // =====================================================================
  // Labeling
  // =====================================================================

  /** Best span among several under the playhead: a selected one, else the lowest lane. */
  private pickAt(at: Segment[]): Segment {
    return at.find((s) => this.selSet.has(s.id)) ?? at.slice().sort((a, b) => (this.lanes.lane.get(a.id) ?? 0) - (this.lanes.lane.get(b.id) ?? 0))[0];
  }

  /** Recently ended span that may still be the user's intended target (late labeling). */
  private recentSpan(t: number): Segment | null {
    const cand = this.primary ?? (this.lastActiveId ? this.segById.get(this.lastActiveId) : undefined);
    if (!cand) return null;
    return t >= cand.end && t - cand.end <= settings.data.lateWindow ? cand : null;
  }

  private uncoveredLineAt(t: number): TranscriptLine | null {
    const lines = this.tindex.at(t);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (segmentsInRange(this.segments, l.start + 0.01, l.end - 0.01, this.maxDur).length === 0) return l;
    }
    return null;
  }

  /** Decides what a label key applies to right now. */
  private resolveTargets(kind: LabelKind): { ids: string[] } | { line: TranscriptLine } | { recording: true } | null {
    if (this.recording) return { recording: true };
    const t = this.player.time();
    const live = this.playing && settings.data.follow;
    if (!live && this.selection.length) return { ids: this.selection };
    const at = segmentsAt(this.segments, t, this.maxDur);
    if (at.length) return { ids: [this.pickAt(at).id] };
    const recent = live ? this.recentSpan(t) : null;
    if (recent && recent[kind] === null) return { ids: [recent.id] };
    const line = this.uncoveredLineAt(t);
    if (line) return { line };
    if (recent) return { ids: [recent.id] };
    if (live && this.selection.length) return { ids: this.selection };
    return null;
  }

  /**
   * Applies a label. Keys resolve their target from the playhead (see resolveTargets);
   * buttons and menus pass `explicit` so they act on the selection the user is looking at.
   */
  private applyLabel(kind: LabelKind, value: string | null, explicit = false): void {
    if (!this.audio) return;
    const target = explicit && this.selection.length && !this.recording ? { ids: this.selection } : this.resolveTargets(kind);
    if (!target) {
      toasts.show('Nothing to label here. Drag on the waveform, press Enter to mark a span, or select one.', 'warn');
      return;
    }
    if ('recording' in target) {
      this.recording = { ...this.recording!, [kind]: value };
      this.view.version++;
      return;
    }
    if ('line' in target) {
      const l = target.line;
      const seg: Segment = { id: newId(), start: round3(l.start), end: round3(l.end), speaker: null, emotion: null };
      if (kind === 'speaker') seg.speaker = value;
      else seg.emotion = value as Emotion | null;
      this.commit(insertSegment(this.segments, seg), { selection: [seg.id] });
      this.lastActiveId = seg.id;
      this.lineTarget = null;
      return;
    }
    const ids = new Set(target.ids);
    const changedAny = this.segments.some((s) => ids.has(s.id) && s[kind] !== value);
    if (!changedAny) return;
    this.commit(
      updateSegments(this.segments, ids, (s) => ({ ...s, [kind]: value })),
      { key: `label:${kind}:${target.ids.join(',')}` },
    );
    if (!this.selection.length || !target.ids.every((id) => this.selSet.has(id))) this.selection = target.ids;
  }

  setEmotion(e: Emotion | null, explicit = false): void {
    this.applyLabel('emotion', e, explicit);
  }

  /** Assigns a speaker; `id` is any speaker id, and becomes the current one for its role. */
  setSpeaker(id: string | null, explicit = false): void {
    if (id) {
      const p = parseSpeakerId(id);
      if (p) this.current[p.role] = id;
    }
    this.applyLabel('speaker', id, explicit);
  }

  speakerKey(role: Role, fresh: boolean, explicit = false): void {
    if (fresh) {
      const id = speakerId(role, nextNumber(role, this.speakers, this.segments));
      this.speakers = ensureSpeakers(this.speakers, [id]);
      toasts.show(`New speaker: ${speakerLabel(id)}`, 'info');
      this.setSpeaker(id, explicit);
    } else this.setSpeaker(this.current[role], explicit);
  }

  setCurrent(role: Role, id: string): void {
    this.current[role] = id;
    this.speakers = ensureSpeakers(this.speakers, [id]);
    this.changed();
  }

  setNickname(id: string, name: string): void {
    const sp = this.speakers.find((s) => s.id === id);
    if (!sp || (sp.name ?? '') === name.trim()) return;
    const speakers = this.speakers.map((s) => {
      if (s.id !== id) return s;
      const o = { ...s };
      if (name.trim()) o.name = name.trim();
      else delete o.name;
      return o;
    });
    this.commit(this.segments, { speakers, key: `nick:${id}` });
  }

  /** Reassigns all spans of `from` to `to` (also used to renumber). */
  mergeSpeaker(from: string, to: string): void {
    if (from === to) return;
    const ids = new Set(this.segments.filter((s) => s.speaker === from).map((s) => s.id));
    const src = this.speakers.find((s) => s.id === from);
    let speakers = ensureSpeakers(this.speakers, [to]).filter((s) => s.id !== from);
    if (src?.name) speakers = speakers.map((s) => (s.id === to && !s.name ? { ...s, name: src.name } : s));
    for (const role of Object.keys(this.current) as Role[]) if (this.current[role] === from) this.current[role] = to;
    this.commit(
      updateSegments(this.segments, ids, (s) => ({ ...s, speaker: to })),
      { speakers },
    );
    toasts.show(`${speakerLabel(from)} → ${speakerLabel(to)} (${ids.size} spans)`, 'success');
  }

  removeSpeaker(id: string): void {
    if (this.segments.some((s) => s.speaker === id)) return;
    this.commit(this.segments, { speakers: this.speakers.filter((s) => s.id !== id) });
  }

  // =====================================================================
  // Span editing
  // =====================================================================

  createSpan(a: number, b: number, labels: Partial<Pick<Segment, 'speaker' | 'emotion'>> = {}): Segment | null {
    if (!this.audio) return null;
    const [start, end] = normalizeRange(a, b, this.audio.duration);
    if (end - start < MIN_SPAN) return null;
    const seg: Segment = { id: newId(), start, end, speaker: labels.speaker ?? null, emotion: labels.emotion ?? null };
    this.commit(insertSegment(this.segments, seg), { selection: [seg.id] });
    this.lastActiveId = seg.id;
    return seg;
  }

  createFromLine(line: TranscriptLine): void {
    const existing = this.segments.find((s) => Math.abs(s.start - line.start) < 0.01 && Math.abs(s.end - line.end) < 0.01);
    if (existing) return this.select([existing.id], { seek: true });
    this.createSpan(line.start, line.end);
  }

  createDraftsFromTranscript(): void {
    const lines = this.uncovered;
    if (!lines.length) return void toasts.show('Every transcript line already has a span.');
    let segs = this.segments.slice();
    for (const l of lines) segs.push({ id: newId(), start: round3(l.start), end: round3(l.end), speaker: null, emotion: null });
    segs = segs.sort((a, b) => a.start - b.start || a.end - b.end);
    this.commit(segs);
    toasts.show(`Created ${lines.length} draft spans from transcript lines. Press G to jump to the next unlabeled one.`, 'success', {
      ms: 6000,
      action: { label: 'Undo', run: () => this.undo() },
    });
  }

  /** Live update of span bounds (drag, inspector fields). */
  setSpanTimes(id: string, start: number, end: number, key: string | null = `times:${id}`): void {
    if (!this.audio) return;
    const [s, e] = normalizeRange(start, end, this.audio.duration);
    if (e - s < MIN_SPAN) return;
    const cur = this.segById.get(id);
    if (!cur || (cur.start === s && cur.end === e)) return;
    this.commit(
      updateSegments(this.segments, new Set([id]), (x) => ({ ...x, start: s, end: e })),
      { key },
    );
  }

  setField(id: string, field: 'text' | 'note', value: string): void {
    const cur = this.segById.get(id);
    if (!cur || (cur[field] ?? '') === value.trim()) return;
    this.commit(
      updateSegments(this.segments, new Set([id]), (x) => withField(x, field, value)),
      { key: `${field}:${id}` },
    );
  }

  /** The span split/merge/text actions operate on. */
  private actionSpan(): Segment | null {
    if (this.primary) return this.primary;
    const at = segmentsAt(this.segments, this.player.time(), this.maxDur);
    return at.length ? this.pickAt(at) : null;
  }

  split(): void {
    const t = this.player.time();
    const at = segmentsAt(this.segments, t, this.maxDur);
    const seg = this.primary && this.primary.start < t && t < this.primary.end ? this.primary : at.length ? this.pickAt(at) : null;
    if (!seg) return void toasts.show('Move the playhead inside a span to split it.', 'warn');
    const r = splitSegment(this.segments, seg.id, t, newId());
    if (!r) return void toasts.show('Too close to the span edge to split.', 'warn');
    this.commit(r.segments, { selection: [r.right.id] });
    this.lastActiveId = r.right.id;
  }

  merge(): void {
    let ids: string[];
    if (this.selection.length >= 2) ids = this.selection;
    else {
      const seg = this.actionSpan();
      if (!seg) return void toasts.show('Select a span to merge with the next one.', 'warn');
      const next = nextSegment(this.segments, seg);
      if (!next) return void toasts.show('There is no next span.', 'warn');
      ids = [seg.id, next.id];
    }
    const r = mergeSegments(this.segments, ids);
    if (!r) return;
    this.commit(r.segments, { selection: [r.merged.id] });
  }

  deleteSelected(): void {
    if (this.recording) return this.cancelRecording();
    const ids = this.selection.length ? this.selection : [];
    if (!ids.length) return void toasts.show('Select spans to delete.', 'warn');
    this.commit(removeSegments(this.segments, new Set(ids)), { selection: [] });
    toasts.show(`Deleted ${ids.length} span${ids.length > 1 ? 's' : ''}.`, 'info', { action: { label: 'Undo', run: () => this.undo() } });
  }

  /** Enter: first press starts a span at the playhead, second press ends it. */
  mark(): void {
    if (!this.audio) return;
    const t = this.player.time();
    if (!this.recording) {
      this.recording = { start: t, speaker: null, emotion: null };
      this.view.version++;
      return;
    }
    const r = this.recording;
    this.recording = null;
    const seg = this.createSpan(r.start, t, { speaker: r.speaker, emotion: r.emotion });
    if (!seg) toasts.show('Span too short — play a bit before pressing Enter again.', 'warn');
  }

  cancelRecording(): void {
    this.recording = null;
    this.view.version++;
  }

  editField(kind: 'text' | 'note'): void {
    let seg = this.actionSpan();
    if (!seg) {
      const line = this.uncoveredLineAt(this.player.time());
      if (line) seg = this.createSpan(line.start, line.end);
      if (!seg) return void toasts.show(`Select a span to edit its ${kind}.`, 'warn');
    }
    if (!this.selSet.has(seg.id) || this.selection.length !== 1) this.selection = [seg.id];
    this.editing = { kind, id: seg.id };
    if (kind === 'text' && settings.data.autoPlayOnTextEdit) this.player.playRange(seg.start, seg.end, false);
  }

  autoText(seg: Segment): string {
    return this.tindex.autoText(seg.start, seg.end);
  }

  // =====================================================================
  // Playback & navigation
  // =====================================================================

  togglePlay(): void {
    if (!this.audio) return;
    this.player.toggle();
  }

  seek(t: number, reveal = true): void {
    if (!this.audio) return;
    t = Math.max(0, Math.min(this.audio.duration, t));
    this.player.seek(t);
    this.time = t;
    this.lastTickTime = t;
    if (reveal) this.view.ensureVisible(t, 0.2);
    this.view.version++;
  }

  seekBy(dt: number): void {
    this.seek(this.player.time() + dt);
  }

  replay(): void {
    const seg = this.actionSpan();
    if (!seg) return void toasts.show('Select a span to play it.', 'warn');
    this.player.playRange(seg.start, seg.end, this.loopOn);
  }

  playSpan(seg: Segment): void {
    this.player.playRange(seg.start, seg.end, this.loopOn);
  }

  toggleLoop(): void {
    this.loopOn = !this.loopOn;
    this.player.setLoop(this.loopOn);
    toasts.show(this.loopOn ? 'Loop on: R / double-click plays the span on repeat.' : 'Loop off.');
    if (this.loopOn && this.primary && !this.playing) this.replay();
  }

  setRate(r: number): void {
    this.rate = r;
    this.player.rate = r;
  }

  stepRate(dir: 1 | -1): void {
    const i = RATES.findIndex((r) => Math.abs(r - this.rate) < 1e-6);
    const j = Math.max(0, Math.min(RATES.length - 1, (i < 0 ? 2 : i) + dir));
    this.setRate(RATES[j]);
    toasts.show(`Speed ${RATES[j]}×`);
  }

  get rates(): number[] {
    return RATES;
  }

  stepSpan(dir: 1 | -1): void {
    if (!this.segments.length) return void toasts.show('No spans yet.');
    let i: number;
    if (this.primary) {
      i = this.segments.indexOf(this.primary) + dir;
    } else {
      const t = this.player.time();
      i = dir > 0 ? lowerBound(this.segments, t + 1e-3) : lowerBound(this.segments, t - 1e-3) - 1;
    }
    if (i < 0 || i >= this.segments.length) return void toasts.show(dir > 0 ? 'Last span.' : 'First span.');
    const seg = this.segments[i];
    this.select([seg.id], { seek: true });
  }

  /** G: jumps to the next span missing a label, or transcript line without a span. */
  stepIncomplete(dir: 1 | -1): void {
    const ref = this.primary ? this.primary.start : this.player.time();
    type Cand = { t: number; seg?: Segment; line?: TranscriptLine };
    let best: Cand | null = null;
    const better = (t: number) => (dir > 0 ? t > ref + 1e-3 && (!best || t < best.t) : t < ref - 1e-3 && (!best || t > best.t));
    for (const s of this.segments) if (!isComplete(s) && better(s.start)) best = { t: s.start, seg: s };
    for (const l of this.uncovered) if (better(l.start)) best = { t: l.start, line: l };
    if (!best) {
      const total = this.segments.filter((s) => !isComplete(s)).length + this.uncovered.length;
      toasts.show(total ? `No more unlabeled items ${dir > 0 ? 'after' : 'before'} this point.` : 'Everything is labeled.', total ? 'info' : 'success');
      return;
    }
    const b = best as Cand;
    if (b.seg) this.select([b.seg.id], { seek: true });
    else if (b.line) {
      this.clearSelection();
      this.seek(b.line.start);
      this.view.reveal(b.line.start, b.line.end);
      this.lineTarget = b.line;
    }
  }

  zoom(factor: number): void {
    const t = this.player.time();
    const x = this.view.timeToX(t);
    this.view.zoomAt(factor, x >= 0 && x <= this.view.width ? x : this.view.width / 2);
  }

  zoomToSelection(): void {
    const sel = this.selected;
    if (!sel.length) return void toasts.show('Select a span to zoom to it.', 'warn');
    this.view.showRange(Math.min(...sel.map((s) => s.start)), Math.max(...sel.map((s) => s.end)));
  }

  toggleFollow(): void {
    settings.data.follow = !settings.data.follow;
    toasts.show(settings.data.follow ? 'Follow playhead: on' : 'Follow playhead: off');
  }

  escape(): void {
    if (this.menu) this.menu = null;
    else if (this.recording) this.cancelRecording();
    else if (this.selection.length) this.clearSelection();
    else if (this.player.looping) {
      this.player.clearRange();
    }
  }

  /** Per-frame update, driven by requestAnimationFrame. */
  tick(): void {
    if (!this.audio) return;
    this.player.tick();
    const t = this.player.time();
    const playing = this.player.playing;
    if (Math.abs(t - this.time) > 0.04 || (!playing && t !== this.time)) this.time = t;
    if (playing) {
      const dt = t - this.lastTickTime;
      if (dt > 0 && dt < 1 && this.lastTickTime <= this.listenedUntil + 0.5 && t - this.listenedUntil > 0.25) this.listenedUntil = t;
      if (settings.data.follow) {
        if (performance.now() > this.followPausedUntil) this.view.ensureVisible(t);
        const at = segmentsAt(this.segments, t, this.maxDur);
        if (at.length) {
          const best = this.pickAt(at);
          if (best.id !== this.lastActiveId || !this.selSet.has(best.id)) {
            if (best.id !== this.lastActiveId) {
              this.selection = [best.id];
              this.view.version++;
            }
            this.lastActiveId = best.id;
          }
          if (this.lineTarget) this.lineTarget = null;
        } else {
          const line = this.uncoveredLineAt(t);
          if (line !== this.lineTarget) this.lineTarget = line;
        }
      }
      if (performance.now() - this.lastPeriodicAutosave > 15000) {
        this.lastPeriodicAutosave = performance.now();
        this.scheduleAutosave(0);
      }
    }
    this.lastTickTime = t;
  }

  // =====================================================================
  // Saving
  // =====================================================================

  buildDoc(): LabelsDoc {
    const a = this.audio!;
    return buildDoc({
      audio: a,
      transcript: this.transcriptName ? { name: this.transcriptName, segments: this.transcript.length } : null,
      createdAt: this.createdAt,
      speakers: this.speakers,
      segments: this.segments,
      position: this.player.time(),
      listenedUntil: this.listenedUntil,
      current: { ...this.current },
    });
  }

  private scheduleAutosave(delay = 600): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.flushAutosave(), delay);
  }

  async flushAutosave(): Promise<void> {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    if (!this.audio || this.storage === 'none') return;
    const doc = this.buildDoc();
    const complete = doc.segments.filter(isComplete);
    const rec: SessionRecord & { diskDirty: boolean } = {
      key: this.key!,
      audioName: this.audio.name,
      audioSize: this.audio.size,
      updatedAt: Date.now(),
      doc,
      transcript: this.transcriptName ? { name: this.transcriptName, lines: this.transcript.slice() } : null,
      ui: { viewStart: this.view.start, pxPerSec: this.view.pxPerSec },
      stats: {
        segments: doc.segments.length,
        complete: complete.length,
        labeledSeconds: complete.reduce((a, s) => a + s.end - s.start, 0),
        duration: this.audio.duration,
        listenedUntil: this.listenedUntil,
      },
      labelsName: this.labelsName ?? undefined,
      diskDirty: this.dirtyOnDisk,
    };
    if (this.audioHandle) rec.audioHandle = this.audioHandle;
    if (this.labelsHandle) rec.labelsHandle = this.labelsHandle;
    try {
      await saveSession($state.snapshot(rec) as typeof rec);
      this.autosavedAt = Date.now();
    } catch (e) {
      console.warn('Autosave failed', e);
    }
  }

  private scheduleDiskSave(): void {
    if (this.diskTimer) clearTimeout(this.diskTimer);
    if (!settings.data.autosaveToDisk || !this.labelsHandle || !this.diskWritable) {
      this.maybeRemindDisk();
      return;
    }
    this.diskTimer = setTimeout(() => void this.save({ silent: true }), 2500);
  }

  private maybeRemindDisk(): void {
    if (canSaveInPlace() && this.labelsHandle) return;
    const now = Date.now();
    const since = this.diskSavedAt ?? this.lastDiskReminder;
    if (!this.lastDiskReminder) this.lastDiskReminder = now;
    if (now - Math.max(since, this.lastDiskReminder) > 10 * 60 * 1000 && this.dirtyOnDisk) {
      this.lastDiskReminder = now;
      toasts.show('Changes are autosaved in this browser. Press Ctrl+S now and then to keep a labels file on disk too.', 'info', {
        ms: 8000,
        action: { label: 'Save now', run: () => void this.save() },
      });
    }
  }

  /** Ctrl+S. Writes in place when possible, otherwise asks for a location or downloads. */
  async save(opts: { as?: boolean; silent?: boolean } = {}): Promise<boolean> {
    if (!this.audio) return false;
    if (this.saving) await this.saving;
    this.saving = this.doSave(opts);
    try {
      return await this.saving;
    } finally {
      this.saving = null;
    }
  }

  private async doSave(opts: { as?: boolean; silent?: boolean }): Promise<boolean> {
    const rev = this.revision;
    const text = serializeDoc(this.buildDoc());
    const suggested = this.labelsName ?? labelsFileName(this.audio!.name);
    try {
      if (!opts.as && this.labelsHandle) {
        if (await hasPermission(this.labelsHandle, 'readwrite', !opts.silent)) {
          await writeToHandle(this.labelsHandle, text);
          this.diskWritable = true;
          this.markDisk(rev);
          if (!opts.silent) toasts.show(`Saved to "${this.labelsHandle.name}".`, 'success');
          return true;
        }
        this.diskWritable = false;
        if (opts.silent) return false;
      }
      if (opts.silent) return false;
      if (canSaveInPlace()) {
        const h = await pickSaveTarget(suggested);
        if (!h) return false;
        await writeToHandle(h, text);
        this.labelsHandle = h;
        this.labelsName = h.name;
        this.diskWritable = true;
        this.markDisk(rev);
        toasts.show(`Saved to "${h.name}". Further changes are written there automatically.`, 'success', { ms: 5000 });
        void this.flushAutosave();
        return true;
      }
      downloadText(text, suggested);
      this.labelsName = suggested;
      this.markDisk(rev);
      toasts.show(`Downloaded "${suggested}".`, 'success');
      return true;
    } catch (e) {
      if (!opts.silent) toasts.show(`Save failed: ${e instanceof Error ? e.message : e}`, 'error');
      else this.diskWritable = false;
      return false;
    }
  }

  private markDisk(rev: number): void {
    this.diskRevision = rev;
    this.diskSavedAt = Date.now();
    void this.flushAutosave();
  }

  downloadCopy(): void {
    if (!this.audio) return;
    const name = labelsFileName(this.audio.name);
    downloadText(serializeDoc(this.buildDoc()), name);
  }

  // =====================================================================
  // Dialogs
  // =====================================================================

  ask(title: string, message: string, buttons: DialogButton[]): Promise<string | null> {
    return new Promise((resolve) => {
      this.dialog?.resolve(null);
      this.dialog = {
        title,
        message,
        buttons,
        resolve: (id) => {
          this.dialog = null;
          resolve(id);
        },
      };
    });
  }

  describeSpan(s: Segment): string {
    return `${fmtTime(s.start)}–${fmtTime(s.end)} · ${speakerLabel(s.speaker)} · ${s.emotion ? EMOTION_LABEL[s.emotion] : 'no emotion'}`;
  }
}

export const app = new App();
