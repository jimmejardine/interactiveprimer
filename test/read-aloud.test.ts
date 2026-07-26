import test from "node:test";
import assert from "node:assert/strict";
import { segmentSentences, speakLatex } from "../src/read-aloud.ts";

/** Map spans back to their substrings for readable assertions. */
const parts = (text: string) => segmentSentences(text).map((s) => text.slice(s.start, s.end));

test("splits prose into sentences on terminal punctuation", () => {
  assert.deepEqual(parts("One. Two. Three."), ["One.", "Two.", "Three."]);
  assert.deepEqual(parts("Wait! Really? Yes."), ["Wait!", "Really?", "Yes."]);
});

test("a fragment with no terminal punctuation is one sentence", () => {
  assert.deepEqual(parts("Hello world"), ["Hello world"]);
});

test("spans exclude surrounding whitespace", () => {
  const text = "  First.   Second.  ";
  const spans = segmentSentences(text);
  assert.deepEqual(
    spans.map((s) => text.slice(s.start, s.end)),
    ["First.", "Second."],
  );
  // Offsets point at the trimmed sentence, not the leading spaces.
  assert.equal(text[spans[0].start], "F");
});

test("a newline inside a sentence does not split it (source-HTML indentation)", () => {
  // Unicode rule SB4 would break after a line feed; segmentSentences normalizes newlines first.
  assert.deepEqual(parts("The rectangle is the\n        universal set here. Next one."), [
    "The rectangle is the\n        universal set here.",
    "Next one.",
  ]);
});

test("blank or whitespace-only input yields no sentences", () => {
  assert.deepEqual(segmentSentences(""), []);
  assert.deepEqual(segmentSentences("    \n  "), []);
});

test("speakLatex pronounces simple arithmetic", () => {
  assert.equal(speakLatex("3"), "3");
  assert.equal(speakLatex("10"), "10");
  assert.equal(speakLatex("2 + 3 = 5"), "2 plus 3 equals 5");
  assert.equal(speakLatex("6 \\times 7"), "6 times 7");
  assert.equal(speakLatex("8 \\div 2"), "8 divided by 2");
  assert.equal(speakLatex("\\frac{3}{4}"), "3 over 4");
  assert.equal(speakLatex("x - 1"), "x minus 1");
});

test("speakLatex returns null for maths it cannot safely pronounce", () => {
  assert.equal(speakLatex("a^2 + b^2 = c^2"), null); // exponents
  assert.equal(speakLatex("A \\cap B"), null); // unknown command
  assert.equal(speakLatex("\\int_0^1 x\\,dx"), null); // integral / subscript
  assert.equal(speakLatex("\\sqrt{2}"), null); // unknown command
  assert.equal(speakLatex(""), null);
});

test("offsets are non-overlapping and in order", () => {
  const text = "Alpha. Beta gamma. Delta!";
  const spans = segmentSentences(text);
  for (let i = 1; i < spans.length; i++) {
    assert.ok(spans[i].start >= spans[i - 1].end, "spans should not overlap");
  }
  assert.ok(spans.length >= 3);
});
