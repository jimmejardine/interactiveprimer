/**
 * A tiny, dependency-free Markdown to HTML renderer for the small, controlled subset our roadmap
 * docs use (the `concepts/<subject>/planned_concepts.md` roadmaps): ATX headings, nested lists, paragraphs,
 * horizontal rules, and the inline run of bold / italic / code / links. It is NOT a general
 * CommonMark engine, just enough to render our own authored docs, kept pure (no DOM) so it's
 * unit-tested like the rest of `js/`.
 * @module
 */

import { escapeHtml } from "./html-entities.ts";

// `\x60` is the backtick character; used in regexes so the source has no literal backtick inside a
// regex literal (which trips up some parsers).
const BT = "\\x60";

/**
 * Apply inline formatting to one already-HTML-escaped line: code spans, `[text](url)` links,
 * `**bold**`, then `*italic*` / `_italic_`. Order matters (code first so its contents aren't
 * re-formatted; bold before italic so `**` isn't eaten as two `*`).
 * @param text  An HTML-escaped string.
 */
function inline(text: string): string {
  // Inline code first: stash each span behind an ASCII sentinel ("@@CODE0@@") that can't appear in
  // our prose, so later passes don't reformat code contents and real numbers aren't disturbed.
  const codes: string[] = [];
  let s = text.replace(new RegExp(BT + "([^" + BT + "]+)" + BT, "g"), (_, code) => {
    codes.push("<code>" + code + "</code>");
    return "@@CODE" + (codes.length - 1) + "@@";
  });
  // Links: [text](url). URL is escaped already; only allow http(s), mailto, root-relative, and #.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    if (!/^(https?:\/\/|mailto:|\/|#)/.test(href.replace(/&amp;/g, "&"))) return whole;
    const external = /^https?:\/\//.test(href);
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^\w])_([^_\n]+)_/g, "$1<em>$2</em>");
  // Restore code spans.
  s = s.replace(/@@CODE(\d+)@@/g, (_, i) => codes[Number(i)]);
  return s;
}

/**
 * Render a Markdown string to an HTML string. Block grammar (line-based): ATX headings (1–6 `#`),
 * unordered list items (`-`/`*`/`+`, nested by indentation — 2 spaces is one level), horizontal
 * rules (`---`/`***`/`___`), and blank-line-separated paragraphs. Everything else is treated as
 * paragraph text. Inline formatting is applied to heading text, list items and paragraphs.
 */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  /** Indent width at each currently-open <ul>. */
  const listStack: number[] = [];
  /** Lines of the paragraph currently being accumulated. */
  let para: string[] = [];

  const closeLists = () => {
    while (listStack.length) {
      out.push("</li></ul>");
      listStack.pop();
    }
  };
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(escapeHtml(para.join(" ")))}</p>`);
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (line.trim() === "") {
      flushPara();
      continue;
    }

    // Horizontal rule.
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) {
      flushPara();
      closeLists();
      out.push("<hr>");
      continue;
    }

    // Heading.
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeLists();
      const level = h[1].length;
      out.push(`<h${level}>${inline(escapeHtml(h[2].trim()))}</h${level}>`);
      continue;
    }

    // List item: leading spaces, then a bullet marker.
    const li = /^(\s*)([-*+])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const indent = li[1].length;
      const content = inline(escapeHtml(li[3]));
      if (!listStack.length || indent > listStack[listStack.length - 1]) {
        // Open a deeper list (the new <ul> nests inside the current <li>, which stays open).
        out.push("<ul>");
        listStack.push(indent);
      } else {
        // Same or shallower level: close the previous <li>, then pop lists we've outdented past.
        out.push("</li>");
        while (listStack.length > 1 && indent < listStack[listStack.length - 1]) {
          out.push("</ul></li>");
          listStack.pop();
        }
      }
      out.push(`<li>${content}`);
      continue;
    }

    // Anything else → paragraph text. A non-list, non-blank line also ends any open list.
    if (listStack.length) closeLists();
    para.push(line.trim());
  }

  flushPara();
  closeLists();
  return out.join("\n");
}
