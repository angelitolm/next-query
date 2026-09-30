// Panel CSS, scoped by the shadow root. Same tokens and look as next-toolbar, in orange → yellow.
// Dark by default, light with the OS preference.
export const css = /* css */ `
:host {
  all: initial;
  --nq-from: #ff8a3d;
  --nq-to: #ffd23f;
  --nq-primary: linear-gradient(90deg, var(--nq-from), var(--nq-to));
  --nq-on-primary: #1a0f05;
  --nq-glow: 0 0 18px rgba(255, 160, 60, .45);
  /* Fresh uses next-toolbar's lime → cyan so it reads apart from the orange chrome. */
  --nq-fresh: linear-gradient(90deg, #c6ff5c, #5ef5e0);
  --nq-on-fresh: #0b0f0c;
  --nq-fresh-glow: 0 0 8px rgba(126, 250, 190, .45);
  --nq-surface: linear-gradient(180deg, #38383b 0%, #1f1f21 100%);
  --nq-surface-flat: #1c1c1e;
  --nq-card: rgba(0, 0, 0, .24);
  --nq-raised: rgba(255, 255, 255, .06);
  --nq-hover: rgba(255, 255, 255, .09);
  --nq-border: rgba(255, 255, 255, .09);
  --nq-text: #f4f4f5;
  --nq-dim: #9d9da3;
  --nq-err: #ff6b6b;
  --nq-warn: #ffb547;
  --nq-warn-bg: rgba(255, 181, 71, .16);
  --nq-err-bg: rgba(255, 107, 107, .16);
  --nq-err-border: rgba(255, 107, 107, .25);
  --nq-err-text: #ff9b9b;
  --nq-accent: var(--nq-from);
  --nq-json-key: var(--nq-accent);
  --nq-json-string: #fde68a;
  --nq-json-number: #fdba74;
  --nq-json-literal: #7dd3fc;
  --nq-active-bg: rgba(255, 138, 61, .08);
  --nq-ring: #1f1f21;
  --nq-logo: #f4f4f5;
  /* The logo always sits on a dark tile, in both themes. */
  --nq-mark-bg: linear-gradient(180deg, #38383b 0%, #1f1f21 100%);
  --nq-scrollbar: rgba(255, 255, 255, .18);
  --nq-shadow: 0 24px 48px -12px rgba(0, 0, 0, .55), 0 8px 16px -8px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .08);
  --nq-radius: 12px;
  --nq-font: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --nq-mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace;
}
@media (prefers-color-scheme: light) {
  :host {
    --nq-glow: 0 0 14px rgba(255, 140, 50, .45);
    --nq-surface: linear-gradient(180deg, #ffffff 0%, #f3f4f6 100%);
    --nq-surface-flat: #fbfbfc;
    --nq-card: #ffffff;
    --nq-raised: rgba(15, 15, 20, .045);
    --nq-hover: rgba(15, 15, 20, .07);
    --nq-border: rgba(15, 15, 20, .1);
    --nq-text: #18181b;
    --nq-dim: #5f5f6a;
    --nq-err: #d93636;
    --nq-warn: #9a5b00;
    --nq-warn-bg: rgba(217, 119, 6, .12);
    --nq-err-bg: rgba(220, 38, 38, .1);
    --nq-err-border: rgba(220, 38, 38, .25);
    --nq-err-text: #c02626;
    --nq-accent: #c2410c;
    --nq-json-string: #854d0e;
    --nq-json-number: #9a3412;
    --nq-json-literal: #0369a1;
    --nq-active-bg: rgba(194, 65, 12, .07);
    --nq-scrollbar: rgba(15, 15, 20, .2);
    --nq-shadow: 0 20px 40px -16px rgba(15, 23, 42, .25), 0 6px 14px -6px rgba(15, 23, 42, .12), inset 0 1px 0 #ffffff;
  }
}

* { box-sizing: border-box; }
button { all: unset; box-sizing: border-box; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible { outline: 2px solid var(--nq-accent); outline-offset: 2px; }
code { font: 12px var(--nq-mono); }
.spacer { flex: 1; }

/* Slim, arrow-less scrollbars. Chromium/Safari use the ::-webkit-scrollbar rules; setting
   scrollbar-width there would make Chrome ignore them, so the standard ones are for the others. */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
::-webkit-scrollbar-track { background: transparent; margin-block: 8px; }
::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb { background-color: var(--nq-scrollbar); border: 3px solid transparent; border-radius: 999px; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background-color: var(--nq-dim); }
@supports not selector(::-webkit-scrollbar) {
  * { scrollbar-width: thin; scrollbar-color: var(--nq-scrollbar) transparent; }
}

/* Shared floating surface */
.launcher, .panel {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
  background: var(--nq-surface); border: 1px solid var(--nq-border); box-shadow: var(--nq-shadow);
  color: var(--nq-text); font: 13px/1.3 var(--nq-font); -webkit-font-smoothing: antialiased;
}
.left { right: auto; left: 16px; }

/* Launcher: the closed state, a circle that holds the logo */
.launcher {
  width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center;
  background: var(--nq-mark-bg); border-color: rgba(255, 255, 255, .09); color: var(--nq-logo);
  transition: transform .2s cubic-bezier(.2, .8, .2, 1), box-shadow .2s;
  animation: nq-pop .25s cubic-bezier(.2, .8, .2, 1);
}
.launcher:hover { transform: scale(1.06); box-shadow: var(--nq-shadow), var(--nq-glow); }
.launcher .dot { position: absolute; top: 3px; right: 3px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--nq-ring); background: var(--nq-fresh); box-shadow: var(--nq-fresh-glow); }
.launcher .bubble {
  position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px;
  display: grid; place-items: center; font: 700 11px var(--nq-font); border: 2px solid var(--nq-ring);
  background: var(--nq-warn); color: #1a1205;
}
.launcher .bubble.err { background: var(--nq-err); color: #fff; }

/* Panel: the open state, anchored to the launcher's corner */
.panel {
  width: min(920px, calc(100vw - 32px)); height: min(460px, 70vh);
  display: flex; flex-direction: column; overflow: hidden; border-radius: var(--nq-radius);
  animation: nq-rise .22s cubic-bezier(.2, .8, .2, 1);
}
header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; border-bottom: 1px solid var(--nq-border); }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 14px; }
.brand .version { margin-left: 2px; font: 500 11px var(--nq-mono); color: var(--nq-dim); white-space: nowrap; }
.mark { width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px; display: grid; place-items: center; background: var(--nq-mark-bg); color: var(--nq-logo); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08); }
.chips { display: flex; gap: 6px; }
.chip { height: 22px; padding: 0 8px; border-radius: 6px; display: inline-flex; align-items: center; background: var(--nq-raised); color: var(--nq-dim); font-size: 11px; font-weight: 600; white-space: nowrap; }
.chip.warn { background: var(--nq-warn-bg); color: var(--nq-warn); }
.chip.err { background: var(--nq-err-bg); color: var(--nq-err); }

.search {
  flex: 1 1 180px; min-width: 140px; max-width: 280px; height: 32px; padding: 0 10px; border-radius: 8px;
  display: flex; align-items: center; gap: 7px; background: var(--nq-raised); border: 1px solid var(--nq-border); color: var(--nq-dim);
}
.search:focus-within { outline: 2px solid var(--nq-accent); outline-offset: 1px; }
.search input { all: unset; flex: 1; min-width: 0; color: var(--nq-text); font: 12px var(--nq-font); }
.search input::placeholder { color: var(--nq-dim); }

.sort { display: flex; height: 32px; padding: 3px; gap: 2px; border-radius: 8px; background: var(--nq-raised); border: 1px solid var(--nq-border); }
.sort button { position: relative; padding: 0 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px; color: var(--nq-dim); font-size: 12px; font-weight: 600; }
.sort button:hover { color: var(--nq-text); }
.sort button[aria-pressed="true"] { background: var(--nq-hover); color: var(--nq-text); }
.sort button[aria-pressed="true"]::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: 1px; height: 2px; border-radius: 1px; background: var(--nq-primary); }

.icon-btn { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; color: var(--nq-dim); flex-shrink: 0; }
.icon-btn:hover { background: var(--nq-hover); color: var(--nq-text); }
.text-btn { height: 32px; padding: 0 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.text-btn.primary { background: var(--nq-primary); color: var(--nq-on-primary); box-shadow: var(--nq-glow); }
.text-btn.primary:hover { filter: brightness(1.06); }

.alert { margin: 10px 10px 0; padding: 8px 10px; border-radius: 8px; background: var(--nq-err-bg); border: 1px solid var(--nq-err-border); color: var(--nq-err-text); line-height: 1.4; }

.body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }

/* List: one card per query */
.list { list-style: none; margin: 0; padding: 10px; overflow: hidden auto; border-right: 1px solid var(--nq-border); display: flex; flex-direction: column; gap: 8px; }
.empty { padding: 12px; color: var(--nq-dim); line-height: 1.5; }
.card {
  position: relative; border-radius: 10px;
  background: var(--nq-card); border: 1px solid var(--nq-border); transition: border-color .15s, background .15s;
}
.card:hover { border-color: color-mix(in srgb, var(--nq-accent) 40%, var(--nq-border)); }
.card.selected { border-color: var(--nq-accent); background: linear-gradient(var(--nq-active-bg), var(--nq-active-bg)), var(--nq-card); }
.card-select { display: flex; flex-direction: column; gap: 10px; width: 100%; padding: 11px 12px; border-radius: 9px; }
/* Room on the top line for the revalidate button, which sits over it. */
.card-top { display: flex; align-items: center; gap: 10px; padding-right: 30px; }
.icon-btn.reval { position: absolute; top: 7px; right: 8px; width: 26px; height: 26px; border-radius: 7px; color: var(--nq-accent); opacity: 0; transition: opacity .15s; }
.icon-btn.reval:hover { color: var(--nq-accent); }
.card:hover .reval, .card:focus-within .reval, .card.selected .reval { opacity: 1; }
.icon-btn.reval:disabled { color: var(--nq-dim); }
@media (hover: none) { .icon-btn.reval { opacity: 1; } }
.kind { flex-shrink: 0; padding: 2px 6px; border-radius: 5px; font: 700 9px var(--nq-mono); letter-spacing: .08em; text-transform: uppercase; background: var(--nq-raised); color: var(--nq-dim); }
.kind.fetch { color: var(--nq-accent); }
.row-url { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--nq-mono); }
.empty code { font-family: var(--nq-mono); }
.card-top code.url { display: flex; }
.url .host { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--nq-dim); }
.url .path { flex-shrink: 0; }
.card-top code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--nq-text); }
.meter { display: flex; align-items: center; gap: 10px; }
.track { flex: 1; height: 4px; border-radius: 2px; background: var(--nq-raised); overflow: hidden; }
.track.stale { background: var(--nq-warn-bg); }
/* Counts down: full when just loaded, empty once stale. */
.fill { display: block; height: 100%; border-radius: 2px; background: var(--nq-fresh); box-shadow: var(--nq-fresh-glow); transition: width 1s linear; }
.fill.error { background: var(--nq-err); box-shadow: none; }
.meter-label { flex-shrink: 0; color: var(--nq-dim); font: 600 10px var(--nq-mono); letter-spacing: .08em; text-transform: uppercase; }

.pill { flex-shrink: 0; padding: 3px 7px; border-radius: 5px; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.pill.fresh { background: var(--nq-fresh); color: var(--nq-on-fresh); }
.pill.stale { background: var(--nq-warn-bg); color: var(--nq-warn); }
.pill.error { background: var(--nq-err-bg); color: var(--nq-err); }

/* Detail */
.detail { overflow: auto; padding: 14px 16px 16px; }
.detail-head { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 8px; padding: 0 0 0 10px; }
.text-btn.small { height: 28px; padding: 0 10px; gap: 5px; font-size: 11px; flex-shrink: 0; }
.title { flex: 1; min-width: 0; margin: 3px 0 0; padding: 0; font: 600 14px/1.4 var(--nq-mono); color: var(--nq-accent); word-break: break-all; }
.row { display: flex; gap: 16px; justify-content: space-between; align-items: center; min-height: 28px; padding: 3px 10px; border-radius: 7px; line-height: 1.3; }
.row:hover { background: var(--nq-raised); }
.row > :first-child { color: var(--nq-dim); flex-shrink: 0; }
.row > :last-child { text-align: right; }
.row-k { display: inline-flex; align-items: center; gap: 8px; color: var(--nq-dim); }
.row-k svg { flex-shrink: 0; opacity: .8; }
.tags-label { margin-right: 6px; }
.tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 3px 10px 10px; }
.tag-btn, .tag { height: 24px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--nq-border); color: var(--nq-accent); font: 600 11px var(--nq-mono); display: inline-flex; align-items: center; }
.tag { border-style: dashed; color: var(--nq-dim); }
.tag-btn::before, .tag::before { content: '#'; opacity: .6; }
.tag-btn { gap: 5px; }
.tag-btn::before { margin-right: -5px; }
.tag-btn .tag-ico { opacity: .55; transition: opacity .15s; }
.tag-btn:hover { background: var(--nq-hover); border-color: color-mix(in srgb, var(--nq-accent) 45%, var(--nq-border)); }
.tag-btn:hover .tag-ico, .tag-btn:focus-visible .tag-ico { opacity: 1; }
pre { margin: 0 0 8px; padding: 10px 12px; border-radius: 8px; background: var(--nq-raised); overflow: auto; white-space: pre-wrap; word-break: break-word; font: 11px/1.5 var(--nq-mono); }
.data { position: relative; }
.data-tools { position: absolute; top: 6px; right: 6px; display: flex; align-items: center; gap: 6px; }
.data-note { color: var(--nq-dim); font: 600 10px var(--nq-mono); letter-spacing: .08em; text-transform: uppercase; }
.icon-btn.copy { width: auto; min-width: 28px; height: 28px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-size: 11px; font-weight: 600; }
.json .j-key { color: var(--nq-json-key); }
.json .j-string { color: var(--nq-json-string); }
.json .j-number { color: var(--nq-json-number); }
.json .j-literal { color: var(--nq-json-literal); }
.json .j-punct { color: var(--nq-dim); }
pre.err { background: var(--nq-err-bg); border: 1px solid var(--nq-err-border); color: var(--nq-err-text); }

@keyframes nq-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
@keyframes nq-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .launcher, .panel { animation: none; } .launcher, .fill { transition: none; } }

@media (max-width: 640px) {
  /* The header wraps to several lines on a phone, so give the stacked list and detail more height. */
  .panel { height: min(640px, calc(100vh - 32px)); }
  /* Header lines: brand … reload close / chips search / sort … Revalidate all.
     header::after is an empty full-width item that ends the first line. */
  .brand, .spacer, .icon-btn { order: 1; }
  header::after { content: ""; order: 1; flex-basis: 100%; margin-top: -8px; }
  .chips, .search { order: 2; }
  .sort, .text-btn { order: 3; }
  .search { flex-basis: 140px; max-width: none; }
  .text-btn { margin-left: auto; }
  .body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
  .list { border-right: 0; border-bottom: 1px solid var(--nq-border); }
}
:host([data-inline]) { display: block; }
.panel.inline { position: static; width: 100%; height: min(460px, 70vh); animation: none; box-shadow: none; }
@media (max-width: 640px) { .panel.inline { height: min(640px, 80vh); } }
`
