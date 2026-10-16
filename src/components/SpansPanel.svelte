<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { EMOTIONS, EMOTION_LABEL, isComplete, type Emotion, type Segment } from '../lib/model/types';
  import { speakerLabel } from '../lib/model/speakers';
  import { fmtTime, fmtDuration } from '../lib/format';

  let emo = $state<Set<Emotion | 'none'>>(new Set());
  let speaker = $state('');
  let incomplete = $state(false);
  let withNote = $state(false);
  let withText = $state(false);
  let listEl = $state<HTMLDivElement | null>(null);

  function toggleEmo(e: Emotion | 'none') {
    const n = new Set(emo);
    if (n.has(e)) n.delete(e);
    else n.add(e);
    emo = n;
  }

  const shown = $derived(
    app.segments.filter((s) => {
      if (emo.size && !emo.has(s.emotion ?? 'none')) return false;
      if (speaker) {
        if (speaker === '__none') {
          if (s.speaker) return false;
        } else if (speaker.startsWith('role:')) {
          if (!s.speaker || !(s.speaker === speaker.slice(5) || s.speaker.startsWith(speaker.slice(5) + '_'))) return false;
        } else if (s.speaker !== speaker) return false;
      }
      if (incomplete && isComplete(s)) return false;
      if (withNote && !s.note) return false;
      if (withText && !s.text) return false;
      return true;
    }),
  );
  const total = $derived(shown.reduce((a, s) => a + s.end - s.start, 0));
  const filtered = $derived(emo.size > 0 || !!speaker || incomplete || withNote || withText);

  function open(s: Segment, e: MouseEvent) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) app.toggleSelect(s.id);
    else app.select([s.id], { seek: true });
  }

  $effect(() => {
    const id = app.selection[0];
    if (!id || !listEl) return;
    const row = listEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  });

  function clear() {
    emo = new Set();
    speaker = '';
    incomplete = withNote = withText = false;
  }
</script>

<div class="filters">
  <div class="chips">
    {#each EMOTIONS as e (e)}
      <button class="chip" class:on={emo.has(e)} onclick={() => toggleEmo(e)} title={EMOTION_LABEL[e]}>
        <span class="dot" style="background:var(--emo-{e})"></span>{EMOTION_LABEL[e]}
      </button>
    {/each}
    <button class="chip" class:on={emo.has('none')} onclick={() => toggleEmo('none')}>
      <span class="dot" style="background:var(--emo-none)"></span>none
    </button>
  </div>
  <div class="line">
    <select bind:value={speaker} onchange={(e) => (e.target as HTMLSelectElement).blur()}>
      <option value="">All speakers</option>
      <option value="role:consultant">All consultants</option>
      <option value="role:client">All clients</option>
      <option value="role:unclear">All unclear</option>
      <option value="__none">No speaker</option>
      {#each app.speakers as sp (sp.id)}
        <option value={sp.id}>{speakerLabel(sp.id)}{sp.name ? ` — ${sp.name}` : ''}</option>
      {/each}
    </select>
    <label><input type="checkbox" bind:checked={incomplete} /> unlabeled</label>
    <label><input type="checkbox" bind:checked={withText} /> text</label>
    <label><input type="checkbox" bind:checked={withNote} /> note</label>
  </div>
  <div class="line dim small">
    {shown.length} span{shown.length === 1 ? '' : 's'} · {fmtDuration(total)}
    <span class="spacer"></span>
    {#if filtered}<button class="link" onclick={clear}>clear filters</button>{/if}
    {#if shown.length > 1}
      <button class="link" onclick={() => app.select(shown.map((s) => s.id), { reveal: false })} title="Select all shown spans to label them at once">select all</button>
    {/if}
  </div>
</div>

<div class="list" bind:this={listEl}>
  {#if !app.segments.length}
    <div class="empty dim">No spans yet. Drag on the waveform, press Enter while playing, or create draft spans from the transcript.</div>
  {/if}
  {#each shown as s (s.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="row"
      class:sel={app.selSet.has(s.id)}
      data-id={s.id}
      role="button"
      tabindex="-1"
      style="--c: var(--emo-{s.emotion ?? 'none'})"
      onclick={(e) => open(s, e)}
      ondblclick={() => app.playSpan(s)}
    >
      <div class="top">
        <span class="mono dim">{fmtTime(s.start, 1)}</span>
        <span class="faint mono small">{(s.end - s.start).toFixed(1)}s</span>
        <b class:missing={!s.speaker}>{s.speaker ? speakerLabel(s.speaker) : 'no speaker'}</b>
        <span class:missing={!s.emotion}>{s.emotion ? EMOTION_LABEL[s.emotion] : 'no emotion'}</span>
      </div>
      {#if s.text}<div class="sub">✎ {s.text}</div>{/if}
      {#if s.note}<div class="sub dim">• {s.note}</div>{/if}
    </div>
  {/each}
</div>

<style>
  .filters {
    padding: 8px 10px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-bottom: 1px solid var(--border);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chip {
    font-size: 12px;
    padding: 2px 7px;
    color: var(--text-dim);
  }
  .chip.on {
    color: var(--text);
    border-color: var(--text);
  }
  .line {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 12.5px;
  }
  .line select {
    max-width: 170px;
  }
  label {
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }
  .spacer {
    flex: 1;
  }
  .small {
    font-size: 12px;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    padding: 0 2px;
    font-size: 12px;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 20px;
  }
  .empty {
    padding: 16px;
  }
  .row {
    padding: 5px 10px 5px 8px;
    border-left: 4px solid var(--c);
    cursor: pointer;
    font-size: 13px;
    content-visibility: auto;
    contain-intrinsic-size: auto 30px;
  }
  .row:hover {
    background: var(--panel-2);
  }
  .row.sel {
    background: var(--panel-3);
  }
  .top {
    display: flex;
    gap: 8px;
    align-items: baseline;
  }
  .missing {
    color: var(--accent);
    font-weight: 400;
    font-style: italic;
  }
  .sub {
    font-size: 12.5px;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
