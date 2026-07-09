// @ts-check
/**
 * Tests for js/confidence-store.js — the single accessor for the on-disk confidence shape.
 * The parse path (private `parseEntry`, exercised through `readEntry`/`allEntries`) must stay
 * backward-compatible with THREE stored forms: the `[stars, first, last]` tuple, a legacy bare
 * number (`"5"`), and a non-JSON numeric string. Its output feeds the cross-device merge
 * tie-break in js/progress-core.js, so a parse regression silently loses ratings on merge.
 *
 * localStorage is stubbed on globalThis (node has none); the store swallows storage errors,
 * so the stub only needs the happy-path surface.
 */
import test from "node:test";
import assert from "node:assert/strict";

/** A minimal in-memory localStorage. */
function makeStorage() {
  /** @type {Map<string, string>} */
  const m = new Map();
  return {
    getItem: (/** @type {string} */ k) => (m.has(k) ? /** @type {string} */ (m.get(k)) : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => void m.set(k, String(v)),
    removeItem: (/** @type {string} */ k) => void m.delete(k),
    key: (/** @type {number} */ i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    _map: m,
  };
}

const storage = makeStorage();
/** @type {any} */ (globalThis).localStorage = storage;

const { readEntry, writeEntry, removeEntry, allEntries, clearAll, MAX_STARS, CONFIDENCE_PREFIX } = await import(
  "../js/confidence-store.js"
);

const KEY = (/** @type {string} */ id) => CONFIDENCE_PREFIX + id;

test("readEntry parses the modern [stars, first, last] tuple", () => {
  storage.setItem(KEY("a/b"), JSON.stringify([5, "2026-05-01", "2026-06-18"]));
  assert.deepEqual(readEntry("a/b"), { stars: 5, first: "2026-05-01", last: "2026-06-18" });
});

test("a tuple missing `last` falls back to `first` (same-day rating)", () => {
  storage.setItem(KEY("t"), JSON.stringify([3, "2026-05-01"]));
  assert.deepEqual(readEntry("t"), { stars: 3, first: "2026-05-01", last: "2026-05-01" });
});

test("legacy bare-number JSON is an undated score (loses merge ties, by design)", () => {
  storage.setItem(KEY("legacy"), "5");
  assert.deepEqual(readEntry("legacy"), { stars: 5, first: "", last: "" });
});

test("a non-JSON numeric string is tolerated as a bare score", () => {
  storage.setItem(KEY("raw"), "07"); // JSON.parse("07") throws — exercises the catch path
  assert.deepEqual(readEntry("raw"), { stars: 7, first: "", last: "" });
});

test("garbage and absent values read as null", () => {
  storage.setItem(KEY("junk"), "not a score");
  assert.equal(readEntry("junk"), null);
  assert.equal(readEntry("never-rated"), null);
  storage.setItem(KEY("nan-tuple"), JSON.stringify(["x", "2026-01-01"]));
  assert.equal(readEntry("nan-tuple"), null);
});

test("stars are rounded and clamped to [0, MAX_STARS] on read", () => {
  storage.setItem(KEY("hot"), JSON.stringify([99, "2026-01-01", "2026-01-02"]));
  assert.equal(readEntry("hot")?.stars, MAX_STARS);
  storage.setItem(KEY("cold"), JSON.stringify([-3, "2026-01-01", "2026-01-02"]));
  assert.equal(readEntry("cold")?.stars, 0);
  storage.setItem(KEY("frac"), JSON.stringify([4.6, "2026-01-01", "2026-01-02"]));
  assert.equal(readEntry("frac")?.stars, 5);
});

test("writeEntry round-trips and preserves `first` across a re-rating", () => {
  writeEntry("w", 4, "2026-02-03", "2026-02-03");
  assert.deepEqual(readEntry("w"), { stars: 4, first: "2026-02-03", last: "2026-02-03" });
  writeEntry("w", 8); // re-rate: first must be preserved, last re-stamped
  const e = readEntry("w");
  assert.equal(e?.stars, 8);
  assert.equal(e?.first, "2026-02-03");
  assert.notEqual(e?.last, "2026-02-03");
});

test("allEntries lists only confidence keys and skips unparseable ones; clearAll removes only ours", () => {
  clearAll();
  storage.setItem("primer:theme", "dark"); // unrelated key must survive and never be listed
  storage.setItem(KEY("x"), JSON.stringify([2, "2026-01-01", "2026-01-01"]));
  storage.setItem(KEY("bad"), "garbage");
  const ids = allEntries().map((e) => e.id);
  assert.deepEqual(ids, ["x"]);
  clearAll();
  assert.equal(allEntries().length, 0);
  assert.equal(storage.getItem("primer:theme"), "dark");
  removeEntry("x"); // no-throw on an already-removed id
});
