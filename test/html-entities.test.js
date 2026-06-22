// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { decodeEntities } from "../js/html-entities.js";

test("decodes the common named entities", () => {
  assert.equal(decodeEntities("Forces &amp; Motion"), "Forces & Motion");
  assert.equal(decodeEntities("a &lt; b &gt; c"), "a < b > c");
  assert.equal(decodeEntities("she said &quot;hi&quot;"), 'she said "hi"');
  assert.equal(decodeEntities("it&apos;s"), "it's");
  assert.equal(decodeEntities("a&nbsp;b"), "a b");
});

test("decodes numeric (decimal) and hex entities", () => {
  assert.equal(decodeEntities("it&#39;s"), "it's");
  assert.equal(decodeEntities("&#65;&#66;&#67;"), "ABC");
  assert.equal(decodeEntities("&#x26; &#x3c;"), "& <");
  assert.equal(decodeEntities("&#X41;"), "A"); // capital X also accepted
});

test("leaves plain text and a bare ampersand untouched", () => {
  assert.equal(decodeEntities("Fractions, Decimals & Percentages"), "Fractions, Decimals & Percentages");
  assert.equal(decodeEntities("no entities here"), "no entities here");
  assert.equal(decodeEntities(""), "");
});

test("leaves unknown / malformed entities alone", () => {
  assert.equal(decodeEntities("R&D and AT&T"), "R&D and AT&T");
  assert.equal(decodeEntities("&notareal;"), "&notareal;");
  assert.equal(decodeEntities("&#;"), "&#;");
});

test("handles multiple and adjacent entities, and does not double-decode", () => {
  assert.equal(decodeEntities("&lt;a&gt;&lt;b&gt;"), "<a><b>");
  // A single sweep: &amp;lt; → &lt; (the inner entity is NOT then turned into '<').
  assert.equal(decodeEntities("&amp;lt;"), "&lt;");
});

test("non-strings pass through", () => {
  assert.equal(decodeEntities(/** @type {any} */ (null)), null);
  assert.equal(decodeEntities(/** @type {any} */ (5)), 5);
});
