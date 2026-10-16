<script lang="ts">
  import { toasts } from '../lib/toasts.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.list as t (t.id)}
    <div class="toast {t.kind}">
      <span class="text">{t.text}</span>
      {#if t.action}
        <button
          class="act"
          onclick={() => {
            t.action?.run();
            toasts.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="ghost x" onclick={() => toasts.dismiss(t.id)}>✕</button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 90;
    align-items: center;
    pointer-events: none;
    width: min(640px, 94vw);
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-left: 4px solid var(--text-faint);
    border-radius: 8px;
    padding: 7px 8px 7px 12px;
    box-shadow: var(--shadow);
    font-size: 13.5px;
    max-width: 100%;
  }
  .toast.success {
    border-left-color: var(--success);
  }
  .toast.warn {
    border-left-color: var(--accent);
  }
  .toast.error {
    border-left-color: var(--danger);
  }
  .text {
    flex: 1;
  }
  .act {
    font-size: 12.5px;
    padding: 2px 8px;
  }
  .x {
    padding: 0 6px;
    font-size: 11px;
    color: var(--text-faint);
  }
</style>
