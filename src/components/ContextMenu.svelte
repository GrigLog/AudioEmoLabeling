<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { EMOTIONS, EMOTION_LABEL, ROLES, type Emotion, type Role } from '../lib/model/types';
  import { speakerLabel } from '../lib/model/speakers';
  import type { ActionId } from '../lib/keys';
  import Kbd from './Kbd.svelte';

  const m = $derived(app.menu!);
  const seg = $derived(app.segById.get(m.id));
  const EMO_ACTION: Record<Emotion, ActionId> = {
    positive: 'emoPositive',
    neutral: 'emoNeutral',
    angry: 'emoAngry',
    sad: 'emoSad',
    unclear: 'emoUnclear',
  };
  const ROLE_ACTION: Record<Role, ActionId> = { consultant: 'spkConsultant', client: 'spkClient', unclear: 'spkUnclear' };

  const close = () => (app.menu = null);
  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  const left = $derived(Math.min(m.x, window.innerWidth - 240));
  const top = $derived(Math.min(m.y, window.innerHeight - 440));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={close} oncontextmenu={(e) => { e.preventDefault(); close(); }}>
  <div class="menu" style="left:{left}px; top:{Math.max(8, top)}px" onclick={(e) => e.stopPropagation()}>
    {#if seg}
      <div class="title dim">{app.selected.length > 1 ? `${app.selected.length} spans` : app.describeSpan(seg)}</div>
      <div class="sec">
        {#each EMOTIONS as e (e)}
          <button class="item" onclick={run(() => app.setEmotion(e, true))}>
            <span class="dot" style="background:var(--emo-{e})"></span>{EMOTION_LABEL[e]}<span class="sp"></span><Kbd action={EMO_ACTION[e]} />
          </button>
        {/each}
      </div>
      <div class="sec">
        {#each ROLES as r (r)}
          <button class="item" onclick={run(() => app.speakerKey(r, false, true))}>
            {speakerLabel(app.current[r])}<span class="sp"></span><Kbd action={ROLE_ACTION[r]} />
          </button>
        {/each}
        <button class="item" onclick={run(() => (app.pickerOpen = true))}>Other speaker…<span class="sp"></span><Kbd action="spkPicker" /></button>
      </div>
      <div class="sec">
        <button class="item" onclick={run(() => app.playSpan(seg))}>Play<span class="sp"></span><Kbd action="replay" /></button>
        <button class="item" onclick={run(() => app.editField('text'))}>Edit text<span class="sp"></span><Kbd action="editText" /></button>
        <button class="item" onclick={run(() => app.editField('note'))}>Edit note<span class="sp"></span><Kbd action="editNote" /></button>
        <button class="item" onclick={run(() => app.split())}>Split at playhead<span class="sp"></span><Kbd action="split" /></button>
        <button class="item" onclick={run(() => app.merge())}>{app.selected.length > 1 ? 'Merge selected' : 'Merge with next'}<span class="sp"></span><Kbd action="merge" /></button>
        <button class="item" onclick={run(() => app.zoomToSelection())}>Zoom to span<span class="sp"></span><Kbd action="zoomSel" /></button>
        <button class="item danger" onclick={run(() => app.deleteSelected())}>Delete<span class="sp"></span><Kbd action="delete" /></button>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
  }
  .menu {
    position: fixed;
    width: 230px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--shadow);
    padding: 4px;
  }
  .title {
    font-size: 11.5px;
    padding: 4px 8px 6px;
  }
  .sec {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
    padding: 3px 0;
  }
  .item {
    background: transparent;
    border: none;
    justify-content: flex-start;
    padding: 4px 8px;
    font-size: 13px;
  }
  .item:hover {
    background: var(--panel-3);
  }
  .sp {
    flex: 1;
  }
</style>
