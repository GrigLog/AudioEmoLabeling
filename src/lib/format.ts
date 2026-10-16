const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** 1:02:03.4 / 2:03.4 — `digits` decimals of seconds. */
export function fmtTime(t: number, digits = 1): string {
  if (!Number.isFinite(t)) return '–';
  const neg = t < 0;
  t = Math.abs(t);
  const scale = 10 ** digits;
  let total = Math.round(t * scale) / scale;
  const h = Math.floor(total / 3600);
  total -= h * 3600;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  let sec = digits > 0 ? s.toFixed(digits) : String(Math.round(s));
  if (s < 10) sec = '0' + sec;
  const body = h > 0 ? `${h}:${pad(m)}:${sec}` : `${m}:${sec}`;
  return neg ? '-' + body : body;
}

/** Parses "1:02:03.5", "2:03", "123.4" into seconds; null when invalid. */
export function parseTime(s: string): number | null {
  const parts = s.trim().replace(',', '.').split(':');
  if (parts.length > 3 || parts.some((p) => p.trim() === '' || !/^\d*\.?\d*$/.test(p.trim()))) return null;
  let t = 0;
  for (const p of parts) t = t * 60 + Number(p);
  return Number.isFinite(t) ? t : null;
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${pad(Math.floor(sec % 60))}s`;
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

export function fmtAgo(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms) / 1000;
  if (d < 10) return 'just now';
  if (d < 60) return `${Math.floor(d)} s ago`;
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
