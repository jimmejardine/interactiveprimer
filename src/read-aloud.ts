/**
 * Read a card aloud, highlighting each sentence as it is spoken (a karaoke / read-along aid).
 *
 * The card's prose is split into sentences, each mapped to a DOM `Range`; the sentences are
 * spoken ONE UTTERANCE AT A TIME (see {@link speakSequence}) so we get reliable per-sentence
 * progress on every voice, and the active sentence is coloured via the CSS Custom Highlight API
 * (`CSS.highlights` + `::highlight(primer-reading)`), which paints arbitrary ranges WITHOUT
 * mutating the authored light-DOM prose. Where the Highlight API is unavailable, audio still
 * plays and highlighting silently degrades.
 *
 * Math and code (`<primer-math>`, `<primer-code>`) and interactive widgets are skipped — their
 * text is raw LaTeX/markup that would read as gibberish.
 * @module
 */

import { speakSequence } from "./speech.ts";
import { getLocale } from "./i18n.ts";

/** Tags whose subtree carries no readable prose (or reads as gibberish) — skipped entirely. */
const SKIP_TAGS = new Set([
  "PRIMER-MATH",
  "PRIMER-CODE",
  "PRIMER-GEOMETRY",
  "PRIMER-GEOMETRY-PROBLEM",
  "PRIMER-VIDEO",
  "PRIMER-MANIM",
  "PRIMER-QUIZ",
  "PRIMER-CHART",
  "PRIMER-CHART-3D",
  "PRIMER-CHART-SLIDERS",
  "PRIMER-PROGRAM",
  "SCRIPT",
  "STYLE",
]);

/** Block-level tags: a change of nearest block ancestor forces a sentence break. */
const BLOCK_TAGS = new Set([
  "P",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "FIGCAPTION",
  "DT",
  "DD",
  "TD",
  "TH",
  "DIV",
  "SECTION",
  "PRIMER-THEOREM",
  "PRIMER-CARD",
]);

/**
 * Turn a `<primer-math>`'s LaTeX into a spoken phrase — but ONLY for a safe arithmetic subset
 * (numbers and a handful of operators). Returns the phrase, or `null` when the LaTeX contains
 * anything we don't know how to pronounce (so the maths is skipped, as before). This lets a
 * simple inline number like `$3$` be read as part of the sentence, while `$a^2+b^2=c^2$` or
 * `$A \cap B$` are still left out rather than mispronounced.
 */
export function speakLatex(src: string): string | null {
  let s = src.trim();
  if (!s) return null;

  // Fractions first (up to a few nested levels): \frac{a}{b} → "a over b".
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/\\(?:frac|dfrac|tfrac)\{([^{}]*)\}\{([^{}]*)\}/g, " $1 over $2 ");
    if (next === s) break;
    s = next;
  }

  // Known commands → words (longest/most-specific first).
  const commands: [RegExp, string][] = [
    [/\\times|\\cdot/g, " times "],
    [/\\div/g, " divided by "],
    [/\\over/g, " over "],
    [/\\pm/g, " plus or minus "],
    [/\\leq|\\le\b/g, " less than or equal to "],
    [/\\geq|\\ge\b/g, " greater than or equal to "],
    [/\\neq|\\ne\b/g, " not equal to "],
    [/\\%/g, " percent "],
    [/\\,|\\;|\\:|\\!|\\ |\\quad|\\qquad|\\left|\\right/g, " "], // spacing/size commands
  ];
  for (const [re, word] of commands) s = s.replace(re, word);

  // Any backslash left means an unknown command — bail out (skip the maths).
  if (s.includes("\\")) return null;

  // Bare symbols → words.
  s = s
    .replace(/\+/g, " plus ")
    .replace(/-/g, " minus ")
    .replace(/=/g, " equals ")
    .replace(/</g, " less than ")
    .replace(/>/g, " greater than ")
    .replace(/%/g, " percent ")
    .replace(/[{}()]/g, " "); // drop grouping/parentheses

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return null;

  // Final gate: only letters, digits, and "." "," may remain. Anything else (^, _, |, symbols
  // from an unknown command, etc.) means we can't safely pronounce it.
  if (!/^[0-9a-zA-Z.,\s]+$/.test(s)) return null;
  return s;
}

/** The original LaTeX of a `<primer-math>` (its `tex` getter, or the KaTeX MathML annotation). */
function mathSource(el: Element): string {
  const tex = (el as { tex?: string }).tex;
  if (typeof tex === "string" && tex.length > 0) return tex;
  const ann = el.querySelector('annotation[encoding="application/x-tex"]');
  return (ann?.textContent ?? el.textContent ?? "").trim();
}

/** A tree walker over `card`'s text nodes that rejects skip subtrees and the read-aloud button. */
function textWalker(card: Element): TreeWalker {
  return document.createTreeWalker(card, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let el = node.parentElement; el && el !== card.parentElement; el = el.parentElement) {
        if (SKIP_TAGS.has(el.tagName) || el.classList.contains("card-readaloud")) {
          return NodeFilter.FILTER_REJECT;
        }
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
}

/** The nearest block-level ancestor of `node` within `card` (or `card` itself). */
function closestBlock(node: Node, card: Element): Element {
  for (let el = node.parentElement; el && el !== card.parentElement; el = el.parentElement) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
  }
  return card;
}

/** True if the card has any non-whitespace prose outside the skip subtrees. */
export function hasReadableText(card: Element): boolean {
  const w = textWalker(card);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeValue && n.nodeValue.trim().length > 0) return true;
  }
  return false;
}

/**
 * Split `text` into sentence spans (offsets into `text`), using `Intl.Segmenter` when available
 * and a punctuation-based fallback otherwise. Whitespace-only spans are dropped. Pure (no DOM),
 * so it is unit-tested.
 */
export function segmentSentences(text: string, locale = "en"): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const push = (start: number, end: number) => {
    // Trim surrounding whitespace inward so a highlight/utterance excludes leading/trailing spaces.
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (end > start) out.push({ start, end });
  };

  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    // Newlines (a Unicode sentence separator, UAX #29 rule SB4) would otherwise split a
    // sentence at the source HTML's indentation line breaks. Replace them 1:1 with spaces so
    // the returned offsets still index the original `text`.
    const norm = text.replace(/[\r\n\u2028\u2029]/g, " ");
    const seg = new Seg(locale, { granularity: "sentence" });
    for (const s of seg.segment(norm) as Iterable<{ index: number; segment: string }>) {
      push(s.index, s.index + s.segment.length);
    }
    return out;
  }

  // Fallback: break after sentence-terminal punctuation followed by whitespace.
  const re = /[^.!?…]*[.!?…]+["')\]]?\s+|[^.!?…]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    push(m.index, m.index + m[0].length);
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-length matches
  }
  return out;
}

/** A sentence to speak, with the DOM range that highlights it. */
interface Sentence {
  text: string;
  range: Range;
}

/** One readable chunk: a text node, or a `<primer-math>` we can pronounce (with its spoken form). */
type Item =
  | { kind: "text"; node: Text; text: string }
  | { kind: "math"; el: Element; text: string };

/**
 * Gather the card's readable chunks in document order: text nodes plus any `<primer-math>` whose
 * LaTeX is a pronounceable arithmetic subset (see {@link speakLatex}). Code, widgets, un-speakable
 * maths, and the read-aloud button are skipped.
 */
function gatherItems(card: Element): Item[] {
  const items: Item[] = [];
  const recurse = (parent: Node) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const s = child.nodeValue ?? "";
        if (s.length > 0) items.push({ kind: "text", node: child as Text, text: s });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (el.tagName === "PRIMER-MATH") {
          const spoken = speakLatex(mathSource(el));
          // Pad so the injected phrase never glues to the neighbouring words.
          if (spoken) items.push({ kind: "math", el, text: ` ${spoken} ` });
        } else if (!SKIP_TAGS.has(el.tagName) && !el.classList.contains("card-readaloud")) {
          recurse(el);
        }
      }
    }
  };
  recurse(card);
  return items;
}

/**
 * Extract `card`'s sentences, each paired with a DOM `Range`. Readable chunks (text + speakable
 * maths) are concatenated in document order; a change of block ancestor forces a sentence break so
 * list items and paragraphs never merge. Each sentence's [start,end) offsets map back to a single
 * `Range` (which may span inline elements — fine for highlighting).
 */
function collectSentences(card: Element): Sentence[] {
  const segments: { item: Item; start: number; end: number }[] = [];
  const breaks: number[] = []; // offsets in `full` where a block boundary occurs
  let full = "";
  let prevBlock: Element | null = null;

  for (const item of gatherItems(card)) {
    const node = item.kind === "text" ? item.node : item.el;
    const block = closestBlock(node, card);
    if (prevBlock && block !== prevBlock) breaks.push(full.length);
    prevBlock = block;
    segments.push({ item, start: full.length, end: full.length + item.text.length });
    full += item.text;
  }
  if (segments.length === 0) return [];

  // A DOM point (node + offset) for an absolute offset into `full`. `atEnd` picks the segment
  // containing off-1 (an exclusive end sits at the end of the previous char). A math chunk maps
  // to the position just before it (start) or just after it (end) within its parent.
  const point = (off: number, atEnd: boolean): { node: Node; offset: number } => {
    for (const seg of segments) {
      const inside = atEnd ? off > seg.start && off <= seg.end : off >= seg.start && off < seg.end;
      if (!inside) continue;
      if (seg.item.kind === "text") return { node: seg.item.node, offset: off - seg.start };
      const el = seg.item.el;
      const parent = el.parentNode as Node;
      const idx = Array.prototype.indexOf.call(parent.childNodes, el);
      return { node: parent, offset: atEnd ? idx + 1 : idx };
    }
    const last = segments[segments.length - 1];
    return last.item.kind === "text"
      ? { node: last.item.node, offset: last.item.node.length }
      : { node: last.item.el.parentNode as Node, offset: 0 };
  };

  const locale = getLocale();
  const bounds = [0, ...breaks, full.length];
  const sentences: Sentence[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const b0 = bounds[i];
    const b1 = bounds[i + 1];
    if (b1 <= b0) continue;
    for (const span of segmentSentences(full.slice(b0, b1), locale)) {
      const ss = b0 + span.start;
      const se = b0 + span.end;
      const range = document.createRange();
      const a = point(ss, false);
      const b = point(se, true);
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      // Collapse whitespace (source newlines, and gaps left by skipped images/maths) and drop
      // any space left before punctuation, so the utterance reads cleanly; the range still covers
      // the real prose in the DOM.
      const text = full
        .slice(ss, se)
        .replace(/\s+/g, " ")
        .replace(/\s+([.,!?;:])/g, "$1")
        .trim();
      sentences.push({ text, range });
    }
  }
  return sentences;
}

// --- Highlighting -------------------------------------------------------------------------------

const HIGHLIGHT_NAME = "primer-reading";
let highlight: { clear(): void; add(r: Range): void } | null = null;

/** The shared Highlight (registered once), or null where the CSS Custom Highlight API is absent. */
function getHighlight(): { clear(): void; add(r: Range): void } | null {
  if (highlight) return highlight;
  const G = globalThis as unknown as {
    CSS?: { highlights?: Map<string, unknown> };
    Highlight?: new (...ranges: Range[]) => { clear(): void; add(r: Range): void };
  };
  if (!G.CSS?.highlights || typeof G.Highlight !== "function") return null;
  highlight = new G.Highlight();
  G.CSS.highlights.set(HIGHLIGHT_NAME, highlight as unknown);
  return highlight;
}

const reduceMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function showSentence(range: Range): void {
  const hl = getHighlight();
  if (hl) {
    hl.clear();
    hl.add(range);
  }
  // Keep the read sentence in view (instant when the learner prefers reduced motion).
  const anchor = range.startContainer.parentElement;
  anchor?.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
}

function clearHighlight(): void {
  getHighlight()?.clear();
}

// --- The single active reader -------------------------------------------------------------------

interface ActiveReader {
  card: Element;
  cancel(): void;
}
let active: ActiveReader | null = null;

/** Stop whatever card is currently being read (if any), clearing its highlight + button state. */
export function stopActiveReader(): void {
  active?.cancel();
}

/** State of a card's read-aloud button, reported back to the component. */
export type ReadState = "reading" | "idle";

/**
 * Start reading `card` aloud, highlighting each sentence. Cancels any other card already
 * reading (only one at a time). `onState` fires with "reading" immediately and "idle" when the
 * reading finishes, is cancelled, or there is nothing to read — the component uses it to toggle
 * the play/stop button. Returns nothing; use {@link stopActiveReader} (or press again) to stop.
 */
export function readCard(card: Element, onState: (state: ReadState) => void): void {
  stopActiveReader();

  const sentences = collectSentences(card);
  if (sentences.length === 0) {
    onState("idle");
    return;
  }

  let stopped = false;
  const seq = speakSequence(
    sentences.map((s) => s.text),
    { onChunkStart: (i) => showSentence(sentences[i].range) },
  );

  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearHighlight();
    if (active?.card === card) active = null;
    onState("idle");
  };

  active = {
    card,
    cancel: () => {
      seq.cancel();
      finish();
    },
  };
  onState("reading");
  void seq.done.then(finish);
}
