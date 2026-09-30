// Panel CSS, scoped by the shadow root. Dark by default, light with the OS preference.
export const css = /* css */ `
:host { all: initial; }
.nq-root {
  position: fixed; bottom: 12px; z-index: 2147483000;
  font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--nq-text);
  --nq-bg: #1c1c1e; --nq-raised: rgba(255,255,255,.06); --nq-border: rgba(255,255,255,.12);
  --nq-text: #ececf1; --nq-dim: #9a9aa5; --nq-accent: #5ef5e0;
  --nq-fresh: #4ade80; --nq-stale: #fbbf24; --nq-error: #f87171;
}
@media (prefers-color-scheme: light) {
  .nq-root {
    --nq-bg: #fbfbfc; --nq-raised: rgba(15,15,20,.05); --nq-border: rgba(15,15,20,.12);
    --nq-text: #18181b; --nq-dim: #6b6b76; --nq-accent: #0f766e;
    --nq-fresh: #15803d; --nq-stale: #b45309; --nq-error: #c02626;
  }
}
.nq-bottom-right { right: 12px; }
.nq-bottom-left { left: 12px; }
button, input, select {
  font: inherit; color: inherit; background: var(--nq-raised);
  border: 1px solid var(--nq-border); border-radius: 6px; padding: 3px 8px;
}
button { cursor: pointer; }
button:disabled { opacity: .5; cursor: wait; }
button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--nq-accent); outline-offset: 1px; }
.nq-fab { background: var(--nq-bg); border-radius: 999px; padding: 6px 12px; box-shadow: 0 6px 20px rgba(0,0,0,.3); }
.nq-logo { font-weight: 700; color: var(--nq-accent); margin-right: 4px; }
.nq-panel {
  width: min(900px, calc(100vw - 24px)); height: min(420px, 60vh);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--nq-bg); border: 1px solid var(--nq-border); border-radius: 10px;
  box-shadow: 0 20px 40px rgba(0,0,0,.35);
}
.nq-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px; border-bottom: 1px solid var(--nq-border); }
.nq-filter { flex: 1; min-width: 120px; }
.nq-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
.nq-list { list-style: none; margin: 0; padding: 4px; overflow: auto; border-right: 1px solid var(--nq-border); }
.nq-row { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; background: none; border-color: transparent; }
.nq-row code { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nq-active { background: var(--nq-raised); border-color: var(--nq-border); }
.nq-badge { min-width: 42px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
.nq-s-fresh { color: var(--nq-fresh); }
.nq-s-stale { color: var(--nq-stale); }
.nq-s-error { color: var(--nq-error); }
.nq-dim { color: var(--nq-dim); }
.nq-empty { padding: 12px; }
.nq-detail { padding: 8px 12px; overflow: auto; }
.nq-detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0 0 8px; }
.nq-detail dt { color: var(--nq-dim); }
.nq-detail dd { margin: 0; overflow-wrap: anywhere; }
.nq-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
pre { margin: 0 0 8px; padding: 8px; background: var(--nq-raised); border-radius: 6px; overflow: auto; white-space: pre-wrap; font: 11px/1.4 ui-monospace, monospace; }
.nq-alert { color: var(--nq-error); padding: 6px 8px; }
@media (max-width: 600px) {
  .nq-body { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
  .nq-list { border-right: 0; border-bottom: 1px solid var(--nq-border); }
}
`
