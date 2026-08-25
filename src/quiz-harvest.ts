/**
 * Harvest a concept page's quiz bank into the current document — used by /course-quiz and
 * /get-started. See src/course-quiz.ts for the full story (script rewrite, registry aliasing,
 * scene-strings re-keying, locale overlays).
 *
 * Callers must pass the **app** bundle URL (`manifest.app`), not the concept `primer` entry:
 * that entry imports `render.ts`, which would wrap the current page as a lesson.
 * @module
 */

import type { AuthoredQuestion } from "./types/domain.ts";
import { DEFAULT_LOCALE } from "./i18n.ts";
import { makeStrings } from "./scene-strings.ts";
import {
  getQuiz,
  getChart, registerChart,
  get3dChart, register3dChart,
  getGeometryScene, registerGeometryScene,
  getGeometryProblem, registerGeometryProblem,
  getProgram, registerProgram,
} from "./scenes.ts";
import {
  type HarvestedQuestion,
  rewritePrimerImports,
  prefixedName,
  prefixQuestionRefs,
  rekeySceneStrings,
  isQuestion,
} from "./course-quiz-core.ts";

export type { HarvestedQuestion };

const REGISTRY_EVENTS = [
  "primer:quiz-registered",
  "primer:chart-registered",
  "primer:chart3d-registered",
  "primer:geometry-registered",
  "primer:geometry-problem-registered",
  "primer:program-registered",
] as const;

/**
 * get/re-register pairs used to alias a page's registrations under the prefixed names. CAREFUL:
 * `registerGeometryScene`/`register3dChart` WRAP `(builder, opts)` into an `{builder, opts}` entry,
 * so aliasing their registries must UNWRAP the fetched entry back into arguments — passing the
 * entry object as the builder double-wraps it and every aliased scene dies with
 * "entry.builder is not a function" at render time.
 */
const ALIASERS: Record<string, { get: (n: string) => any; register: (n: string, v: any) => void }> = {
  "primer:chart-registered": { get: getChart, register: (n, v) => registerChart(n, v) },
  "primer:chart3d-registered": { get: get3dChart, register: (n, v) => register3dChart(n, v.builder, v.opts) },
  "primer:geometry-registered": { get: getGeometryScene, register: (n, v) => registerGeometryScene(n, v.builder, v.opts) },
  "primer:geometry-problem-registered": { get: getGeometryProblem, register: (n, v) => registerGeometryProblem(n, v) },
  "primer:program-registered": { get: getProgram, register: (n, v) => registerProgram(n, v) },
};

/**
 * Harvest ONE concept page: execute its scripts, alias its registrations, inject its (re-keyed)
 * scene-strings, and return its questions tagged + scene-refs prefixed. Throws on a fetch failure;
 * script/builder errors degrade to fewer questions.
 *
 * NOT SAFE TO CALL CONCURRENTLY. Registrations are captured via `document`-level CustomEvents
 * (the registries expose no enumeration) and each quiz builder is invoked bound to THIS call's own
 * parsed `doc`. Two overlapping calls each have their listener live on the same `document` at once,
 * so one page's registration events leak into the other's capture set — its builder then gets
 * invoked bound to the WRONG page's `doc`, and every `sceneStrings()` call inside it misses,
 * surfacing as a literal `$$name.key$$` placeholder in place of the question text. Callers that
 * want overlapping harvests for latency (e.g. prefetching) MUST serialize the actual `harvestPage`
 * calls themselves (e.g. a FIFO promise chain) — see `src/get-started.ts`'s `harvest()`.
 */
export async function harvestPage(conceptId: string, locale: string, bundleUrl: string): Promise<HarvestedQuestion[]> {
  const res = await fetch(`/concepts/${conceptId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");

  // Non-English: fold the overlay's scene-strings in, tagged data-locale (per-key fallback to the
  // page's untagged English blocks — exactly the lesson renderer's model).
  if (locale !== DEFAULT_LOCALE) {
    try {
      const ov = await fetch(`/i18n/${locale}/${conceptId}.html`);
      if (ov.ok) {
        const ovDoc = new DOMParser().parseFromString(await ov.text(), "text/html");
        for (const block of ovDoc.querySelectorAll("script.scene-strings")) {
          const clone = doc.createElement("script");
          clone.setAttribute("type", "application/json");
          clone.className = "scene-strings";
          clone.setAttribute("data-locale", locale);
          clone.textContent = block.textContent;
          doc.body.appendChild(clone);
        }
      }
    } catch {
      /* overlay unavailable — English questions */
    }
  }

  // Execute the page's module scripts (imports rewritten), capturing what THEY register via the
  // announce events (the registries expose no enumeration).
  const captured = new Map<string, Set<string>>(REGISTRY_EVENTS.map((e) => [e, new Set<string>()]));
  const listeners = REGISTRY_EVENTS.map((eventName) => {
    const fn = (e: Event) => {
      const name = (e as CustomEvent).detail?.name;
      if (typeof name === "string") captured.get(eventName)?.add(name);
    };
    document.addEventListener(eventName, fn);
    return { eventName, fn };
  });
  try {
    for (const script of doc.querySelectorAll('script[type="module"]')) {
      const code = script.textContent ?? "";
      if (!/\bregister[A-Z]/.test(code)) continue;
      const blobUrl = URL.createObjectURL(new Blob([rewritePrimerImports(code, bundleUrl)], { type: "text/javascript" }));
      try {
        await import(/* @vite-ignore */ blobUrl);
      } catch (err) {
        console.warn(`[quiz-harvest] script failed on ${conceptId}:`, err);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
  } finally {
    for (const { eventName, fn } of listeners) document.removeEventListener(eventName, fn);
  }

  // Alias every non-quiz registration under the concept-prefixed name BEFORE any later page can
  // overwrite the original.
  for (const [eventName, names] of captured) {
    const aliaser = ALIASERS[eventName];
    if (!aliaser) continue;
    for (const name of names) {
      const value = aliaser.get(name);
      if (value !== undefined) aliaser.register(prefixedName(conceptId, name), value);
    }
  }

  // Inject the page's scene-strings into THIS document so render-time lookups resolve — TWICE:
  //  - re-keyed to the prefixed namespaces (what the aliased scenes' own `sceneStrings` accessors
  //    resolve, collision-proof), AND
  //  - under the ORIGINAL namespaces, because author-created thunks captured inside registered
  //    scene opts/defs (a geometry `title: () => makeStrings("fig")("title")`, chart label thunks)
  //    still look up the un-prefixed name against the global document. An original-namespace
  //    collision across pages can at worst show the other page's TITLE text — cosmetic, and far
  //    better than a `$$ns.key$$` placeholder. Locale blocks keep their data-locale tag.
  for (const block of doc.querySelectorAll("script.scene-strings")) {
    const loc = block.getAttribute("data-locale");
    const inject = (text: string | null) => {
      if (!text) return;
      const el = document.createElement("script");
      el.setAttribute("type", "application/json");
      el.className = "scene-strings";
      if (loc) el.setAttribute("data-locale", loc);
      el.textContent = text;
      document.body.appendChild(el);
    };
    inject(rekeySceneStrings(block.textContent ?? "", conceptId));
    inject(block.textContent);
  }

  // Invoke each quiz builder NOW (with strings bound to the page's own document) and pool its
  // questions. Prompts/option-text closures keep resolving against `doc` at generate time.
  const questions: HarvestedQuestion[] = [];
  for (const name of captured.get("primer:quiz-registered") ?? []) {
    const builder = getQuiz(name);
    if (!builder) continue;
    try {
      const items = builder({ sceneStrings: makeStrings(name, doc) });
      for (const item of items) {
        if (isQuestion(item)) questions.push({ conceptId, question: prefixQuestionRefs(item as AuthoredQuestion, conceptId) });
      }
    } catch (err) {
      console.warn(`[quiz-harvest] quiz builder "${name}" failed on ${conceptId}:`, err);
    }
  }
  return questions;
}
