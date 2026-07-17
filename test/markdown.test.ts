import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/markdown.ts";

/** Strip whitespace between tags so structural assertions aren't brittle. */
const compact = (s: string) => s.replace(/\s*\n\s*/g, "");

test("renders ATX headings at the right level", () => {
  assert.equal(renderMarkdown("# Title"), "<h1>Title</h1>");
  assert.equal(renderMarkdown("### Hi there"), "<h3>Hi there</h3>");
});

test("renders a horizontal rule", () => {
  assert.equal(renderMarkdown("---"), "<hr>");
});

test("wraps loose text in a paragraph and applies inline formatting", () => {
  const html = renderMarkdown("**B** and *I* and `c`.");
  assert.equal(html, "<p><strong>B</strong> and <em>I</em> and <code>c</code>.</p>");
});

test("inline code is protected and real numbers are left alone", () => {
  // Regression: an earlier placeholder collided with bare numbers like "100".
  assert.equal(renderMarkdown("Number words to 20 / 100 / 1000"), "<p>Number words to 20 / 100 / 1000</p>");
  assert.equal(renderMarkdown("Run `npm run check` now"), "<p>Run <code>npm run check</code> now</p>");
});

test("links: external get target+rel, internal do not", () => {
  assert.ok(renderMarkdown("[x](https://e.com/p)").includes('<a href="https://e.com/p" target="_blank" rel="noopener">x</a>'));
  assert.ok(renderMarkdown("[home](/concepts/root.html)").includes('<a href="/concepts/root.html">home</a>'));
  assert.ok(!renderMarkdown("[home](/concepts/root.html)").includes("target="));
});

test("escapes HTML special characters", () => {
  assert.ok(renderMarkdown("a < b & c").includes("<p>a &lt; b &amp; c</p>"));
});

test("nests unordered lists by indentation (3 levels deep)", () => {
  const html = compact(renderMarkdown("- a\n  - b\n    - c"));
  assert.equal(html, "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>");
});

test("siblings and outdent close the right number of lists", () => {
  const html = compact(renderMarkdown("- a\n  - b\n- c"));
  assert.equal(html, "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
});

test("a blank line / heading after a list closes it", () => {
  const html = compact(renderMarkdown("- a\n- b\n\n# Next"));
  assert.equal(html, "<ul><li>a</li><li>b</li></ul><h1>Next</h1>");
});
