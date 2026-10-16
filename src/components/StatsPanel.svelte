<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { EMOTIONS, EMOTION_LABEL, ROLES, ROLE_LABEL, isComplete } from '../lib/model/types';
  import { roleOf } from '../lib/model/speakers';
  import { fmtDuration } from '../lib/format';

  const s = $derived.by(() => {
    const segs = app.segments;
    const emo = new Map<string, { n: number; d: number }>();
    const role = new Map<string, { n: number; d: number }>();
    let labeled = 0;
    let complete = 0;
    let withText = 0;
    let withNote = 0;
    for (const x of segs) {
      const d = x.end - x.start;
      labeled += d;
      if (isComplete(x)) complete++;
      if (x.text) withText++;
      if (x.note) withNote++;
      const ek = x.emotion ?? 'none';
      const e = emo.get(ek) ?? { n: 0, d: 0 };
      e.n++;
      e.d += d;
      emo.set(ek, e);
      const rk = roleOf(x.speaker) ?? 'none';
      const r = role.get(rk) ?? { n: 0, d: 0 };
      r.n++;
      r.d += d;
      role.set(rk, r);
    }
    const lines = app.transcript.length;
    const covered = lines - app.uncovered.length;
    return { labeled, complete, withText, withNote, emo, role, lines, covered, total: segs.length };
  });

  const dur = $derived(app.audio?.duration ?? 0);
  const maxEmo = $derived(Math.max(1e-9, ...[...s.emo.values()].map((v) => v.d)));
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
</script>

<div class="wrap">
  <div class="kpis">
    <div class="kpi">
      <div class="v">{s.total}</div>
      <div class="k">spans</div>
    </div>
    <div class="kpi">
      <div class="v">{pct(s.complete, s.total)}%</div>
      <div class="k">fully labeled ({s.complete})</div>
    </div>
    <div class="kpi">
      <div class="v">{fmtDuration(s.labeled)}</div>
      <div class="k">in spans</div>
    </div>
    <div class="kpi">
      <div class="v">{pct(app.listenedUntil, dur)}%</div>
      <div class="k">listened ({fmtDuration(app.listenedUntil)})</div>
    </div>
  </div>

  {#if s.lines}
    <h4>Transcript coverage</h4>
    <div class="bar"><div style="width:{pct(s.covered, s.lines)}%"></div></div>
    <div class="dim small">{s.covered} of {s.lines} lines inside a span ({pct(s.covered, s.lines)}%)</div>
    {#if app.uncovered.length}
      <button class="small-btn" onclick={() => app.stepIncomplete(1)}>Go to next unlabeled (G)</button>
    {/if}
  {/if}

  <h4>Emotions</h4>
  {#each [...EMOTIONS, 'none' as const] as e (e)}
    {@const v = s.emo.get(e)}
    {#if v}
      <div class="erow">
        <span class="name"><span class="dot" style="background:var(--emo-{e})"></span>{e === 'none' ? 'no emotion' : EMOTION_LABEL[e]}</span>
        <div class="hbar"><div style="width:{(v.d / maxEmo) * 100}%;background:var(--emo-{e})"></div></div>
        <span class="num mono">{v.n} · {fmtDuration(v.d)}</span>
      </div>
    {/if}
  {/each}

  <h4>Speakers</h4>
  {#each [...ROLES, 'none' as const] as r (r)}
    {@const v = s.role.get(r)}
    {#if v}
      <div class="erow">
        <span class="name">{r === 'none' ? 'no speaker' : ROLE_LABEL[r]}</span>
        <span class="num mono">{v.n} spans · {fmtDuration(v.d)}</span>
      </div>
    {/if}
  {/each}
  <div class="dim small">
    {app.speakers.filter((x) => x.role === 'client' && x.n !== null).length} numbered clients ·
    {app.speakers.filter((x) => x.role === 'consultant' && x.n !== null).length} numbered consultants
  </div>

  <h4>Extras</h4>
  <div class="dim small">{s.withText} spans with your text · {s.withNote} with notes</div>
</div>

<style>
  .wrap {
    overflow-y: auto;
    padding: 10px 12px 20px;
    flex: 1;
  }
  .kpis {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .kpi {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .v {
    font-size: 20px;
    font-weight: 700;
  }
  .k {
    font-size: 12px;
    color: var(--text-dim);
  }
  h4 {
    margin: 16px 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-faint);
  }
  .small {
    font-size: 12px;
  }
  .small-btn {
    margin-top: 6px;
    font-size: 12px;
    padding: 2px 8px;
  }
  .bar {
    height: 6px;
    background: var(--panel-3);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 4px;
  }
  .bar div {
    height: 100%;
    background: var(--accent);
  }
  .erow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    margin: 3px 0;
  }
  .name {
    width: 96px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }
  .hbar {
    flex: 1;
    height: 8px;
    background: var(--panel-3);
    border-radius: 4px;
    overflow: hidden;
  }
  .hbar div {
    height: 100%;
    border-radius: 4px;
  }
  .num {
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
  }
</style>
