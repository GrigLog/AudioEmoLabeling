<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { normalizeQuery, parseSpeakerQuery, speakerId, speakerLabel, speakerShort } from '../lib/model/speakers';
  import { ROLES } from '../lib/model/types';

  let query = $state('');
  let index = $state(0);
  let input: HTMLInputElement;

  interface Opt {
    id: string;
    label: string;
    hint: string;
  }

  /** Distance from the playhead to the speaker's nearest span — nearby speakers come first. */
  const proximity = $derived.by(() => {
    const t = app.time;
    const m = new Map<string, number>();
    for (const s of app.segments) {
      if (!s.speaker) continue;
      const d = t < s.start ? s.start - t : t > s.end ? t - s.end : 0;
      m.set(s.speaker, Math.min(m.get(s.speaker) ?? Infinity, d));
    }
    return m;
  });

  const options = $derived.by((): Opt[] => {
    const q = normalizeQuery(query);
    const out: Opt[] = [];
    const seen = new Set<string>();
    const add = (id: string, hint = '') => {
      if (seen.has(id)) return;
      seen.add(id);
      const sp = app.speakers.find((s) => s.id === id);
      out.push({ id, label: speakerLabel(id) + (sp?.name ? ` — ${sp.name}` : ''), hint });
    };
    const spec = parseSpeakerQuery(query);
    if (spec) {
      const id = speakerId(spec.role, spec.n);
      add(id, app.speakers.some((s) => s.id === id) || proximity.has(id) ? '' : 'new');
    }
    const all = [...new Set([...app.speakers.map((s) => s.id), ...ROLES])];
    all.sort((a, b) => (proximity.get(a) ?? Infinity) - (proximity.get(b) ?? Infinity));
    for (const id of all) {
      if (q) {
        const sp = app.speakers.find((s) => s.id === id);
        const hay = normalizeQuery(`${speakerLabel(id)} ${speakerShort(id)} ${id} ${sp?.name ?? ''}`);
        const raw = `${sp?.name ?? ''}`.toLowerCase();
        if (!hay.includes(q) && !raw.includes(query.trim().toLowerCase())) continue;
      }
      const d = proximity.get(id);
      add(id, d === 0 ? 'here' : d !== undefined && d < 120 ? 'nearby' : '');
    }
    return out.slice(0, 30);
  });

  $effect(() => {
    void query;
    index = 0;
  });

  onMount(() => input.focus());

  function choose(o: Opt | undefined) {
    if (!o) return;
    app.pickerOpen = false;
    app.setSpeaker(o.id, true);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      app.pickerOpen = false;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.min(options.length - 1, index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = Math.max(0, index - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(options[index]);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => (app.pickerOpen = false)}>
  <div class="picker" onclick={(e) => e.stopPropagation()}>
    <input bind:this={input} bind:value={query} onkeydown={onKey} placeholder="Speaker… e.g. c12, k2, u, or a nickname" />
    <div class="hint faint">
      <b>c</b>12 = Client 12 · <b>k</b>2 / <b>co</b>2 = Consultant 2 · <b>u</b> = Unclear · digits only = Client N · role without digits = no number
    </div>
    <div class="list">
      {#each options as o, i (o.id)}
        <button class="opt" class:active={i === index} onmouseenter={() => (index = i)} onclick={() => choose(o)}>
          <span class="stripe role-{o.id.split('_')[0]}"></span>
          <span class="label">{o.label}</span>
          {#if o.hint}<span class="tag" class:new={o.hint === 'new'}>{o.hint}</span>{/if}
        </button>
      {/each}
      {#if !options.length}<div class="faint empty">No match. Try c7, k2, u…</div>{/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 50;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 14vh;
  }
  .picker {
    width: min(460px, 92vw);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  input {
    font-size: 16px;
    padding: 8px 10px;
  }
  .hint {
    font-size: 11.5px;
  }
  .list {
    max-height: 50vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .opt {
    justify-content: flex-start;
    background: transparent;
    border-color: transparent;
    padding: 6px 8px;
  }
  .opt.active {
    background: var(--panel-3);
    border-color: var(--border);
  }
  .stripe {
    width: 4px;
    height: 18px;
    border-radius: 2px;
    flex: none;
  }
  .role-consultant {
    background: var(--role-consultant);
  }
  .role-client {
    background: var(--role-client);
  }
  .role-unclear {
    background: var(--role-unclear);
  }
  .label {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag {
    font-size: 11px;
    color: var(--text-faint);
  }
  .tag.new {
    color: var(--accent);
  }
  .empty {
    padding: 8px;
  }
</style>
