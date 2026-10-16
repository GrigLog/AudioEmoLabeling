import { describe, expect, it } from 'vitest';
import { decodeMono, fileReader, readWavInfo } from '../src/lib/audio/wav';
import { makeWav } from './wavfixture';

const ramp = (n: number, k = 1) => Array.from({ length: n }, (_, i) => (((i % 200) - 100) / 100) * k * 0.9);

async function info(bytes: Uint8Array<ArrayBuffer>) {
  const blob = new Blob([bytes]);
  return { blob, info: await readWavInfo(fileReader(blob), blob.size) };
}

describe('readWavInfo', () => {
  it('parses 16-bit mono with an odd-sized extra chunk before data', async () => {
    const bytes = makeWav({ samples: [ramp(1600)], extraChunk: true });
    const { info: i } = await info(bytes);
    expect(i).toMatchObject({ sampleFormat: 'int', bitsPerSample: 16, channels: 1, sampleRate: 16000, frames: 1600, blockAlign: 2 });
    expect(i.duration).toBeCloseTo(0.1);
    expect(i.dataOffset).toBe(12 + 8 + 16 + 8 + 26 + 8);
  });

  it('handles WAVE_FORMAT_EXTENSIBLE float and stereo 24-bit', async () => {
    const f = await info(makeWav({ samples: [ramp(100)], float: true, bits: 32, extensible: true }));
    expect(f.info.sampleFormat).toBe('float');
    const s = await info(makeWav({ samples: [ramp(100), ramp(100, -1)], bits: 24 }));
    expect(s.info).toMatchObject({ channels: 2, bitsPerSample: 24, blockAlign: 6, frames: 100 });
  });

  it('falls back to the file size when the data size is 0 (streamed writers)', async () => {
    const { info: i } = await info(makeWav({ samples: [ramp(500)], zeroDataSize: true }));
    expect(i.frames).toBe(500);
  });

  it('rejects non-WAV input', async () => {
    const blob = new Blob([new TextEncoder().encode('ID3 not a wav file at all')]);
    await expect(readWavInfo(fileReader(blob), blob.size)).rejects.toThrow(/Not a WAV/);
  });
});

describe('decodeMono', () => {
  for (const [name, opts] of [
    ['16-bit', { bits: 16 }],
    ['24-bit', { bits: 24 }],
    ['32-bit int', { bits: 32 }],
    ['8-bit', { bits: 8 }],
    ['float', { bits: 32, float: true }],
  ] as const) {
    it(`decodes ${name} and averages stereo channels`, async () => {
      const a = ramp(400);
      const b = a.map((x) => x * 0.5);
      const { blob, info: i } = await info(makeWav({ samples: [a, b], ...opts }));
      const buf = await blob.slice(i.dataOffset, i.dataOffset + i.dataSize).arrayBuffer();
      const mono = decodeMono(buf, i);
      expect(mono.length).toBe(400);
      const tol = opts.bits === 8 ? 0.02 : 0.001;
      for (const k of [0, 37, 150, 399]) expect(Math.abs(mono[k] - (a[k] + b[k]) / 2)).toBeLessThan(tol);
    });
  }
});
