/**
 * Tests for src/course-quiz-core.ts — the pure logic behind the /course-quiz harvester: the
 * `"primer"` import rewrite applied to fetched page scripts, the concept-prefix namespacing that
 * makes cross-page registry-name collisions harmless, and the inverse-star-weighted sampler.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  rewritePrimerImports,
  prefixedName,
  prefixQuestionRefs,
  rekeySceneStrings,
  isQuestion,
  makeSampler,
  type HarvestedQuestion,
} from "../src/course-quiz-core.ts";

const URL = "https://example.test/dist/bundle/primer-ABC123.js";

test("rewritePrimerImports rewrites static and dynamic bare specifiers, both quote styles", () => {
  const code = `import { registerQuiz, makeStrings } from "primer";
    const lazy = await import("primer");
    import x from 'primer';`;
  const out = rewritePrimerImports(code, URL);
  assert.equal(out.includes(`from "${URL}"`), true);
  assert.equal(out.includes(`import("${URL}")`), true);
  assert.equal(out.includes(`from '${URL}'`), true);
  assert.equal(out.includes(`"primer"`), false);
});

test("rewritePrimerImports leaves non-import mentions of the word primer alone", () => {
  const code = `const s = "primer"; // a string, not an import\nconst t = makeStrings("primerQuiz@1");`;
  assert.equal(rewritePrimerImports(code, URL), code);
});

test("prefixQuestionRefs rewrites every scene reference and leaves text options alone", () => {
  const q: any = {
    prompt: "Which diagram?",
    figure: "fig",
    options: [
      { geometry: "showA", correct: true },
      { chart: "curveB", correct: false },
      { text: "$5$", correct: false },
    ],
  };
  const out: any = prefixQuestionRefs(q, "maths/add");
  assert.equal(out.figure, "maths/add::fig");
  assert.equal(out.options[0].geometry, "maths/add::showA");
  assert.equal(out.options[1].chart, "maths/add::curveB");
  assert.equal(out.options[2].text, "$5$");
  assert.equal((q as any).figure, "fig"); // original untouched (clone)
});

test("prefixQuestionRefs handles problem/program questions", () => {
  assert.equal((prefixQuestionRefs({ problem: "p1" } as any, "c") as any).problem, "c::p1");
  assert.equal((prefixQuestionRefs({ program: "sq" } as any, "c") as any).program, "c::sq");
});

test("rekeySceneStrings re-keys namespaces (JSONC tolerated) and rejects garbage", () => {
  const block = `{ // a comment — JSONC is legal in scene-strings
    "addQuiz@1": { "intro": "Add!" }, "fig": { "title": "Figure" }, }`;
  const out = rekeySceneStrings(block, "maths/add");
  assert.ok(out);
  const parsed = JSON.parse(out!);
  assert.deepEqual(Object.keys(parsed).sort(), ["maths/add::addQuiz@1", "maths/add::fig"]);
  assert.equal(parsed["maths/add::addQuiz@1"].intro, "Add!");
  assert.equal(rekeySceneStrings("not json at all {{{", "c"), null);
  assert.equal(rekeySceneStrings(`[1,2]`, "c"), null);
});

test("two pages sharing a quiz/scene NAME stay distinct once prefixed (the collision case)", () => {
  // e.g. archQuiz@1 exists on two real pages; prefixed names cannot collide.
  assert.notEqual(prefixedName("cs/kernels", "archQuiz@1"), prefixedName("maths/arch-models", "archQuiz@1"));
});

test("isQuestion separates questions from the leading config item", () => {
  assert.equal(isQuestion({ num_questions: 5, preamble: "Go!" }), false);
  assert.equal(isQuestion({ prompt: "?", options: [{ text: "a", correct: true }] }), true);
  assert.equal(isQuestion({ prompt: "?", answer: 6 }), true);
  assert.equal(isQuestion({ prompt: "?", answer: 0 }), true); // falsy-but-defined answer counts
  assert.equal(isQuestion({ problem: "p" }), true);
  assert.equal(isQuestion({ program: "p" }), true);
  assert.equal(isQuestion(null), false);
});

// ---- sampler -------------------------------------------------------------------------------------

const pool = (ids: string[], perConcept = 2): HarvestedQuestion[] =>
  ids.flatMap((id) =>
    Array.from({ length: perConcept }, (_, i) => ({ conceptId: id, question: { prompt: `${id}#${i}`, answer: i } as any })),
  );

/** A deterministic LCG rng for reproducible sampling tests. */
function lcg(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 2 ** 32) >>> 0) / 2 ** 32;
}

test("sampler draws low-star concepts far more often (weight ∝ 1/(1+stars))", () => {
  const stars: Record<string, number> = { weak: 0, strong: 10 };
  const next = makeSampler(pool(["weak", "strong"], 5), (id) => stars[id], () => true, lcg());
  const counts: Record<string, number> = { weak: 0, strong: 0 };
  for (let i = 0; i < 2000; i++) counts[next()!.conceptId]++;
  // Expected ratio 11:1 — allow generous slack for the LCG.
  assert.ok(counts.weak > counts.strong * 6, `weak=${counts.weak} strong=${counts.strong}`);
  assert.ok(counts.strong > 0); // mastered still appears occasionally, never never
});

test("sampler honours eligibility (recap excludes unseen) and re-reads stars at draw time", () => {
  const stars: Record<string, number> = { seen: 2, unseen: 0 };
  const seenOnly = (id: string) => id !== "unseen";
  const next = makeSampler(pool(["seen", "unseen"]), (id) => stars[id], seenOnly, lcg(7));
  for (let i = 0; i < 50; i++) assert.equal(next()!.conceptId, "seen");
  // With nothing eligible the sampler yields null.
  const none = makeSampler(pool(["a"]), () => 0, () => false, lcg(1));
  assert.equal(none(), null);
});

test("sampler draws without replacement within a concept, then reshuffles and repeats", () => {
  const next = makeSampler(pool(["only"], 3), () => 0, () => true, lcg(3));
  const firstCycle = new Set([next()!.question, next()!.question, next()!.question].map((q: any) => q.prompt));
  assert.equal(firstCycle.size, 3); // all three distinct before any repeats
  const fourth = next()!; // bank exhausted → reshuffled repeat, not null
  assert.ok(fourth && firstCycle.has((fourth.question as any).prompt));
});
