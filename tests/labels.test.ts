import { describe, expect, it } from 'vitest';
import { audioMismatch, buildDoc, defaultCurrent, looksLikeLabels, parseDoc, serializeDoc } from '../src/lib/io/labels';
import type { AudioMeta, Segment } from '../src/lib/model/types';

const audio: AudioMeta = { name: 'a.wav', size: 1000, duration: 60, sampleRate: 16000, channels: 1 };
const segments: Segment[] = [
  { id: 's1', start: 1.23456, end: 2, speaker: 'client_3', emotion: 'angry', text: 'Привет', note: 'loud' },
  { id: 's2', start: 3, end: 4, speaker: null, emotion: null },
  { id: 's3', start: 5, end: 6, speaker: 'consultant', emotion: 'neutral' },
];

function doc() {
  return buildDoc(
    {
      audio,
      transcript: { name: 't.json', segments: 10 },
      createdAt: '2026-01-01T00:00:00.000Z',
      speakers: [
        { id: 'client_3', role: 'client', n: 3, name: 'old man' },
        { id: 'client_9', role: 'client', n: 9 }, // unused, no name -> dropped
        { id: 'client_8', role: 'client', n: 8, name: 'kept' }, // unused but named -> kept
      ],
      segments,
      position: 12.3456,
      listenedUntil: 20,
      current: { ...defaultCurrent(), client: 'client_3' },
    },
    new Date('2026-02-02T00:00:00.000Z'),
  );
}

describe('labels file', () => {
  it('round-trips through serialize/parse', () => {
    const d = doc();
    const text = serializeDoc(d);
    const parsed = parseDoc(JSON.parse(text));
    expect(parsed).toEqual(d);
    expect(d.segments[0].start).toBe(1.235);
    expect(d.progress.position).toBe(12.346);
    expect(d.speakers.map((s) => s.id).sort()).toEqual(['client_3', 'client_8', 'consultant']);
    expect(d.speakers.find((s) => s.id === 'consultant')).toEqual({ id: 'consultant', role: 'consultant', n: null });
    expect('text' in d.segments[1]).toBe(false);
    // One segment per line keeps the file readable.
    expect(text.split('\n').filter((l) => l.includes('"start"')).length).toBe(3);
  });

  it('validates content with helpful errors', () => {
    expect(looksLikeLabels({ format: 'audio-emotion-labels' })).toBe(true);
    expect(() => parseDoc({ format: 'x' })).toThrow(/format/);
    const bad = JSON.parse(serializeDoc(doc()));
    bad.segments[0].emotion = 'happy';
    expect(() => parseDoc(bad)).toThrow(/unknown emotion "happy"/);
    bad.segments[0].emotion = 'sad';
    bad.segments[0].speaker = 'boss';
    expect(() => parseDoc(bad)).toThrow(/unknown speaker "boss"/);
    bad.version = 99;
    expect(() => parseDoc(bad)).toThrow(/newer/);
  });

  it('fills defaults, de-duplicates ids and sorts segments', () => {
    const d = parseDoc({
      format: 'audio-emotion-labels',
      audio: { name: 'a.wav' },
      segments: [
        { id: 'x', start: 5, end: 4, speaker: 'client_2', emotion: 'sad' },
        { id: 'x', start: 1, end: 2 },
      ],
    });
    expect(d.segments.map((s) => [s.id, s.start, s.end])).toEqual([
      ['x_', 1, 2],
      ['x', 4, 5],
    ]);
    expect(d.speakers.map((s) => s.id)).toEqual(['client_2']);
    expect(d.progress.current).toEqual(defaultCurrent());
  });

  it('reports audio mismatches', () => {
    expect(audioMismatch(doc(), audio)).toEqual([]);
    expect(audioMismatch(doc(), { ...audio, name: 'b.wav', size: 5 }).length).toBe(2);
  });
});
