import {
  EMOTIONS,
  LABELS_FORMAT,
  LABELS_VERSION,
  ROLES,
  type AudioMeta,
  type CurrentSpeakers,
  type Emotion,
  type LabelsDoc,
  type Segment,
  type Speaker,
} from '../model/types';
import { ensureSpeakers, makeSpeaker, parseSpeakerId, sortSpeakers } from '../model/speakers';
import { round3, sortSegments } from '../model/ops';

export const APP_ID = 'audio-emo-labeling 1.0.0';

export function defaultCurrent(): CurrentSpeakers {
  return { consultant: 'consultant', client: 'client', unclear: 'unclear' };
}

export interface DocInput {
  audio: AudioMeta;
  transcript: { name: string; segments: number } | null;
  createdAt: string;
  speakers: readonly Speaker[];
  segments: readonly Segment[];
  position: number;
  listenedUntil: number;
  current: CurrentSpeakers;
}

/** Builds the labels document. Unused speakers are dropped unless they carry a nickname. */
export function buildDoc(input: DocInput, now = new Date()): LabelsDoc {
  const used = new Set<string>();
  for (const s of input.segments) if (s.speaker) used.add(s.speaker);
  const speakers = ensureSpeakers(
    input.speakers.filter((s) => used.has(s.id) || s.name),
    used,
  ).map((s) => {
    const o: Speaker = { id: s.id, role: s.role, n: s.n };
    if (s.name) o.name = s.name;
    return o;
  });
  const segments = input.segments.map((s) => {
    const o: Segment = {
      id: s.id,
      start: round3(s.start),
      end: round3(s.end),
      speaker: s.speaker,
      emotion: s.emotion,
    };
    if (s.text) o.text = s.text;
    if (s.note) o.note = s.note;
    return o;
  });
  return {
    format: LABELS_FORMAT,
    version: LABELS_VERSION,
    audio: { ...input.audio },
    transcript: input.transcript,
    createdAt: input.createdAt,
    updatedAt: now.toISOString(),
    app: APP_ID,
    speakers,
    segments,
    progress: {
      position: round3(input.position),
      listenedUntil: round3(input.listenedUntil),
      current: { ...input.current },
    },
  };
}

/** Pretty JSON with one segment / speaker per line — readable and diff-friendly. */
export function serializeDoc(doc: LabelsDoc): string {
  const lines = (arr: unknown[]) =>
    arr.length === 0 ? '[]' : '[\n' + arr.map((x) => '    ' + JSON.stringify(x)).join(',\n') + '\n  ]';
  const head: Record<string, unknown> = { ...doc };
  delete head.speakers;
  delete head.segments;
  delete head.progress;
  const parts = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  parts.push(`  "progress": ${JSON.stringify(doc.progress)}`);
  parts.push(`  "speakers": ${lines(doc.speakers)}`);
  parts.push(`  "segments": ${lines(doc.segments)}`);
  return '{\n' + parts.join(',\n') + '\n}\n';
}

export function looksLikeLabels(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as Record<string, unknown>).format === LABELS_FORMAT;
}

function fail(msg: string): never {
  throw new Error(`Invalid labels file: ${msg}`);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates and normalizes a parsed labels document. */
export function parseDoc(data: unknown): LabelsDoc {
  if (!looksLikeLabels(data)) fail(`"format" must be "${LABELS_FORMAT}".`);
  const o = data as Record<string, unknown>;
  const version = isNum(o.version) ? o.version : 1;
  if (version > LABELS_VERSION) fail(`version ${version} is newer than this app supports (${LABELS_VERSION}).`);

  const a = (o.audio ?? {}) as Record<string, unknown>;
  if (typeof a.name !== 'string') fail('missing audio.name.');
  const audio: AudioMeta = {
    name: a.name,
    size: isNum(a.size) ? a.size : 0,
    duration: isNum(a.duration) ? a.duration : 0,
    sampleRate: isNum(a.sampleRate) ? a.sampleRate : 0,
    channels: isNum(a.channels) ? a.channels : 0,
  };

  if (!Array.isArray(o.segments)) fail('"segments" must be an array.');
  const ids = new Set<string>();
  const segments: Segment[] = (o.segments as unknown[]).map((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    if (!isNum(s.start) || !isNum(s.end)) fail(`segment #${i + 1} has no numeric start/end.`);
    const emotion = s.emotion ?? null;
    if (emotion !== null && !EMOTIONS.includes(emotion as Emotion)) fail(`segment #${i + 1} has unknown emotion "${String(emotion)}".`);
    const speaker = s.speaker ?? null;
    if (speaker !== null && (typeof speaker !== 'string' || !parseSpeakerId(speaker)))
      fail(`segment #${i + 1} has unknown speaker "${String(speaker)}" (expected e.g. "client", "client_3", "consultant_1", "unclear").`);
    let id = typeof s.id === 'string' && s.id ? s.id : `s${i + 1}`;
    while (ids.has(id)) id += '_';
    ids.add(id);
    const seg: Segment = {
      id,
      start: Math.min(s.start, s.end),
      end: Math.max(s.start, s.end),
      speaker: speaker as string | null,
      emotion: emotion as Emotion | null,
    };
    if (typeof s.text === 'string' && s.text.trim()) seg.text = s.text.trim();
    if (typeof s.note === 'string' && s.note.trim()) seg.note = s.note.trim();
    return seg;
  });

  let speakers: Speaker[] = [];
  if (Array.isArray(o.speakers)) {
    for (const raw of o.speakers as unknown[]) {
      const r = (raw ?? {}) as Record<string, unknown>;
      if (typeof r.id !== 'string') continue;
      const sp = makeSpeaker(r.id);
      if (!sp) continue;
      if (typeof r.name === 'string' && r.name.trim()) sp.name = r.name.trim();
      if (!speakers.some((x) => x.id === sp.id)) speakers.push(sp);
    }
  }
  speakers = sortSpeakers(ensureSpeakers(speakers, segments.map((s) => s.speaker)));

  const p = (o.progress ?? {}) as Record<string, unknown>;
  const cur = (p.current ?? {}) as Record<string, unknown>;
  const current = defaultCurrent();
  for (const role of ROLES) {
    const v = cur[role];
    if (typeof v === 'string' && parseSpeakerId(v)?.role === role) current[role] = v;
  }

  const t = o.transcript as Record<string, unknown> | null | undefined;
  return {
    format: LABELS_FORMAT,
    version: LABELS_VERSION,
    audio,
    transcript: t && typeof t.name === 'string' ? { name: t.name, segments: isNum(t.segments) ? t.segments : 0 } : null,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date(0).toISOString(),
    app: typeof o.app === 'string' ? o.app : APP_ID,
    speakers,
    segments: sortSegments(segments),
    progress: {
      position: isNum(p.position) ? p.position : 0,
      listenedUntil: isNum(p.listenedUntil) ? p.listenedUntil : 0,
      current,
    },
  };
}

/** Human-readable reasons why a labels file may not belong to the opened audio. */
export function audioMismatch(doc: LabelsDoc, audio: AudioMeta): string[] {
  const out: string[] = [];
  if (doc.audio.name !== audio.name) out.push(`it was made for "${doc.audio.name}"`);
  if (doc.audio.size && doc.audio.size !== audio.size) out.push(`file size differs (${doc.audio.size} vs ${audio.size} bytes)`);
  if (doc.audio.duration && Math.abs(doc.audio.duration - audio.duration) > 0.5)
    out.push(`duration differs (${doc.audio.duration.toFixed(1)} s vs ${audio.duration.toFixed(1)} s)`);
  return out;
}
