import test from "node:test";
import assert from "node:assert/strict";
import { shouldLookup, wikiSummaryUrl, wikiArticleUrl, WORDS_MAX } from "../src/wiki.ts";

test("wikiSummaryUrl builds the REST endpoint with an underscored, encoded title", () => {
  assert.equal(
    wikiSummaryUrl("en", "Surreal number"),
    "https://en.wikipedia.org/api/rest_v1/page/summary/Surreal_number?redirect=true",
  );
  // Per-language host + special characters are percent-encoded.
  assert.equal(
    wikiSummaryUrl("es", "Número surreal"),
    "https://es.wikipedia.org/api/rest_v1/page/summary/N%C3%BAmero_surreal?redirect=true",
  );
});

test("wikiArticleUrl builds the human-facing /wiki/ URL", () => {
  assert.equal(wikiArticleUrl("en", "Number line"), "https://en.wikipedia.org/wiki/Number_line");
});

test("shouldLookup accepts short letter-bearing phrases", () => {
  assert.equal(shouldLookup("counting"), true);
  assert.equal(shouldLookup("surreal numbers"), true);
  assert.equal(shouldLookup("the fundamental theorem of arithmetic"), true); // 5 words
});

test("shouldLookup rejects long selections, empties, and non-words", () => {
  assert.equal(shouldLookup(""), false);
  assert.equal(shouldLookup("   "), false);
  assert.equal(shouldLookup("one two three four five six"), false); // 6 words > WORDS_MAX
  assert.equal(shouldLookup("12345"), false); // no letter
  assert.equal(shouldLookup("+-*/"), false); // no letter
  assert.equal(shouldLookup("a".repeat(61)), false); // too long
});

test("WORDS_MAX words is accepted, one more is rejected", () => {
  const words = (n: number) => Array.from({ length: n }, () => "cat").join(" ");
  assert.equal(shouldLookup(words(WORDS_MAX)), true);
  assert.equal(shouldLookup(words(WORDS_MAX + 1)), false);
});
