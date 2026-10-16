<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { settings } from '../lib/settings.svelte';
  import { segmentsAt } from '../lib/model/ops';
  import { speakerShort, speakerLabel } from '../lib/model/speakers';
  import type { Segment, TranscriptLine } from '../lib/model/types';
  import { fmtTime } from '../lib/format';
  import { pickFiles } from '../lib/io/files';

  let query = $state('');
  let searchEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLDivElement | null>(null);
  let userScrollUntil = 0;

  const cover = $derived.by(() => {
    const m = new Map<string, Segment>();
    for (const l of app.transcript) {
      const at = segmentsAt(app.segments, (l.start + l.end) / 2, app.maxDur);
      if (at.length) m.set(l.id, at[0]);
    }
    return m;
  });

  const currentIdx = $derived(app.tindex.currentIndex(app.time));
  const currentId = $derived(currentIdx >= 0 ? app.transcript[currentIdx]?.id : null);

  const q = $derived(query.trim().toLowerCase());
  const shown = $derived(q ? app.transcript.filter((l) => l.text.toLowerCase().includes(q) || cover.get(l.id)?.text?.toLowerCase().includes(q)) : app.transcript);

  $effect(() => {
    if (app.searchToken > 0) {
      void tick().then(() => {
        searchEl?.focus();
        searchEl?.select();
      });
    }
  });

  // Keep the current line in view while playing (unless the user is scrolling the list).
  $effect(() => {
    const id = currentId;
    if (!id || !listEl || !settings.data.follow || q) return;
    if (performance.now() < userScrollUntil) return;
    const row = listEl.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    const r = row.getBoundingClientRect();
    const lr = listEl.getBoundingClientRect();
    if (r.top < lr.top + 40 || r.bottom > lr.bottom - 40) {
      listEl.scrollTop += r.top - lr.top - lr.height / 3;
    }
  });

  function onRowClick(l: TranscriptLine) {
    app.seek(l.start);
    const seg = cover.get(l.id);
    if (seg) app.select([seg.id], { reveal: true });
    else app.clearSelection();
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      query = '';
      searchEl?.blur();
    } else if (e.key === 'Enter') {
      const next = shown.find((l) => l.start > app.time + 0.05) ?? shown[0];
      if (next) onRowClick(next);
    }
  }

  function parts(text: string): { t: string; hit: boolean }[] {
    if (!q) return [{ t: text, hit: false }];
    const out: { t: string; hit: boolean }[] = [];
    const lower = text.toLowerCase();
    let i = 0;
    while (i < text.length) {
      const j = lower.indexOf(q, i);
      if (j < 0) {
        out.push({ t: text.slice(i), hit: false });
        break;
      }
      if (j > i) out.push({ t: text.slice(i, j), hit: false });
      out.push({ t: text.slice(j, j + q.length), hit: true });
      i = j + q.length;
    }
    return out;
  }

  async function addTranscript() {
    const picked = await pickFiles('json');
    if (picked.length) await app.openPicked(picked);
  }
</script>

{#if app.transcript.length === 0}
  <div class="empty">
    <p>No transcript loaded.</p>
    <p class="dim">
      A transcript makes labeling much faster: you see what is said, can create spans from lines, and span texts are prefilled for editing.
    </p>
    <button onclick={addTranscript}>Add transcript JSON…</button>
    <p class="faint small">Format: an array of {'{ "start": 5.39, "end": 14.09, "text": "…" }'} (extra fields like id/author are fine). You can also drop it anywhere.</p>
  </div>
{:else}
  <div class="tools">
    <input
      class="search"
      bind:this={searchEl}
      bind:value={query}
      placeholder="Search transcript… (Ctrl/⌘+F)"
      onkeydown={onSearchKey}
    />
    {#if q}<span class="dim small">{shown.length}</span>{/if}
  </div>
  {#if app.uncovered.length}
    <div class="tools sub">
      <span class="dim small">{app.uncovered.length} of {app.transcript.length} lines have no span</span>
      <span class="spacer"></span>
      <button class="small-btn" onclick={() => app.createDraftsFromTranscript()} title="Create one unlabeled span per uncovered line">Create draft spans</button>
    </div>
  {/if}
  <div class="list" bind:this={listEl} onwheel={() => (userScrollUntil = performance.now() + 4000)}>
    {#each shown as l (l.id)}
      {@const seg = cover.get(l.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="row"
        class:current={l.id === currentId}
        class:target={app.lineTarget?.id === l.id}
        class:selected={seg && app.selSet.has(seg.id)}
        data-id={l.id}
        role="button"
        tabindex="-1"
        style="--c: {seg?.emotion ? `var(--emo-${seg.emotion})` : seg ? 'var(--emo-none)' : 'transparent'}"
        onclick={() => onRowClick(l)}
        ondblclick={() => app.createFromLine(l)}
        title={seg ? app.describeSpan(seg) : 'No span — double-click to create one'}
      >
        <div class="meta">
          <span class="mono faint">{fmtTime(l.start, 0)}</span>
          {#if seg?.speaker}<span class="spk" title={speakerLabel(seg.speaker)}>{speakerShort(seg.speaker)}</span>{/if}
          {#if l.author}<span class="author">{l.author}</span>{/if}
        </div>
        <div class="text">
          {#each parts(l.text) as p, i (i)}{#if p.hit}<mark>{p.t}</mark>{:else}{p.t}{/if}{/each}
          {#if seg?.text && seg.text !== l.text}<div class="mine">✎ {seg.text}</div>{/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .empty {
    padding: 16px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 4px;
  }
  .tools.sub {
    padding-top: 2px;
  }
  .search {
    flex: 1;
  }
  .spacer {
    flex: 1;
  }
  .small {
    font-size: 12px;
  }
  .small-btn {
    font-size: 12px;
    padding: 2px 8px;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0 20px;
  }
  .row {
    display: flex;
    gap: 8px;
    padding: 5px 10px 5px 8px;
    border-left: 4px solid var(--c);
    cursor: pointer;
    content-visibility: auto;
    contain-intrinsic-size: auto 40px;
  }
  .row:hover {
    background: var(--panel-2);
  }
  .row.current {
    background: var(--panel-3);
  }
  .row.selected .text {
    font-weight: 600;
  }
  .row.target {
    outline: 1px dashed var(--accent);
    outline-offset: -1px;
  }
  .meta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 46px;
    flex: none;
    font-size: 11.5px;
  }
  .spk {
    font-size: 11px;
    font-weight: 600;
    padding: 0 4px;
    border-radius: 4px;
    background: var(--panel-3);
  }
  .author {
    font-size: 10.5px;
    color: var(--text-faint);
  }
  .text {
    flex: 1;
    min-width: 0;
    font-size: 13.5px;
    overflow-wrap: anywhere;
  }
  .mine {
    margin-top: 2px;
    color: var(--success);
    font-size: 12.5px;
  }
  mark {
    background: color-mix(in srgb, var(--accent) 45%, transparent);
    color: inherit;
    border-radius: 2px;
  }
</style>
