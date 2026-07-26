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

/**
 * Extract `card`'s sentences, each paired with a DOM `Range`. Text nodes are concatenated in
 * document order (skipping math/code/widgets); a change of block ancestor forces a sentence
 * break so list items and paragraphs never merge. Each sentence's [start,end) offsets are mapped
 * back to a single `Range` (which may span inline elements — fine for highlighting).
 */
function collectSentences(card: Element): Sentence[] {
  const segments: { node: Text; start: number; end: number }[] = [];
  const breaks: number[] = []; // offsets in `full` where a block boundary occurs
  let full = "";
  let prevBlock: Element | null = null;

  const w = textWalker(card);
  for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) {
    const s = n.nodeValue ?? "";
    if (s.length === 0) continue;
    const block = closestBlock(n, card);
    if (prevBlock && block !== prevBlock) breaks.push(full.length);
    prevBlock = block;
    segments.push({ node: n, start: full.length, end: full.length + s.length });
    full += s;
  }
  if (segments.length === 0) return [];

  // A DOM point (node + local offset) for an absolute offset into `full`. `atEnd` picks the
  // segment containing off-1 (an exclusive end position sits at the end of the previous char).
  const point = (off: number, atEnd: boolean): { node: Text; offset: number } => {
    for (const seg of segments) {
      const inside = atEnd ? off > seg.start && off <= seg.end : off >= seg.start && off < seg.end;
      if (inside) return { node: seg.node, offset: off - seg.start };
    }
    const last = segments[segments.length - 1];
    return { node: last.node, offset: last.node.length };
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
      // Collapse whitespace (source-HTML newlines, and the gaps left by skipped math) so the
      // utterance reads cleanly; the range still covers the real prose in the DOM.
      sentences.push({ text: full.slice(ss, se).replace(/\s+/g, " ").trim(), range });
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
