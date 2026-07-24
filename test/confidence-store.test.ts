/**
 * Tests for src/confidence-store.ts — the single accessor for the on-disk confidence shape.
 * The parse path (private `parseEntry`, exercised through `readEntry`/`allEntries`) must stay
 * backward-compatible with THREE stored forms: the `[stars, first, last]` tuple, a legacy bare
 * number (`"5"`), and a non-JSON numeric string. Its output feeds the cross-device merge
 * tie-break in src/progress-core.ts, so a parse regression silently loses ratings on merge.
 *
 * localStorage is stubbed on globalThis (node has none); the store swallows storage errors,
 * so the stub only needs the happy-path surface.
 */
import test from "node:test";
import assert from "node:assert/strict";

/** A minimal in-memory localStorage. */
function makeStorage() {
  const m: Map<string, string> = new Map();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    _map: m,
  };
}

const storage = makeStorage();
(globalThis as any).localStorage = storage;

const { readEntry, writeEntry, removeEntry, allEntries, clearAll, recordAnswers, starsFromCounters, MAX_STARS, CONFIDENCE_PREFIX } = await import(
  "../src/confidence-store.ts"
);

const KEY = (id: string) => CONFIDENCE_PREFIX + id;

test("readEntry parses a legacy [stars, first, last] 3-tuple (counters default 0)", () => {
  storage.setItem(KEY("a/b"), JSON.stringify([5, "2026-05-01", "2026-06-18"]));
  assert.deepEqual(readEntry("a/b"), { stars: 5, first: "2026-05-01", last: "2026-06-18", answered: 0, correct: 0 });
});

test("a tuple missing `last` falls back to `first` (same-day rating)", () => {
  storage.setItem(KEY("t"), JSON.stringify([3, "2026-05-01"]));
  assert.deepEqual(readEntry("t"), { stars: 3, first: "2026-05-01", last: "2026-05-01", answered: 0, correct: 0 });
});

test("legacy bare-number JSON is an undated score (loses merge ties, by design)", () => {
  storage.setItem(KEY("legacy"), "5");
  assert.deepEqual(readEntry("legacy"), { stars: 5, first: "", last: "", answered: 0, correct: 0 });
});

test("a non-JSON numeric string is tolerated as a bare score", () => {
  storage.setItem(KEY("raw"), "07"); // JSON.parse("07") throws — exercises the catch path
  assert.deepEqual(readEntry("raw"), { stars: 7, first: "", last: "", answered: 0, correct: 0 });
});

test("garbage and absent values read as null", () => {
  storage.setItem(KEY("junk"), "not a score");
  assert.equal(readEntry("junk"), null);
  assert.equal(readEntry("never-rated"), null);
  storage.setItem(KEY("nan-tuple"), JSON.stringify(["x", "2026-01-01"]));
  assert.equal(readEntry("nan-tuple"), null);
});

test("stars are clamped to [0, MAX_STARS] and kept fractional (2 dp) on read", () => {
  storage.setItem(KEY("hot"), JSON.stringify([99, "2026-01-01", "2026-01-02"]));
  assert.equal(readEntry("hot")?.stars, MAX_STARS);
  storage.setItem(KEY("cold"), JSON.stringify([-3, "2026-01-01", "2026-01-02"]));
  assert.equal(readEntry("cold")?.stars, 0);
  storage.setItem(KEY("frac"), JSON.stringify([4.6, "2026-01-01", "2026-01-02"]));
  assert.equal(readEntry("frac")?.stars, 4.6); // quiz-derived stars are fractional by design
  storage.setItem(KEY("fine"), JSON.stringify([3.333, "2026-01-01", "2026-01-02"]));
  assert.equal(readEntry("fine")?.stars, 3.33); // stored precision is 2 dp
});

test("writeEntry round-trips and preserves `first` across a re-rating", () => {
  writeEntry("w", 4, "2026-02-03", "2026-02-03");
  assert.deepEqual(readEntry("w"), { stars: 4, first: "2026-02-03", last: "2026-02-03", answered: 0, correct: 0 });
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

test("readEntry parses the 5-tuple [stars, first, last, answered, correct]", () => {
  storage.setItem(KEY("q"), JSON.stringify([6.67, "2026-05-01", "2026-06-18", 3, 2]));
  assert.deepEqual(readEntry("q"), { stars: 6.67, first: "2026-05-01", last: "2026-06-18", answered: 3, correct: 2 });
  // correct can never exceed answered; malformed counters coerce to 0
  storage.setItem(KEY("q2"), JSON.stringify([5, "2026-05-01", "2026-05-01", 2, 9]));
  assert.deepEqual(readEntry("q2")?.correct, 2);
  storage.setItem(KEY("q3"), JSON.stringify([5, "2026-05-01", "2026-05-01", "x", -1]));
  assert.deepEqual({ a: readEntry("q3")?.answered, c: readEntry("q3")?.correct }, { a: 0, c: 0 });
});

test("writeEntry preserves existing counters unless given new ones", () => {
  clearAll();
  storage.setItem(KEY("k"), JSON.stringify([3.33, "2026-01-01", "2026-01-01", 3, 1]));
  writeEntry("k", 9); // manual star set — quiz history must survive
  assert.deepEqual({ s: readEntry("k")?.stars, a: readEntry("k")?.answered, c: readEntry("k")?.correct }, { s: 9, a: 3, c: 1 });
  writeEntry("k", 5, "2026-01-01", "2026-02-02", { answered: 10, correct: 7 }); // verbatim (restore/pull)
  assert.deepEqual(readEntry("k"), { stars: 5, first: "2026-01-01", last: "2026-02-02", answered: 10, correct: 7 });
});

test("starsFromCounters: min denominator 3 — one lucky answer is 3.33 stars, never 10", () => {
  assert.equal(starsFromCounters(1, 1), 3.33);
  assert.equal(starsFromCounters(2, 2), 6.67);
  assert.equal(starsFromCounters(3, 3), 10);
  assert.equal(starsFromCounters(2, 3), 6.67); // correct capped at answered... (3 capped to 2 → 2/3)
  assert.equal(starsFromCounters(3, 2), 6.67);
  assert.equal(starsFromCounters(4, 1), 2.5);
  assert.equal(starsFromCounters(0, 0), 0);
  assert.equal(starsFromCounters(12, 0), 0);
  assert.equal(starsFromCounters(30, 30), 10);
});

test("recordAnswers accumulates counters and sets counter-derived stars", () => {
  clearAll();
  let e = recordAnswers("r", 1, 1); // first correct answer
  assert.deepEqual({ s: e.stars, a: e.answered, c: e.correct }, { s: 3.33, a: 1, c: 1 });
  e = recordAnswers("r", 1, 1); // 2/2
  assert.deepEqual({ s: e.stars, a: e.answered, c: e.correct }, { s: 6.67, a: 2, c: 2 });
  e = recordAnswers("r", 1, 0); // 2/3 — a miss now counts against the ratio
  assert.deepEqual({ s: e.stars, a: e.answered, c: e.correct }, { s: 6.67, a: 3, c: 2 });
  e = recordAnswers("r", 5, 5); // 7/8
  assert.deepEqual({ s: e.stars, a: e.answered, c: e.correct }, { s: 8.75, a: 8, c: 7 });
  // persisted round-trip
  assert.deepEqual({ a: readEntry("r")?.answered, c: readEntry("r")?.correct, s: readEntry("r")?.stars }, { a: 8, c: 7, s: 8.75 });
});
