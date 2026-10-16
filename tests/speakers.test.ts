import { describe, expect, it } from 'vitest';
import {
  ensureSpeakers,
  nextNumber,
  parseSpeakerId,
  parseSpeakerQuery,
  speakerId,
  speakerLabel,
  speakerShort,
} from '../src/lib/model/speakers';

describe('speakers', () => {
  it('builds and parses ids with optional numbers', () => {
    expect(speakerId('client', 3)).toBe('client_3');
    expect(speakerId('client', null)).toBe('client');
    expect(parseSpeakerId('consultant_12')).toEqual({ role: 'consultant', n: 12 });
    expect(parseSpeakerId('unclear')).toEqual({ role: 'unclear', n: null });
    expect(parseSpeakerId('boss_1')).toBeNull();
    expect(speakerLabel('client_3')).toBe('Client 3');
    expect(speakerLabel('consultant')).toBe('Consultant');
    expect(speakerShort('consultant_2')).toBe('Co2');
  });

  it('parses picker queries, including Russian keyboard layout', () => {
    expect(parseSpeakerQuery('c12')).toEqual({ role: 'client', n: 12 });
    expect(parseSpeakerQuery('cl')).toEqual({ role: 'client', n: null });
    expect(parseSpeakerQuery('client 4')).toEqual({ role: 'client', n: 4 });
    expect(parseSpeakerQuery('k2')).toEqual({ role: 'consultant', n: 2 });
    expect(parseSpeakerQuery('co 3')).toEqual({ role: 'consultant', n: 3 });
    expect(parseSpeakerQuery('u')).toEqual({ role: 'unclear', n: null });
    expect(parseSpeakerQuery('?1')).toEqual({ role: 'unclear', n: 1 });
    expect(parseSpeakerQuery('7')).toEqual({ role: 'client', n: 7 });
    expect(parseSpeakerQuery('с5')).toEqual({ role: 'client', n: 5 }); // Cyrillic "с" on the C key
    expect(parseSpeakerQuery('л2')).toEqual({ role: 'consultant', n: 2 }); // "л" on the K key
    expect(parseSpeakerQuery('router')).toBeNull();
    expect(parseSpeakerQuery('')).toBeNull();
  });

  it('computes the next free number and fills the speaker table', () => {
    const segs = [
      { id: 'a', start: 0, end: 1, speaker: 'client_4', emotion: null },
      { id: 'b', start: 1, end: 2, speaker: 'client', emotion: null },
    ];
    expect(nextNumber('client', [{ id: 'client_2', role: 'client', n: 2 }], segs)).toBe(5);
    expect(nextNumber('consultant', [], segs)).toBe(1);
    const t = ensureSpeakers([], ['client_4', 'consultant', null, 'client_4']);
    expect(t.map((s) => s.id)).toEqual(['consultant', 'client_4']);
  });
});
