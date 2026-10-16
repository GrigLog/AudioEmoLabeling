import type { LabelsDoc, TranscriptLine } from '../model/types';

export interface SessionStats {
  segments: number;
  complete: number;
  labeledSeconds: number;
  duration: number;
  listenedUntil: number;
}

export interface SessionRecord {
  key: string;
  audioName: string;
  audioSize: number;
  /** ms since epoch of the last change. */
  updatedAt: number;
  doc: LabelsDoc;
  transcript: { name: string; lines: TranscriptLine[] } | null;
  ui?: { viewStart: number; pxPerSec: number };
  stats: SessionStats;
  audioHandle?: FileSystemFileHandle;
  labelsHandle?: FileSystemFileHandle;
  labelsName?: string;
  /** True when the autosave holds changes not yet written to a labels file. */
  diskDirty?: boolean;
}

export interface PeaksRecord {
  key: string;
  usedAt: number;
  binSamples: number;
  sampleRate: number;
  bins: number;
  min: Int16Array;
  max: Int16Array;
}

export function sessionKey(name: string, size: number): string {
  return `${name}|${size}`;
}

const DB_NAME = 'audio-emo-labeling';
const MAX_PEAK_CACHE = 8;
const LS_PREFIX = 'ael:session:';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('peaks')) db.createObjectStore('peaks', { keyPath: 'key' }).createIndex('usedAt', 'usedAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Where autosaves go: "indexeddb", "localstorage" or "none". */
export async function storageKind(): Promise<'indexeddb' | 'localstorage' | 'none'> {
  if (await openDb()) return 'indexeddb';
  try {
    localStorage.setItem('ael:probe', '1');
    localStorage.removeItem('ael:probe');
    return 'localstorage';
  } catch {
    return 'none';
  }
}

export async function saveSession(rec: SessionRecord): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      await tx(db, 'sessions', 'readwrite', (s) => s.put(rec));
      return;
    } catch {
      // Handles may fail to clone in some browsers; retry without them.
      const { audioHandle: _a, labelsHandle: _l, ...plain } = rec;
      await tx(db, 'sessions', 'readwrite', (s) => s.put(plain));
      return;
    }
  }
  const { audioHandle: _a, labelsHandle: _l, ...plain } = rec;
  try {
    localStorage.setItem(LS_PREFIX + rec.key, JSON.stringify(plain));
  } catch {
    // Storage full or unavailable — the labels file on disk is the source of truth then.
  }
}

export async function getSession(key: string): Promise<SessionRecord | null> {
  const db = await openDb();
  if (db) return (await tx<SessionRecord | undefined>(db, 'sessions', 'readonly', (s) => s.get(key))) ?? null;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  } catch {
    return null;
  }
}

export async function listSessions(): Promise<SessionRecord[]> {
  const db = await openDb();
  let out: SessionRecord[] = [];
  if (db) out = await tx<SessionRecord[]>(db, 'sessions', 'readonly', (s) => s.getAll());
  else {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(LS_PREFIX)) out.push(JSON.parse(localStorage.getItem(k)!) as SessionRecord);
      }
    } catch {
      // ignore
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSession(key: string): Promise<void> {
  const db = await openDb();
  if (db) {
    await tx(db, 'sessions', 'readwrite', (s) => s.delete(key));
    await tx(db, 'peaks', 'readwrite', (s) => s.delete(key));
  } else {
    try {
      localStorage.removeItem(LS_PREFIX + key);
    } catch {
      // ignore
    }
  }
}

export async function getPeaks(key: string): Promise<PeaksRecord | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const rec = await tx<PeaksRecord | undefined>(db, 'peaks', 'readonly', (s) => s.get(key));
    if (!rec) return null;
    rec.usedAt = Date.now();
    void tx(db, 'peaks', 'readwrite', (s) => s.put(rec)).catch(() => {});
    return rec;
  } catch {
    return null;
  }
}

export async function putPeaks(rec: PeaksRecord): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await tx(db, 'peaks', 'readwrite', (s) => s.put(rec));
    const count = await tx<number>(db, 'peaks', 'readonly', (s) => s.count());
    let extra = count - MAX_PEAK_CACHE;
    if (extra > 0) {
      await new Promise<void>((resolve) => {
        const t = db.transaction('peaks', 'readwrite');
        const req = t.objectStore('peaks').index('usedAt').openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur || extra-- <= 0) return;
          cur.delete();
          cur.continue();
        };
        t.oncomplete = () => resolve();
        t.onerror = () => resolve();
      });
    }
  } catch {
    // Cache is best-effort.
  }
}
