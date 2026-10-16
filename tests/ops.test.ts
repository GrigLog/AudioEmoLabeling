import { describe, expect, it } from 'vitest';
import {
  insertSegment,
  lowerBound,
  mergeSegments,
  nextSegment,
  normalizeRange,
  removeSegments,
  segmentsAt,
  segmentsInRange,
  snapTime,
  splitSegment,
  updateSegments,
  withField,
} from '../src/lib/model/ops';
import { assignLanes } from '../src/lib/model/lanes';
import { History } from '../src/lib/model/history';
import type { Segment } from '../src/lib/model/types';

const seg = (id: string, start: number, end: number, extra: Partial<Segment> = {}): Segment => ({
  id,
  start,
  end,
  speaker: null,
  emotion: null,
  ...extra,
});

describe('segment ops', () => {
  const base = [seg('a', 0, 2), seg('b', 3, 5), seg('c', 4, 9)];

  it('keeps segments sorted on insert and update', () => {
    const s = insertSegment(base, seg('x', 3.5, 4));
    expect(s.map((x) => x.id)).toEqual(['a', 'b', 'x', 'c']);
    const u = updateSegments(s, new Set(['a']), (x) => ({ ...x, start: 6, end: 7 }));
    expect(u.map((x) => x.id)).toEqual(['b', 'x', 'c', 'a']);
    expect(lowerBound(u, 4)).toBe(2);
  });

  it('finds spans in range and at a time, including long earlier spans', () => {
    const maxDur = 5;
    expect(segmentsInRange(base, 6, 8, maxDur).map((x) => x.id)).toEqual(['c']);
    expect(segmentsAt(base, 4.5, maxDur).map((x) => x.id)).toEqual(['b', 'c']);
    expect(segmentsAt(base, 2, maxDur)).toEqual([]); // end is exclusive
  });

  it('splits keeping labels; text and note stay left', () => {
    const s = [seg('a', 0, 4, { speaker: 'client_2', emotion: 'angry', text: 'hello there', note: 'n' })];
    const r = splitSegment(s, 'a', 1.5, 'r')!;
    expect(r.left).toMatchObject({ start: 0, end: 1.5, text: 'hello there', note: 'n' });
    expect(r.right).toEqual({ id: 'r', start: 1.5, end: 4, speaker: 'client_2', emotion: 'angry' });
    expect(splitSegment(s, 'a', 0.01, 'r')).toBeNull();
  });

  it('merges spans, first set labels win, texts concatenate', () => {
    const s = [seg('a', 0, 2, { speaker: 'client', text: 'one' }), seg('b', 2.5, 4, { emotion: 'sad', text: 'two', note: 'x' })];
    const r = mergeSegments(s, ['a', 'b'])!;
    expect(r.segments).toHaveLength(1);
    expect(r.merged).toEqual({ id: 'a', start: 0, end: 4, speaker: 'client', emotion: 'sad', text: 'one two', note: 'x' });
    expect(nextSegment(base, base[0])?.id).toBe('b');
    expect(removeSegments(base, new Set(['b'])).map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('normalizes ranges and snaps', () => {
    expect(normalizeRange(5, -1, 4)).toEqual([0, 4]);
    expect(normalizeRange(1.23456, 2.00049, 10)).toEqual([1.235, 2]);
    expect(snapTime(1.02, [0, 1, 2], 0.05)).toBe(1);
    expect(snapTime(1.2, [0, 1, 2], 0.05)).toBe(1.2);
  });

  it('withField trims and removes empty values', () => {
    expect(withField(seg('a', 0, 1), 'text', '  hi ')).toMatchObject({ text: 'hi' });
    expect('note' in withField(seg('a', 0, 1, { note: 'x' }), 'note', '  ')).toBe(false);
  });
});

describe('lanes', () => {
  it('packs overlapping spans into separate lanes', () => {
    const l = assignLanes([seg('a', 0, 5), seg('b', 1, 2), seg('c', 2, 3), seg('d', 5, 6), seg('e', 1.5, 4)]);
    expect(l.lane.get('a')).toBe(0);
    expect(l.lane.get('b')).toBe(1);
    expect(l.lane.get('c')).toBe(1);
    expect(l.lane.get('e')).toBe(2);
    expect(l.lane.get('d')).toBe(0);
    expect(l.count).toBe(3);
    expect(assignLanes([]).count).toBe(1);
  });
});

describe('history', () => {
  it('undoes, redoes and coalesces keyed changes', () => {
    const h = new History<number>(10, 1000);
    h.record(0, null, 0);
    h.record(1, 'k', 100);
    h.record(2, 'k', 500); // coalesced with previous
    expect(h.undo(3)).toBe(1);
    expect(h.undo(1)).toBe(0);
    expect(h.undo(0)).toBeNull();
    expect(h.redo(0)).toBe(1);
    expect(h.redo(1)).toBe(3);
    h.record(3, 'k', 5000); // outside window
    expect(h.canRedo).toBe(false);
  });
});
