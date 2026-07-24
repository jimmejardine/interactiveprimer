/**
 * The /course-quiz page: an infinite-scrolling quiz over EVERY quiz bank in the active course,
 * harvested at runtime from the course's own concept pages.
 *
 * How the harvest works: each member page's HTML is fetched (extensionless `/concepts/<id>`, so a
 * downloaded course serves it offline), parsed with DOMParser, and its inline `<script
 * type="module">` blocks are executed here — with their bare `"primer"` imports rewritten to the
 * hashed core-bundle URL. The core and app bundles share the registry chunk (one ESM instance), so
 * those scripts register their quizzes/scenes into the SAME registries this page reads. Because
 * registry names are only unique per page, every registration is immediately re-registered
 * ("aliased") under a `<conceptId>::<name>` prefix, question scene references are rewritten to the
 * prefixed names, and the page's scene-strings blocks are injected into this document re-keyed the
 * same way — so cross-page name collisions cannot mix scenes up and nothing is dropped. For a
 * non-English locale the page's translation overlay is fetched too and its scene-strings ride along
 * tagged `data-locale`, so harvested questions render translated where a translation exists.
 *
 * Modes (differing in exactly two ways):
 *  - HARVEST includes unseen concepts (no stars, no quiz history) — the knowledge harvest at course
 *    start. An incorrect answer on an unseen concept is NOT recorded (no 0/n ratio is locked in for
 *    material never studied); a correct one is (prior knowledge banked).
 *  - RECAP samples only seen concepts; every answer is recorded.
 * In both modes a concept's draw probability is inversely proportional to its stars
 * (`1 / (1 + stars)`), so weak concepts surface most.
 *
 * Grading is per-question and immediate (see <primer-quiz-stream>): counters + stars update via
 * `recordAnswers` the moment an answer is picked, and each card reveals the concept + new stars.
 *
 * Known v1 limits: the cloud-sync Worker must be redeployed before counters survive a SERVER-side
 * merge (stars still merge fine); untranslated pages fall back to English questions (per-key, like
 * lessons).
 * @module
 */

import type { AuthoredQuestion } from "./types/domain.ts";
import { getCurrentCourse } from "./course.ts";
import { getLocale, t, DEFAULT_LOCALE } from "./i18n.ts";
import { makeStrings } from "./scene-strings.ts";
import { generateQuestion } from "./quiz.ts";
import { readEntry, recordAnswers, type ConfidenceEntry } from "./confidence-store.ts";
import {
  getQuiz,
  getChart, registerChart,
  get3dChart, register3dChart,
  getGeometryScene, registerGeometryScene,
  getGeometryProblem, registerGeometryProblem,
  getProgram, registerProgram,
} from "./scenes.ts";
// Side-effect import: defines <primer-quiz-stream>. (A type-only import would be tree-shaken by
// the bundler and the element would silently never register.)
import "./components/primer-quiz-stream.ts";
import type { PrimerQuizStream } from "./components/primer-quiz-stream.ts";
import {
  type HarvestedQuestion,
  rewritePrimerImports,
  prefixedName,
  prefixQuestionRefs,
  rekeySceneStrings,
  isQuestion,
  makeSampler,
} from "./course-quiz-core.ts";

export type { HarvestedQuestion };

// ---- the harvest ---------------------------------------------------------------------------------

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
 */
async function harvestPage(conceptId: string, locale: string, bundleUrl: string): Promise<HarvestedQuestion[]> {
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
        console.warn(`[course-quiz] script failed on ${conceptId}:`, err);
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
      console.warn(`[course-quiz] quiz builder "${name}" failed on ${conceptId}:`, err);
    }
  }
  return questions;
}

// ---- the page ------------------------------------------------------------------------------------

type Mode = "harvest" | "recap";

const seen = (e: ConfidenceEntry | null): boolean => !!e && (e.stars > 0 || e.answered > 0);

/**
 * Mount the course quiz into `root`. Layout/behaviour: header (course name + session stats), mode
 * chips, harvest progress, then the infinite <primer-quiz-stream> fed by an IntersectionObserver
 * sentinel.
 */
export async function mountCourseQuiz(root: HTMLElement, { byId }: { byId: Map<string, any> }): Promise<void> {
  const locale = getLocale();
  const titleOf = (id: string) => byId.get(id)?.titles?.[locale] ?? byId.get(id)?.title ?? (id.split("/").pop() ?? id);
  const el = (tag: string, cls: string, html?: string) => {
    const n = document.createElement(tag);
    n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  root.innerHTML = "";
  const courseId = getCurrentCourse();
  const course = courseId ? byId.get(courseId) : null;
  if (!course?.course) {
    root.append(
      el("section", "card empty-state", `<h2>${esc(t("coursequiz.noCourseTitle"))}</h2>
        <p>${esc(t("coursequiz.noCourseBody"))} <a href="/course">${esc(t("menu.course"))}</a></p>`),
    );
    return;
  }
  const members: string[] = (course.courseMembers ?? []).slice(1);

  const head = el("header", "dash-head", `<h1 class="dash-title">${esc(t("coursequiz.heading"))}<span class="dash-course">: <a href="/concepts/${esc(courseId)}">${esc(titleOf(courseId))}</a></span></h1>`);
  const modes = el("div", "cq-modes");
  const panel = el("section", "card cq-panel");
  panel.hidden = true; // populated once the harvest completes
  const progress = el("p", "muted cq-progress");
  const streamHost = el("div", "cq-stream");
  const sentinel = el("div", "cq-sentinel");
  root.append(head, modes, panel, progress, streamHost, sentinel);

  // ---- harvest all pages (sequential; progress line) ----
  const manifest = await (await fetch("/dist/asset-manifest.json")).json();
  const bundleUrl = location.origin + manifest.primer;
  const pool: HarvestedQuestion[] = [];
  let failed = 0;
  for (let i = 0; i < members.length; i++) {
    progress.textContent = t("coursequiz.harvesting", { n: i + 1, total: members.length });
    try {
      pool.push(...(await harvestPage(members[i], locale, bundleUrl)));
    } catch (err) {
      failed++;
      console.warn(`[course-quiz] page ${members[i]} failed:`, err);
    }
  }
  if (pool.length === 0) {
    progress.textContent = t("coursequiz.empty");
    return;
  }
  progress.textContent = "";

  // ---- modes ----
  const unseenCount = () => members.filter((id) => !seen(readEntry(id))).length;
  let mode: Mode = unseenCount() > members.length / 2 ? "harvest" : "recap";
  const anySeen = () => members.some((id) => seen(readEntry(id)));
  if (!anySeen()) mode = "harvest";

  const starsOf = (id: string) => readEntry(id)?.stars ?? 0;
  const eligible = (id: string) => (mode === "harvest" ? true : seen(readEntry(id)));
  const nextSample = makeSampler(pool, starsOf, eligible);

  const modeBtn = (m: Mode, label: string, blurb: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip cq-mode";
    b.dataset.mode = m;
    b.innerHTML = `<b>${esc(label)}</b><span class="muted small"> — ${esc(blurb)}</span>`;
    b.addEventListener("click", () => {
      if (mode === m) return;
      if (m === "recap" && !anySeen()) return; // nothing to recap yet
      mode = m;
      paintModes();
      // A mode switch RESTARTS the quiz: clear the stream and the session stats, re-freeze the
      // chart's "at the start" snapshot, then refill under the new eligibility. (Lifetime
      // counters/stars are untouched, of course.)
      stream.clear();
      sessionAnswered = 0;
      sessionCorrect = 0;
      probed.clear();
      snapshot = distribution();
      paintSession();
      fill();
    });
    return b;
  };
  const harvestBtn = modeBtn("harvest", t("coursequiz.modeHarvest"), t("coursequiz.modeHarvestBlurb"));
  const recapBtn = modeBtn("recap", t("coursequiz.modeRecap"), t("coursequiz.modeRecapBlurb"));
  modes.append(harvestBtn, recapBtn);
  const paintModes = () => {
    harvestBtn.classList.toggle("is-active", mode === "harvest");
    recapBtn.classList.toggle("is-active", mode === "recap");
    recapBtn.disabled = !anySeen();
  };
  paintModes();

  // ---- the progress panel: session stats + the star-distribution chart ----
  // Buckets: [never-visited, 0, 1, …, 10] — a seen concept lands on ⌊stars⌋ (3.33 → the "3" column).
  const bucketOf = (e: ConfidenceEntry | null): number => (seen(e) ? 1 + Math.min(10, Math.floor(e!.stars)) : 0);
  const distribution = (): number[] => {
    const counts = new Array(12).fill(0);
    for (const id of members) counts[bucketOf(readEntry(id))]++;
    return counts;
  };
  let snapshot = distribution(); // frozen at quiz start (re-frozen when a mode switch restarts the quiz)

  const bucketLabels = [t("coursequiz.chartNA"), ...Array.from({ length: 11 }, (_, i) => String(i))];
  panel.innerHTML = `<h2>${esc(t("coursequiz.progressHead"))}</h2>
    <p class="dash-sub cq-session"></p>
    <div class="cq-chart" role="img" aria-label="${esc(t("coursequiz.chartAria"))}">
      <div class="cq-bars"></div>
      <div class="cq-labels">${bucketLabels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>
      <div class="cq-legend">
        <span class="cq-key"><span class="cq-swatch start"></span>${esc(t("coursequiz.chartStart"))}</span>
        <span class="cq-key"><span class="cq-swatch now"></span>${esc(t("coursequiz.chartNow"))}</span>
      </div>
    </div>`;
  panel.hidden = false;
  const sessionLine = panel.querySelector(".cq-session") as HTMLElement;
  const bars = panel.querySelector(".cq-bars") as HTMLElement;

  const paintChart = () => {
    const now = distribution();
    const max = Math.max(1, ...snapshot, ...now);
    const h = (v: number) => (v === 0 ? 0 : Math.max(4, Math.round((v / max) * 76)));
    bars.innerHTML = now
      .map((n, i) => {
        const s = snapshot[i];
        return `<div class="cq-col" title="${esc(bucketLabels[i])}: ${s} → ${n}">
          <span class="cq-bar start" style="height:${h(s)}px"></span>
          <span class="cq-bar now" style="height:${h(n)}px"></span>
        </div>`;
      })
      .join("");
  };

  // ---- the stream + session stats ----
  const stream = document.createElement("primer-quiz-stream") as PrimerQuizStream;
  streamHost.appendChild(stream);
  let sessionAnswered = 0;
  let sessionCorrect = 0;
  const probed = new Set<string>();
  const paintSession = () => {
    sessionLine.textContent =
      t("coursequiz.session", { correct: sessionCorrect, answered: sessionAnswered }) +
      ` · ${t("coursequiz.probed", { n: probed.size, total: members.length })}`;
    paintChart();
  };
  paintSession();

  const pushOne = (): boolean => {
    // A constraint-heavy question can fail to instantiate — try a few samples before giving up.
    for (let attempt = 0; attempt < 8; attempt++) {
      const hq = nextSample();
      if (!hq) return false;
      try {
        const generated = generateQuestion(hq.question as any, Math.random);
        stream.push(generated, {
          conceptId: hq.conceptId,
          title: titleOf(hq.conceptId),
          onAnswered: (correct: boolean) => {
            sessionAnswered++;
            if (correct) sessionCorrect++;
            probed.add(hq.conceptId);
            const entry = readEntry(hq.conceptId);
            // The harvest rule: a wrong answer on UNSEEN material is not held against you.
            if (mode === "harvest" && !seen(entry) && !correct) {
              paintSession();
              return { stars: null };
            }
            const rec = recordAnswers(hq.conceptId, 1, correct ? 1 : 0);
            document.dispatchEvent(
              new CustomEvent("confidence-change", { detail: { conceptId: hq.conceptId, value: rec.stars } }),
            );
            paintSession();
            return { stars: rec.stars };
          },
        });
        return true;
      } catch (err) {
        // Usually an unsatisfiable-constraints draw — sample again. Log so a structural failure
        // (e.g. a broken component) is visible rather than silently ending the stream.
        console.warn("[course-quiz] question failed to render:", err);
      }
    }
    return false;
  };
  const fill = () => {
    for (let i = 0; i < 4; i++) if (!pushOne()) break;
  };

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) fill();
  });
  observer.observe(sentinel);
  fill();
}
