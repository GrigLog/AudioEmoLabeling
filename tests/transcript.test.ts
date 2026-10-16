import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { looksLikeTranscript, parseTranscript, TranscriptIndex } from '../src/lib/io/transcript';

describe('transcript', () => {
  it('parses arrays and {segments} wrappers, normalizing fields', () => {
    const lines = parseTranscript({
      segments: [
        { start: '3.5', end: 4, text: ' b ', speaker: 'SPEAKER_01' },
        { id: 7, start: 2, end: 1, text: 'a', author: 'unknown' },
        { start: 'x', end: 1, text: 'skip' },
      ],
    });
    expect(lines).toEqual([
      { id: '7', start: 1, end: 2, text: 'a' },
      { id: 't000001', start: 3.5, end: 4, text: 'b', author: 'SPEAKER_01' },
    ]);
    expect(looksLikeTranscript([{ start: 0, end: 1, text: '' }])).toBe(true);
    expect(looksLikeTranscript({ format: 'audio-emotion-labels', segments: [{ start: 0, end: 1 }] })).toBe(false);
    expect(() => parseTranscript({ nope: 1 })).toThrow();
  });

  it('answers time queries', () => {
    const idx = new TranscriptIndex(
      parseTranscript([
        { start: 0, end: 10, text: 'long' },
        { start: 2, end: 3, text: 'a' },
        { start: 3, end: 4, text: 'b' },
        { start: 20, end: 21, text: 'c' },
      ]),
    );
    expect(idx.at(2.5).map((l) => l.text)).toEqual(['long', 'a']);
    expect(idx.inRange(9, 15).map((l) => l.text)).toEqual(['long']);
    expect(idx.autoText(1.9, 4.1)).toBe('a b');
    expect(idx.autoText(0, 11)).toBe('long a b');
    expect(idx.boundariesIn(2.9, 4)).toEqual([3, 4]);
    expect(idx.lines[idx.currentIndex(3.5)].text).toBe('b');
    expect(idx.currentIndex(15)).toBe(-1);
  });

  const sample = new URL('../transcript_972034.json', import.meta.url);
  it.skipIf(!existsSync(sample))('parses the real sample transcript', () => {
    const data = JSON.parse(readFileSync(sample, 'utf8'));
    expect(looksLikeTranscript(data)).toBe(true);
    const lines = parseTranscript(data);
    expect(lines.length).toBe(659);
    expect(lines[0]).toMatchObject({ id: 's000001', start: 5.39, end: 14.09 });
    expect(lines.every((l) => l.author === undefined)).toBe(true);
    const idx = new TranscriptIndex(lines);
    expect(idx.at(34.5).map((l) => l.id)).toEqual(['s000005']);
  });
});
