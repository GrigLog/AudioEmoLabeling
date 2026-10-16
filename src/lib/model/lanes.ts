import type { Segment } from './types';

export interface LaneLayout {
  lane: Map<string, number>;
  count: number;
}

/** Greedy interval packing: each span goes to the first lane that is free at its start. */
export function assignLanes(segs: readonly Segment[]): LaneLayout {
  const lane = new Map<string, number>();
  const ends: number[] = [];
  for (const s of segs) {
    let i = 0;
    while (i < ends.length && ends[i] > s.start + 1e-6) i++;
    ends[i] = s.end;
    lane.set(s.id, i);
  }
  return { lane, count: Math.max(1, ends.length) };
}
