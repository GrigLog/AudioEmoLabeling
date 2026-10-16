<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { ACTIONS, type ActionDef } from '../lib/keys';
  import Kbd from './Kbd.svelte';

  const groups = ACTIONS.reduce<Record<string, ActionDef[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a);
    return acc;
  }, {});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={() => (app.helpOpen = false)}>
  <div class="help" onclick={(e) => e.stopPropagation()}>
    <div class="head">
      <h2>Keyboard shortcuts & workflow</h2>
      <span class="dim small">Keys follow physical positions, so they work with any keyboard layout. Remap them in ⚙ Settings.</span>
      <button class="ghost close" onclick={() => (app.helpOpen = false)}>✕</button>
    </div>

    <div class="tips">
      <div class="tip">
        <b>Fastest: label while listening.</b> Press <kbd>Space</kbd> and keep Follow on. Press a speaker key (<Kbd action="spkConsultant" />
        <Kbd action="spkClient" /> <Kbd action="spkUnclear" />) and an emotion key (<kbd>1</kbd>–<kbd>5</kbd>) without stopping. They apply to the span
        under the playhead. If there's only a transcript line there, a span is created from it. Pressed just after a span ended? The key still goes to
        that span if it was missing that label.
      </div>
      <div class="tip">
        <b>New customer?</b> <Kbd action="spkNewClient" /> creates the next numbered client and makes it current, so <Kbd action="spkClient" /> keeps
        assigning them. To go back to a client from earlier, use the picker (<Kbd action="spkPicker" />, e.g. type <i>c3</i>). Numbers are optional:
        plain "Client" is fine, and you can merge it into a numbered speaker later in the Speakers tab.
      </div>
      <div class="tip">
        <b>No transcript lines?</b> Press <Kbd action="mark" /> when speech starts and again when it ends, or drag on the waveform. Fix the boundaries by
        dragging edges (they snap to transcript lines and other spans; hold Alt to stop snapping).
      </div>
      <div class="tip">
        <b>Text:</b> <Kbd action="editText" /> opens the span's text prefilled from the auto-transcript and plays the span. Fix it and press Enter. Only
        text you saved is exported.
      </div>
      <div class="tip">
        <b>Saving:</b> everything is autosaved in this browser. <Kbd action="save" /> writes the labels JSON. In Chrome/Edge, later saves go to the same
        file automatically. To continue later, open the audio file again, or drop the audio together with its labels file.
      </div>
    </div>

    <div class="cols">
      {#each Object.entries(groups) as [name, list] (name)}
        <div class="group">
          <h3>{name}</h3>
          {#each list as a (a.id)}
            <div class="row">
              <span class="keys"><Kbd action={a.id} all /></span>
              <span>{a.label}</span>
            </div>
          {/each}
        </div>
      {/each}
      <div class="group">
        <h3>Mouse</h3>
        <div class="row"><span class="keys"><kbd>drag</kbd></span><span>Create a span (also over existing spans → overlap)</span></div>
        <div class="row"><span class="keys"><kbd>click</kbd></span><span>Select span / seek</span></div>
        <div class="row"><span class="keys"><kbd>Shift</kbd>+<kbd>click</kbd></span><span>Add to selection</span></div>
        <div class="row"><span class="keys"><kbd>dbl-click</kbd></span><span>Play span / span from transcript line</span></div>
        <div class="row"><span class="keys"><kbd>edge drag</kbd></span><span>Resize span</span></div>
        <div class="row"><span class="keys"><kbd>Alt</kbd>+<kbd>drag</kbd></span><span>Move span</span></div>
        <div class="row"><span class="keys"><kbd>right-click</kbd></span><span>Span menu</span></div>
        <div class="row"><span class="keys"><kbd>wheel</kbd></span><span>Scroll timeline</span></div>
        <div class="row"><span class="keys"><kbd>Ctrl/⌘</kbd>+<kbd>wheel</kbd></span><span>Zoom (pinch on trackpad)</span></div>
        <div class="row"><span class="keys"><kbd>Alt</kbd>+<kbd>wheel</kbd></span><span>Waveform gain</span></div>
        <div class="row"><span class="keys"><kbd>middle drag</kbd></span><span>Pan</span></div>
      </div>
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
  .help {
    width: min(1100px, 100%);
    max-height: 100%;
    overflow-y: auto;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: var(--shadow);
    padding: 18px 22px 22px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  h2 {
    margin: 0;
    font-size: 18px;
  }
  .close {
    margin-left: auto;
  }
  .small {
    font-size: 12.5px;
  }
  .tips {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 10px;
    margin: 14px 0 6px;
  }
  .tip {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.5;
  }
  .cols {
    columns: 3 300px;
    column-gap: 24px;
  }
  .group {
    break-inside: avoid;
    margin-bottom: 12px;
  }
  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    margin: 12px 0 6px;
  }
  .row {
    display: flex;
    gap: 10px;
    font-size: 13px;
    padding: 2px 0;
  }
  .keys {
    width: 130px;
    flex: none;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }
</style>
