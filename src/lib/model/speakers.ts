import { ROLES, ROLE_LABEL, type Role, type Segment, type Speaker } from './types';

export function speakerId(role: Role, n: number | null): string {
  return n === null ? role : `${role}_${n}`;
}

const ID_RE = /^(consultant|client|unclear)(?:_(\d+))?$/;

export function parseSpeakerId(id: string): { role: Role; n: number | null } | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  return { role: m[1] as Role, n: m[2] !== undefined ? Number(m[2]) : null };
}

export function makeSpeaker(id: string): Speaker | null {
  const p = parseSpeakerId(id);
  return p ? { id, role: p.role, n: p.n } : null;
}

export function speakerLabel(id: string | null): string {
  if (id === null) return '—';
  const p = parseSpeakerId(id);
  if (!p) return id;
  return p.n === null ? ROLE_LABEL[p.role] : `${ROLE_LABEL[p.role]} ${p.n}`;
}

const SHORT: Record<Role, string> = { consultant: 'Co', client: 'Cl', unclear: '?' };

export function speakerShort(id: string | null): string {
  if (id === null) return '—';
  const p = parseSpeakerId(id);
  if (!p) return id;
  return p.n === null ? SHORT[p.role] : `${SHORT[p.role]}${p.n}`;
}

export function roleOf(id: string | null): Role | null {
  return id === null ? null : (parseSpeakerId(id)?.role ?? null);
}

/** Next free instance number for a role, considering both the speaker table and segments. */
export function nextNumber(role: Role, speakers: readonly Speaker[], segments: readonly Segment[]): number {
  let max = 0;
  for (const s of speakers) if (s.role === role && s.n !== null) max = Math.max(max, s.n);
  for (const seg of segments) {
    if (!seg.speaker) continue;
    const p = parseSpeakerId(seg.speaker);
    if (p && p.role === role && p.n !== null) max = Math.max(max, p.n);
  }
  return max + 1;
}

/** Ensures every speaker id used by segments or `extra` exists in the table. Returns the same array when nothing changes. */
export function ensureSpeakers(speakers: Speaker[], ids: Iterable<string | null>): Speaker[] {
  let out = speakers;
  const known = new Set(speakers.map((s) => s.id));
  for (const id of ids) {
    if (id === null || known.has(id)) continue;
    const sp = makeSpeaker(id);
    if (!sp) continue;
    if (out === speakers) out = speakers.slice();
    out.push(sp);
    known.add(id);
  }
  return out === speakers ? speakers : sortSpeakers(out);
}

export function sortSpeakers(list: Speaker[]): Speaker[] {
  return list.sort((a, b) => {
    const r = ROLES.indexOf(a.role) - ROLES.indexOf(b.role);
    if (r !== 0) return r;
    return (a.n ?? 0) - (b.n ?? 0);
  });
}

// Russian ЙЦУКЕН → QWERTY positions, so typing "с12" or "л2" in the picker
// with a Russian layout means the same as "c12" / "k2".
const RU_TO_EN: Record<string, string> = {
  й: 'q', ц: 'w', у: 'e', к: 'r', е: 't', н: 'y', г: 'u', ш: 'i', щ: 'o', з: 'p',
  ф: 'a', ы: 's', в: 'd', а: 'f', п: 'g', р: 'h', о: 'j', л: 'k', д: 'l',
  я: 'z', ч: 'x', с: 'c', м: 'v', и: 'b', т: 'n', ь: 'm',
};

export function normalizeQuery(q: string): string {
  let out = '';
  for (const ch of q.toLowerCase()) out += RU_TO_EN[ch] ?? ch;
  return out.trim();
}

/**
 * Interprets picker input like "c12", "client", "k2", "co 3", "u", "?1", "7".
 * Returns null when the input is not a speaker spec (it may still match nicknames).
 */
export function parseSpeakerQuery(raw: string): { role: Role; n: number | null } | null {
  const q = normalizeQuery(raw).replace(/\s+/g, '');
  if (q === '') return null;
  const m = /^([a-z?]*)(\d+)?$/.exec(q);
  if (!m) return null;
  const word = m[1];
  const n = m[2] !== undefined ? Number(m[2]) : null;
  let role: Role | null = null;
  if (word === '') role = n !== null ? 'client' : null;
  else if (word === '?' || 'unclear'.startsWith(word)) role = 'unclear';
  else if (word === 'k' || 'konsultant'.startsWith(word) || (word.length >= 2 && 'consultant'.startsWith(word))) role = 'consultant';
  else if (word === 'c' || (word.length >= 2 && 'client'.startsWith(word))) role = 'client';
  return role ? { role, n } : null;
}
