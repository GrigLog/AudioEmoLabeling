import type { TranscriptLine } from '../model/types';

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function asLineArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['segments', 'transcript', 'lines', 'utterances']) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return null;
}

/** True when parsed JSON looks like a transcript (array of {start, end, text}). */
export function looksLikeTranscript(data: unknown): boolean {
  const arr = asLineArray(data);
  if (!arr) return false;
  if (arr.length === 0) return Array.isArray(data);
  const first = arr[0] as Record<string, unknown> | null;
  return !!first && typeof first === 'object' && num(first.start) !== null && num(first.end) !== null && 'text' in first;
}

export function parseTranscript(data: unknown): TranscriptLine[] {
  const arr = asLineArray(data);
  if (!arr) throw new Error('Transcript must be an array of {start, end, text} objects.');
  const out: TranscriptLine[] = [];
  arr.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const o = raw as Record<string, unknown>;
    const start = num(o.start);
    const end = num(o.end);
    if (start === null || end === null) return;
    const line: TranscriptLine = {
      id: typeof o.id === 'string' || typeof o.id === 'number' ? String(o.id) : `t${String(i + 1).padStart(6, '0')}`,
      start: Math.min(start, end),
      end: Math.max(start, end),
      text: typeof o.text === 'string' ? o.text.trim() : '',
    };
    const author = o.author ?? o.speaker;
    if (typeof author === 'string' && author && author.toLowerCase() !== 'unknown') line.author = author;
    out.push(line);
  });
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Fast time lookups over transcript lines (sorted by start). */
export class TranscriptIndex {
  readonly maxDur: number;
  readonly boundaries: number[];

  constructor(readonly lines: readonly TranscriptLine[]) {
    let m = 0;
    for (const l of lines) m = Math.max(m, l.end - l.start);
    this.maxDur = m;
    const b = new Set<number>();
    for (const l of lines) {
      b.add(l.start);
      b.add(l.end);
    }
    this.boundaries = [...b].sort((x, y) => x - y);
  }

  private lowerBound(t: number): number {
    let lo = 0;
    let hi = this.lines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.lines[mid].start < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  inRange(t0: number, t1: number): TranscriptLine[] {
    const out: TranscriptLine[] = [];
    for (let i = this.lowerBound(t0 - this.maxDur); i < this.lines.length; i++) {
      const l = this.lines[i];
      if (l.start > t1) break;
      if (l.end >= t0) out.push(l);
    }
    return out;
  }

  /** Lines containing t. */
  at(t: number): TranscriptLine[] {
    return this.inRange(t, t).filter((l) => l.start <= t && t < l.end);
  }

  /** Index of the line that is current at time t (last line started before t), or -1. */
  currentIndex(t: number): number {
    const hits = this.at(t);
    if (hits.length) return this.lines.indexOf(hits[hits.length - 1]);
    return -1;
  }

  /** Lines whose midpoint falls inside [s, e] — the auto text of a span. */
  linesForSpan(s: number, e: number): TranscriptLine[] {
    return this.inRange(s, e).filter((l) => {
      const mid = (l.start + l.end) / 2;
      return mid >= s && mid <= e;
    });
  }

  autoText(s: number, e: number): string {
    return this.linesForSpan(s, e)
      .map((l) => l.text)
      .filter(Boolean)
      .join(' ');
  }

  /** Boundaries within [t0, t1] for snapping. */
  boundariesIn(t0: number, t1: number): number[] {
    const b = this.boundaries;
    let lo = 0;
    let hi = b.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (b[mid] < t0) lo = mid + 1;
      else hi = mid;
    }
    const out: number[] = [];
    for (let i = lo; i < b.length && b[i] <= t1; i++) out.push(b[i]);
    return out;
  }
}

