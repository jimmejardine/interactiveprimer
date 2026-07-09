// @ts-check
/**
 * The shared code-editor chrome styles used by both `<primer-code run>` (js/components/primer-code.js)
 * and `<primer-program>` (js/components/primer-program.js): the `.runner` frame, the `.bar` toolbar and
 * its buttons, the line-number `.gutter` + transparent-`textarea`-over-highlighted-`pre` editor, the
 * syntax-token colour classes, and the always-visible `.output` pane. Each component interpolates this
 * string into its shadow `<style>` and layers its own extras after it (primer-program adds Check/New-input
 * buttons, right/wrong frames and a resizable textarea; primer-code adds the static non-runnable panel).
 *
 * Token colours come from `--code-*` custom props, which each component sets on its host from
 * `themeColors()` (custom props inherit into the shadow tree), so blocks recolour on a theme change.
 * @module
 */

export const CODE_EDITOR_CSS = `
  /* runnable block: one cohesive frame — toolbar, editor, then an always-visible output */
  .runner { overflow: hidden;
    background: var(--code-bg, var(--primer-viz-bg, #fff));
    border: 1px solid var(--primer-border, #e6e0d4);
    border-radius: var(--primer-radius, 0.6rem);
    box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
  .bar { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.5rem;
    background: var(--primer-control-bg, #f1ede4);
    border-bottom: 1px solid var(--primer-border, #e6e0d4); }
  .eyebrow-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
    text-transform: uppercase; color: var(--primer-ink-soft, #667); }
  .spacer { flex: 1; }
  .bar button { font: inherit; font-size: 0.82rem; cursor: pointer; padding: 0.2rem 0.7rem;
    border-radius: 0.35rem; border: 1px solid var(--primer-control-border, #ccc);
    background: transparent; color: var(--primer-ink-soft, #667); }
  .bar button:hover { color: var(--primer-ink, #111); }
  .bar .run { font-weight: 700; color: var(--primer-accent-ink, #fff);
    background: var(--primer-accent, #4d5bd1); border-color: transparent;
    box-shadow: 0 0 8px var(--primer-ring, rgba(70,90,230,0.4)); }
  .bar .run:disabled { opacity: 0.55; cursor: default; box-shadow: none; }
  /* editable code: a line-number gutter, then a transparent textarea over the highlighted layer */
  .editor { position: relative; display: flex; align-items: stretch; }
  .gutter { flex: 0 0 auto; box-sizing: border-box; padding: 0.7rem 0.5rem;
    font-family: var(--primer-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
    font-size: 0.9rem; line-height: 1.55; white-space: pre; text-align: right;
    user-select: none; -webkit-user-select: none;
    color: var(--code-c, #999); opacity: 0.75;
    border-right: 1px solid var(--primer-border, #e6e0d4); }
  .code-wrap { position: relative; flex: 1 1 auto; overflow: hidden; }
  .code-wrap > pre, .code-wrap > textarea { margin: 0; box-sizing: border-box; padding: 0.7rem 0.95rem;
    font-family: var(--primer-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
    font-size: 0.9rem; line-height: 1.55; tab-size: 4; white-space: pre; }
  /* no wrap: long lines scroll horizontally; the textarea is the scroller, the pre mirrors it */
  .code-wrap > pre { position: relative; pointer-events: none; overflow: hidden; color: var(--code-ink, #111); }
  .code-wrap > pre code { font: inherit; padding: 0; white-space: inherit; }
  .code-wrap > textarea { position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
    resize: none; overflow: auto; scrollbar-width: none; outline: none;
    color: transparent; background: transparent; caret-color: var(--code-ink, #111); }
  .code-wrap > textarea::-webkit-scrollbar { display: none; }
  .code-wrap > textarea:focus-visible { outline: 2px solid var(--primer-ring, #88f); outline-offset: -2px; }
  /* syntax-token colours (set as --code-* custom props from themeColors() by the host component) */
  .k { color: var(--code-k); font-weight: 600; }
  .b { color: var(--code-b); }
  .s { color: var(--code-s); }
  .n { color: var(--code-n); }
  .f { color: var(--code-f); }
  .c { color: var(--code-c); font-style: italic; }
  /* always-visible output, divided from the code above it */
  .out-head { padding: 0.3rem 0.7rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
    text-transform: uppercase; color: var(--primer-ink-soft, #667);
    background: var(--primer-control-bg, #f1ede4);
    border-top: 1px solid var(--primer-border, #e6e0d4); }
  .output { margin: 0; padding: 0.7rem 0.95rem; white-space: pre-wrap; overflow: auto;
    color: var(--code-ink, var(--primer-ink, #111));
    font-family: var(--primer-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
    font-size: 0.9rem; line-height: 1.55;
    max-height: calc(20 * 1.55 * 0.9rem + 1.4rem); } /* ~20 lines, then scroll */
  .output .err { color: var(--primer-bad, #c0392b); font-weight: 600; }
  .output .muted { color: var(--code-c); font-style: italic; }
`;
