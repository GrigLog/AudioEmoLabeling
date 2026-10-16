<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { settings } from '../lib/settings.svelte';
  import { ACTIONS, bindingLabel, eventBinding, sameBinding, type ActionId, type Binding } from '../lib/keys';

  let capturing = $state<ActionId | null>(null);
  let filter = $state('');

  const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);

  function conflicts(id: ActionId, b: Binding): string[] {
    return ACTIONS.filter((a) => a.id !== id && settings.keymap[a.id].some((x) => sameBinding(x, b))).map((a) => a.label);
  }

  function onKey(e: KeyboardEvent) {
    if (!capturing) {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) app.settingsOpen = false;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (MODIFIER_CODES.has(e.code)) return;
    if (e.code === 'Escape') {
      capturing = null;
      return;
    }
    const b = eventBinding(e);
    const clean: Binding = { code: b.code };
    if (b.shift) clean.shift = true;
    if (b.mod) clean.mod = true;
    if (b.alt) clean.alt = true;
    settings.setBindings(capturing, [clean]);
    capturing = null;
  }

  const shown = $derived(ACTIONS.filter((a) => !filter || a.label.toLowerCase().includes(filter.toLowerCase())));
</script>

<svelte:window onkeydowncapture={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => (app.settingsOpen = false)}>
  <div class="panel" onclick={(e) => e.stopPropagation()}>
    <div class="head">
      <h2>Settings</h2>
      <button class="ghost close" onclick={() => (app.settingsOpen = false)}>✕</button>
    </div>

    <div class="grid">
      <section>
        <h3>General</h3>
        <label class="row">
          Theme
          <select bind:value={settings.data.theme}>
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label class="row">
          Small seek step (s)
          <input type="number" min="0.1" step="0.5" bind:value={settings.data.seekSmall} />
        </label>
        <label class="row">
          Big seek step (s)
          <input type="number" min="1" step="1" bind:value={settings.data.seekBig} />
        </label>
        <label class="row check"><input type="checkbox" bind:checked={settings.data.follow} /> Follow playhead (auto-scroll, labels go to the span being played)</label>
        <label class="row">
          Late-label window (s)
          <input type="number" min="0" max="5" step="0.25" bind:value={settings.data.lateWindow} />
        </label>
        <div class="faint small">A label key pressed this soon after a span ends still goes to that span, if it was missing that label.</div>
        <label class="row check"><input type="checkbox" bind:checked={settings.data.snap} /> Snap span edges to transcript lines, spans and playhead (hold Alt to bypass)</label>
        <label class="row check"><input type="checkbox" bind:checked={settings.data.autoPlayOnTextEdit} /> Play the span when editing its text</label>
        <label class="row check"><input type="checkbox" bind:checked={settings.data.autosaveToDisk} /> Write changes to the labels file automatically (Chrome/Edge, after the first save)</label>
        <label class="row">
          Waveform gain
          <input type="range" min="0.25" max="8" step="0.05" bind:value={settings.data.waveGain} />
          <button class="small-btn" onclick={() => (settings.data.waveGain = 1)}>auto</button>
        </label>
      </section>

      <section class="keys">
        <h3>
          Keyboard shortcuts
          <button class="small-btn" onclick={() => settings.resetKeymap()}>Reset all</button>
        </h3>
        <input class="filter" bind:value={filter} placeholder="Filter actions…" />
        <div class="klist">
          {#each shown as a (a.id)}
            {@const keys = settings.keymap[a.id]}
            <div class="krow">
              <span class="klabel">{a.label}</span>
              <button class="kbtn" class:cap={capturing === a.id} onclick={() => (capturing = capturing === a.id ? null : a.id)} title="Click, then press the new key">
                {#if capturing === a.id}
                  press a key… (Esc cancels)
                {:else}
                  {#each keys as b, i (i)}<kbd>{bindingLabel(b)}</kbd>{/each}
                  {#if !keys.length}<span class="faint">none</span>{/if}
                {/if}
              </button>
              {#if keys[0] && conflicts(a.id, keys[0]).length}
                <span class="warn" title="Also used by: {conflicts(a.id, keys[0]).join(', ')}">⚠</span>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .panel {
    width: min(980px, 100%);
    max-height: 100%;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    padding: 16px 22px 22px;
  }
  .head {
    display: flex;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: 18px;
  }
  .close {
    margin-left: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }
  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin: 14px 0 8px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
    font-size: 13.5px;
  }
  .row input[type='number'] {
    width: 80px;
  }
  .row.check {
    justify-content: flex-start;
  }
  .small {
    font-size: 12px;
    margin-top: -4px;
  }
  .small-btn {
    font-size: 12px;
    padding: 2px 8px;
  }
  .filter {
    width: 100%;
  }
  .klist {
    max-height: 52vh;
    overflow-y: auto;
  }
  .krow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
    font-size: 13px;
  }
  .klabel {
    flex: 1;
  }
  .kbtn {
    min-width: 120px;
    justify-content: flex-end;
    padding: 2px 6px;
    background: transparent;
  }
  .kbtn.cap {
    border-color: var(--accent);
    color: var(--accent);
  }
  .warn {
    color: var(--accent);
  }
  @media (max-width: 800px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
