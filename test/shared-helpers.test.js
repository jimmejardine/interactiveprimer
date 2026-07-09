// @ts-check
/**
 * Tests for the small pure helpers extracted during the dedup pass: escapeHtml (js/html-entities.js)
 * and clamp (js/svg-util.js). These protect the extractions that replaced ~a dozen copy-pasted copies.
 * (mk() needs a DOM and importUrl() needs a live URL, so they aren't unit-testable here.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../js/html-entities.js";
import { clamp } from "../js/svg-util.js";

test("escapeHtml escapes the five HTML-special characters", () => {
  assert.equal(
    escapeHtml(`<a href="x" title='y'>tom & jerry</a>`),
    "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;tom &amp; jerry&lt;/a&gt;",
  );
});

test("escapeHtml leaves plain text untouched and handles edge cases", () => {
  assert.equal(escapeHtml("plain text 123"), "plain text 123");
  assert.equal(escapeHtml(""), "");
  // Non-string input is coerced (matches the previous local copies' String(...) behaviour).
  assert.equal(escapeHtml(/** @type {any} */ (5)), "5");
});

test("clamp bounds a value into the inclusive range [lo, hi]", () => {
  assert.equal(clamp(5, 0, 10), 5); // inside
  assert.equal(clamp(-3, 0, 10), 0); // below → lo
  assert.equal(clamp(99, 0, 10), 10); // above → hi
  assert.equal(clamp(0, 0, 10), 0); // at lo
  assert.equal(clamp(10, 0, 10), 10); // at hi
});
