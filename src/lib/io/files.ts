import { looksLikeLabels, parseDoc } from './labels';
import { looksLikeTranscript, parseTranscript } from './transcript';
import type { LabelsDoc, TranscriptLine } from '../model/types';

export interface Picked {
  file: File;
  handle?: FileSystemFileHandle;
}

// Parts of the File System Access API that TypeScript's DOM lib doesn't declare yet.
interface FsaWindow {
  showOpenFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle>;
}
interface PermissionHandle {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}
interface HandleItem {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}

const fsa = (): FsaWindow => window as unknown as FsaWindow;

/** True when the browser can write files in place (Chrome, Edge, Opera). */
export function canSaveInPlace(): boolean {
  return typeof fsa().showSaveFilePicker === 'function';
}

const PICKER_TYPES = [
  {
    description: 'Audio, transcript or labels',
    accept: { 'audio/wav': ['.wav', '.wave'], 'application/json': ['.json'] },
  },
];

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function inputPick(accept: string, multiple: boolean): Promise<Picked[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve([...(input.files ?? [])].map((file) => ({ file })));
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** Opens a file picker for audio/transcript/labels files (any combination). */
export async function pickFiles(accept: 'any' | 'audio' | 'json' = 'any'): Promise<Picked[]> {
  const open = fsa().showOpenFilePicker;
  if (open) {
    try {
      const types =
        accept === 'audio'
          ? [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav', '.wave'] } }]
          : accept === 'json'
            ? [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
            : PICKER_TYPES;
      const handles = await open({ multiple: accept === 'any', types, excludeAcceptAllOption: false });
      return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
    } catch (e) {
      if (isAbort(e)) return [];
      // Some embedded contexts forbid the picker — fall back to a plain input.
    }
  }
  const acc = accept === 'audio' ? '.wav,.wave,audio/wav' : accept === 'json' ? '.json,application/json' : '.wav,.wave,.json,audio/wav,application/json';
  return inputPick(acc, accept === 'any');
}

/** Collects dropped files, with writable handles where the browser provides them. */
export async function filesFromDrop(dt: DataTransfer): Promise<Picked[]> {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  // getAsFileSystemHandle must be called synchronously for every item, before any await.
  const handlePromises = items.map((i) => (i as unknown as HandleItem).getAsFileSystemHandle?.() ?? null);
  const files = items.map((i) => i.getAsFile());
  const out: Picked[] = [];
  for (let k = 0; k < items.length; k++) {
    const file = files[k];
    if (!file) continue;
    let handle: FileSystemFileHandle | undefined;
    try {
      const h = await handlePromises[k];
      if (h && h.kind === 'file') handle = h as FileSystemFileHandle;
    } catch {
      // ignore
    }
    out.push({ file, handle });
  }
  return out;
}

export interface Classified {
  audio?: Picked;
  transcript?: { picked: Picked; lines: TranscriptLine[] };
  labels?: { picked: Picked; doc: LabelsDoc };
  errors: string[];
}

/** Sorts picked files into audio / transcript / labels by extension and content. */
export async function classify(picked: Picked[]): Promise<Classified> {
  const out: Classified = { errors: [] };
  for (const p of picked) {
    const name = p.file.name;
    const lower = name.toLowerCase();
    if (lower.endsWith('.wav') || lower.endsWith('.wave') || p.file.type === 'audio/wav' || p.file.type === 'audio/x-wav') {
      out.audio = p;
      continue;
    }
    if (lower.endsWith('.json') || p.file.type === 'application/json') {
      let data: unknown;
      try {
        data = JSON.parse(await p.file.text());
      } catch (e) {
        out.errors.push(`${name}: not valid JSON (${e instanceof Error ? e.message : e}).`);
        continue;
      }
      try {
        if (looksLikeLabels(data)) out.labels = { picked: p, doc: parseDoc(data) };
        else if (looksLikeTranscript(data)) out.transcript = { picked: p, lines: parseTranscript(data) };
        else out.errors.push(`${name}: neither a labels file nor a transcript (expected an array of {start, end, text}).`);
      } catch (e) {
        out.errors.push(`${name}: ${e instanceof Error ? e.message : e}`);
      }
      continue;
    }
    if (/\.(mp3|m4a|aac|ogg|opus|flac|webm)$/.test(lower)) {
      out.errors.push(`${name}: only WAV audio is supported. Convert it first, e.g. ffmpeg -i "${name}" -ar 16000 -ac 1 out.wav`);
      continue;
    }
    out.errors.push(`${name}: unsupported file type.`);
  }
  return out;
}

export async function hasPermission(handle: FileSystemFileHandle, mode: 'read' | 'readwrite', request: boolean): Promise<boolean> {
  const h = handle as unknown as PermissionHandle;
  if (!h.queryPermission) return true;
  try {
    if ((await h.queryPermission({ mode })) === 'granted') return true;
    if (!request || !h.requestPermission) return false;
    return (await h.requestPermission({ mode })) === 'granted';
  } catch {
    return false;
  }
}

export async function writeToHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

/** Asks where to save (Chrome/Edge). Returns null if cancelled or unsupported. */
export async function pickSaveTarget(suggestedName: string): Promise<FileSystemFileHandle | null> {
  const save = fsa().showSaveFilePicker;
  if (!save) return null;
  try {
    return await save({
      suggestedName,
      types: [{ description: 'Labels JSON', accept: { 'application/json': ['.json'] } }],
    });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

export function downloadText(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function labelsFileName(audioName: string): string {
  return audioName.replace(/\.[^.]+$/, '') + '.labels.json';
}
