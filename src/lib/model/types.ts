export type Emotion = 'positive' | 'neutral' | 'angry' | 'sad' | 'unclear';
export type Role = 'consultant' | 'client' | 'unclear';

export const EMOTIONS: readonly Emotion[] = ['positive', 'neutral', 'angry', 'sad', 'unclear'];
export const ROLES: readonly Role[] = ['consultant', 'client', 'unclear'];

export const EMOTION_LABEL: Record<Emotion, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  angry: 'Angry',
  sad: 'Sad',
  unclear: 'Unclear',
};

export const ROLE_LABEL: Record<Role, string> = {
  consultant: 'Consultant',
  client: 'Client',
  unclear: 'Unclear',
};

/** A speaker is a role plus an optional instance number ("Client", "Client 3"). */
export interface Speaker {
  id: string;
  role: Role;
  n: number | null;
  /** Optional nickname to tell people apart, e.g. "elderly man, router". */
  name?: string;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  speaker: string | null;
  emotion: Emotion | null;
  /** Labeler-written (or labeler-verified) transcript of the span. */
  text?: string;
  note?: string;
}

export interface TranscriptLine {
  id: string;
  start: number;
  end: number;
  text: string;
  author?: string;
}

export interface AudioMeta {
  name: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
}

export type CurrentSpeakers = Record<Role, string>;

export interface Progress {
  position: number;
  listenedUntil: number;
  current: CurrentSpeakers;
}

export const LABELS_FORMAT = 'audio-emotion-labels';
export const LABELS_VERSION = 1;

export interface LabelsDoc {
  format: typeof LABELS_FORMAT;
  version: number;
  audio: AudioMeta;
  transcript?: { name: string; segments: number } | null;
  createdAt: string;
  updatedAt: string;
  app: string;
  speakers: Speaker[];
  segments: Segment[];
  progress: Progress;
}

export function isComplete(s: Segment): boolean {
  return s.speaker !== null && s.emotion !== null;
}
