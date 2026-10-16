import type { Segment } from './types';

/** Minimum span length in seconds; shorter drags are treated as clicks. */
export const MIN_SPAN = 0.05;

export function round3(t: number): number {
  return Math.round(t * 1000) / 1000;
}

let idCounter = 0;
export function newId(): string {
  idCounter = (idCounter + 1) % 1296;
  return Date.now().toString(36).slice(-6) + idCounter.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 5);
}

function byStart(a: Segment, b: Segment): number {
  return a.start - b.start || a.end - b.end;
}

export function sortSegments(segs: Segment[]): Segment[] {
  return segs.sort(byStart);
}

/** Index of the first segment whose start is >= t (segments sorted by start). */
export function lowerBound(segs: readonly Segment[], t: number): number {
  let lo = 0;
  let hi = segs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid].start < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function maxDuration(segs: readonly Segment[]): number {
  let m = 0;
  for (const s of segs) m = Math.max(m, s.end - s.start);
  return m;
}

/** Segments intersecting [t0, t1]. `maxDur` bounds how far back a long span may start. */
export function segmentsInRange(segs: readonly Segment[], t0: number, t1: number, maxDur: number): Segment[] {
  const out: Segment[] = [];
  for (let i = lowerBound(segs, t0 - maxDur); i < segs.length; i++) {
    const s = segs[i];
    if (s.start > t1) break;
    if (s.end >= t0) out.push(s);
  }
  return out;
}

export function segmentsAt(segs: readonly Segment[], t: number, maxDur: number): Segment[] {
  return segmentsInRange(segs, t, t, maxDur).filter((s) => s.start <= t && t < s.end);
}

export function normalizeRange(a: number, b: number, duration: number): [number, number] {
  let s = Math.min(a, b);
  let e = Math.max(a, b);
  s = Math.max(0, s);
  e = Math.min(duration, e);
  return [round3(s), round3(e)];
}

export function insertSegment(segs: readonly Segment[], seg: Segment): Segment[] {
  const out = segs.slice();
  out.splice(lowerBound(out, seg.start), 0, seg);
  // lowerBound ignores `end` ties; a final stable sort keeps the invariant exact.
  return sortSegments(out);
}

export function updateSegments(
  segs: readonly Segment[],
  ids: ReadonlySet<string>,
  patch: (s: Segment) => Segment,
): Segment[] {
  let moved = false;
  const out = segs.map((s) => {
    if (!ids.has(s.id)) return s;
    const n = patch(s);
    if (n.start !== s.start || n.end !== s.end) moved = true;
    return n;
  });
  return moved ? sortSegments(out) : out;
}

export function removeSegments(segs: readonly Segment[], ids: ReadonlySet<string>): Segment[] {
  return segs.filter((s) => !ids.has(s.id));
}

/** Splits a span at t. Text and note stay on the left part. */
export function splitSegment(
  segs: readonly Segment[],
  id: string,
  t: number,
  rightId: string,
): { segments: Segment[]; left: Segment; right: Segment } | null {
  const s = segs.find((x) => x.id === id);
  if (!s) return null;
  t = round3(t);
  if (t - s.start < MIN_SPAN || s.end - t < MIN_SPAN) return null;
  const left: Segment = { ...s, end: t };
  const right: Segment = { id: rightId, start: t, end: s.end, speaker: s.speaker, emotion: s.emotion };
  const out = segs.map((x) => (x.id === id ? left : x));
  return { segments: insertSegment(out, right), left, right };
}

function joinText(parts: (string | undefined)[], sep: string): string | undefined {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return kept.length ? kept.join(sep) : undefined;
}

/** Merges several spans into one covering all of them. The earliest span's labels win when set. */
export function mergeSegments(segs: readonly Segment[], ids: readonly string[]): { segments: Segment[]; merged: Segment } | null {
  const parts = segs.filter((s) => ids.includes(s.id));
  if (parts.length < 2) return null;
  const first = parts[0];
  const merged: Segment = {
    id: first.id,
    start: Math.min(...parts.map((p) => p.start)),
    end: Math.max(...parts.map((p) => p.end)),
    speaker: parts.find((p) => p.speaker !== null)?.speaker ?? null,
    emotion: parts.find((p) => p.emotion !== null)?.emotion ?? null,
  };
  const text = joinText(parts.map((p) => p.text), ' ');
  const note = joinText(parts.map((p) => p.note), '; ');
  if (text !== undefined) merged.text = text;
  if (note !== undefined) merged.note = note;
  const drop = new Set(parts.map((p) => p.id));
  const out = segs.filter((s) => !drop.has(s.id));
  return { segments: insertSegment(out, merged), merged };
}

/** The span that follows `seg` in start order (used by "merge with next"). */
export function nextSegment(segs: readonly Segment[], seg: Segment): Segment | null {
  const i = segs.findIndex((s) => s.id === seg.id);
  return i >= 0 && i + 1 < segs.length ? segs[i + 1] : null;
}

/** Returns t snapped to the nearest candidate within `threshold`, or t itself. */
export function snapTime(t: number, candidates: Iterable<number>, threshold: number): number {
  let best = t;
  let bestD = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - t);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function withField<K extends 'text' | 'note'>(s: Segment, key: K, value: string | undefined): Segment {
  const out = { ...s };
  const v = value?.trim();
  if (v) out[key] = v;
  else delete out[key];
  return out;
}
