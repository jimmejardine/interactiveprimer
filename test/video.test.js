// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { youtubeId, startSeconds } from "../js/youtube.js";

const ID = "dQw4w9WgXcQ"; // a real 11-char id shape

test("youtubeId extracts the id from common YouTube URL forms", () => {
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(youtubeId(`https://youtu.be/${ID}`), ID);
  assert.equal(youtubeId(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(youtubeId(`https://www.youtube.com/shorts/${ID}`), ID);
  assert.equal(youtubeId(`https://www.youtube-nocookie.com/embed/${ID}`), ID);
  assert.equal(youtubeId(`https://m.youtube.com/watch?v=${ID}`), ID);
});

test("youtubeId tolerates extra query params and a missing scheme", () => {
  assert.equal(youtubeId(`https://youtu.be/${ID}?t=42&si=abcDEF`), ID);
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=${ID}&list=PLxyz&index=2`), ID);
  assert.equal(youtubeId(`youtube.com/watch?v=${ID}`), ID);
  assert.equal(youtubeId(`youtu.be/${ID}`), ID);
});

test("youtubeId accepts a bare 11-char id", () => {
  assert.equal(youtubeId(ID), ID);
  assert.equal(youtubeId(`  ${ID}  `), ID);
});

test("youtubeId returns null for bad or non-YouTube input", () => {
  assert.equal(youtubeId(""), null);
  assert.equal(youtubeId("garbage"), null);
  assert.equal(youtubeId("https://vimeo.com/123456"), null);
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=tooShort`), null);
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=waytoolonganid12345`), null);
  assert.equal(youtubeId(/** @type {any} */ (null)), null);
  assert.equal(youtubeId(/** @type {any} */ (42)), null);
});

test("startSeconds reads start/t params (plain seconds and 1m30s form)", () => {
  assert.equal(startSeconds(`https://youtu.be/${ID}?t=90`), 90);
  assert.equal(startSeconds(`https://youtu.be/${ID}?t=1m30s`), 90);
  assert.equal(startSeconds(`https://www.youtube.com/watch?v=${ID}&start=42`), 42);
  assert.equal(startSeconds(`https://youtu.be/${ID}`), 0);
  assert.equal(startSeconds("garbage"), 0);
});
