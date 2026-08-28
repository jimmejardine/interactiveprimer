/**
 * /get-started — a short adaptive placement quiz over school maths, physics or computer science.
 * Intake (field / age / confidence) then one harvested lesson-question at a time, then a summary
 * that names the frontier, matching school courses from every curriculum, and three places to start.
 * Reuses harvestPage + <primer-quiz-stream>.
 * @module
 */

import { getLocale, t } from "./i18n.ts";
import { generateQuestion } from "./quiz.ts";
import { readEntry, recordAnswers, allEntries } from "./confidence-store.ts";
import { setCurrentCourse } from "./course.ts";
import { safeGet, safeSet } from "./storage.ts";
import "./components/primer-quiz-stream.ts";
import type { PrimerQuizStream } from "./components/primer-quiz-stream.ts";
import { type HarvestedQuestion, isLightQuestion } from "./course-quiz-core.ts";
import { harvestPage } from "./quiz-harvest.ts";
import {
  type Field,
  type Confidence,
  type PlacementState,
  type ProbeNode,
  schoolPool,
  ceilingPool,
  startState,
  pickNext,
  applyAnswer,
  summarise,
  branchOf,
  priorFrontier,
} from "./get-started-core.ts";

const WIZARD_KEY = "primer:get-started";
const SNAPSHOT_KEY = (field: Field) => `primer:get-started:${field}`;
/** Below this age the wizard swaps in simpler copy and offers a read-aloud button. */
const YOUNG_AGE_THRESHOLD = 8;
const FIELDS: Field[] = ["mathematics", "physics", "computer-science"];
const CONF_RUNGS: Confidence[] = [1, 2, 3, 4, 5];
const AGE_MIN = 5;
const AGE_MAX = 18;
/** The one middle tick label kept when the slider's ticks thin out to just three on a narrow screen. */
const AGE_MID = Math.round((AGE_MIN + AGE_MAX) / 2);

export async function mountGetStarted(root: HTMLElement, { byId }: { byId: Map<string, any> }): Promise<void> {
  const locale = getLocale();
  const titleOf = (id: string) => byId.get(id)?.titles?.[locale] ?? byId.get(id)?.title ?? (id.split("/").pop() ?? id);
  const el = (tag: string, cls: string, html?: string) => {
    const n = document.createElement(tag);
    n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  const nodes: ProbeNode[] = [...byId.values()].map((c) => ({
    id: c.id,
    level: c.level ?? 0,
    declaredLevel: c.declaredLevel,
    course: !!c.course,
    hasQuiz: !!c.hasQuiz,
    levelGrounded: c.levelGrounded !== false,
    title: titleOf(c.id),
    prerequisites: c.prerequisites ?? [],
    courseMembers: c.courseMembers,
  }));

  root.innerHTML = "";
  const head = el("header", "dash-head", `<h1 class="dash-title">${esc(t("getstarted.heading"))}</h1>
    <p class="dash-sub" id="gs-lead">${esc(t("getstarted.lead"))}</p>`);
  const intake = el("section", "card gs-intake");
  const quizWrap = el("div", "gs-quiz");
  quizWrap.hidden = true;
  const summary = el("section", "card gs-summary");
  summary.hidden = true;
  root.append(head, intake, quizWrap, summary);

  // ---- intake ------------------------------------------------------------------------------------
  let saved: { field?: Field; age?: number; confidence?: Confidence } = {};
  try {
    saved = JSON.parse(safeGet(WIZARD_KEY) || "{}") ?? {};
  } catch {
    saved = {};
  }
  let field: Field | null = saved.field && FIELDS.includes(saved.field) ? saved.field : null;
  let age = typeof saved.age === "number" ? saved.age : 14;
  let ageSet = typeof saved.age === "number";
  let confidence: Confidence | null = CONF_RUNGS.includes(saved.confidence as Confidence)
    ? (saved.confidence as Confidence)
    : null;

  const paintChips = (rootEl: HTMLElement, selected: string | null) => {
    for (const b of rootEl.querySelectorAll<HTMLButtonElement>("button[data-value]")) {
      b.setAttribute("aria-pressed", b.dataset.value === selected ? "true" : "false");
      b.classList.toggle("is-active", b.dataset.value === selected);
    }
  };

  intake.innerHTML = `
    <fieldset class="gs-field">
      <legend id="gs-age-legend">${esc(t("getstarted.ageLegend"))}</legend>
      <div class="gs-age-row">
        <label class="gs-age-label">
          <span class="gs-age-label-text">${esc(t("getstarted.ageLabel"))}</span>
          <span class="gs-age-slider">
            <input id="gs-age-range" type="range" min="${AGE_MIN}" max="${AGE_MAX}" step="1" value="${ageSet ? age : 12}">
            <span class="gs-age-ticks" aria-hidden="true">${Array.from(
              { length: AGE_MAX - AGE_MIN + 1 },
              (_, i) => AGE_MIN + i,
            )
              .map((n) => {
                const cls = ["gs-tick", n === AGE_MIN || n === AGE_MAX ? "gs-tick-edge" : "", n === AGE_MID ? "gs-tick-mid" : ""]
                  .filter(Boolean)
                  .join(" ");
                return `<span class="${cls}">${esc(n === AGE_MAX ? t("getstarted.ageMax") : String(n))}</span>`;
              })
              .join("")}</span>
          </span>
        </label>
      </div>
    </fieldset>
    <fieldset class="gs-field">
      <legend id="gs-field-legend">${esc(t("getstarted.fieldLegend"))}</legend>
      <div class="gs-subject-grid" id="gs-field">
        ${FIELDS.map(
          (f) =>
            `<button type="button" class="gs-subject-card" data-value="${f}" aria-pressed="false">` +
            `<img src="/concepts/${f}/${f}.png" alt="" loading="lazy">` +
            `<span>${esc(t("getstarted.field." + f))}</span></button>`,
        ).join("")}
      </div>
    </fieldset>
    <fieldset class="gs-field">
      <legend id="gs-conf-legend">${esc(t("getstarted.confLegend"))}</legend>
      <div class="gs-conf-grid" id="gs-conf">
        ${CONF_RUNGS.map(
          (n) =>
            `<button type="button" class="gs-conf-card" data-value="${n}" aria-pressed="false">` +
            `<img src="/images/knowledge-level/knowledge-level-${n}.png" alt="" loading="lazy">` +
            `<span>${esc(t("getstarted.conf." + n))}</span></button>`,
        ).join("")}
      </div>
    </fieldset>
    <p>
      <button type="button" class="gs-go" id="gs-go" disabled>${esc(t("getstarted.go"))}</button>
    </p>`;

  const fieldBox = intake.querySelector("#gs-field") as HTMLElement;
  const confBox = intake.querySelector("#gs-conf") as HTMLElement;
  const ageRange = intake.querySelector("#gs-age-range") as HTMLInputElement;
  const goBtn = intake.querySelector("#gs-go") as HTMLButtonElement;
  const leadEl = head.querySelector("#gs-lead") as HTMLElement;
  const fieldLegendEl = intake.querySelector("#gs-field-legend") as HTMLElement;
  const confLegendEl = intake.querySelector("#gs-conf-legend") as HTMLElement;
  const ready = () => {
    goBtn.disabled = !(field && confidence && ageSet);
  };
  // A learner too young to read a wizard fluently gets simpler copy throughout (once age is set).
  const isYoung = () => ageSet && age < YOUNG_AGE_THRESHOLD;
  const applyCopy = () => {
    const young = isYoung();
    leadEl.textContent = t(young ? "getstarted.young.lead" : "getstarted.lead");
    fieldLegendEl.textContent = t(young ? "getstarted.young.fieldLegend" : "getstarted.fieldLegend");
    confLegendEl.textContent = t(young ? "getstarted.young.confLegend" : "getstarted.confLegend");
    for (const f of FIELDS) {
      // Target the label <span>, not the button itself — the button also holds an <img>, and
      // overwriting its textContent would silently delete the image.
      const label = fieldBox.querySelector(`button[data-value="${f}"] span`) as HTMLElement | null;
      if (label) label.textContent = t(young ? `getstarted.young.field.${f}` : `getstarted.field.${f}`);
    }
    for (const n of CONF_RUNGS) {
      const label = confBox.querySelector(`button[data-value="${n}"] span`) as HTMLElement | null;
      if (label) label.textContent = t(young ? `getstarted.young.conf.${n}` : `getstarted.conf.${n}`);
    }
    goBtn.textContent = t(young ? "getstarted.young.go" : "getstarted.go");
  };
  if (field) paintChips(fieldBox, field);
  if (confidence) paintChips(confBox, String(confidence));
  applyCopy();
  const setAge = (n: number) => {
    age = n;
    ageSet = true;
    ageRange.value = String(n);
    applyCopy();
    ready();
  };
  fieldBox.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-value]") as HTMLButtonElement | null;
    if (!b) return;
    field = b.dataset.value as Field;
    paintChips(fieldBox, field);
    ready();
  });
  confBox.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-value]") as HTMLButtonElement | null;
    if (!b) return;
    confidence = Number(b.dataset.value) as Confidence;
    paintChips(confBox, String(confidence));
    ready();
  });
  ageRange.addEventListener("input", () => setAge(Number(ageRange.value)));

  goBtn.addEventListener("click", () => {
    if (!field || !confidence || !ageSet) return;
    safeSet(WIZARD_KEY, JSON.stringify({ field, age, confidence }));
    void runQuiz(field, age, confidence);
  });
  ready();

  // ---- quiz --------------------------------------------------------------------------------------
  async function runQuiz(f: Field, a: number, c: Confidence): Promise<void> {
    intake.hidden = true;
    quizWrap.hidden = false;
    const pool = schoolPool(nodes, f);
    const ceiling = ceilingPool(nodes, f);
    if (pool.length === 0) {
      quizWrap.innerHTML = `<p class="muted">${esc(t("getstarted.empty"))}</p>`;
      return;
    }
    // Repeat-session memory: fold LIFETIME confidence history for this field (from every past
    // /get-started run and ordinary lesson quiz — not just this session) into a per-branch "already
    // known to about level X" map, so a second run starts past ground already covered instead of
    // re-asking it from scratch.
    const prior = priorFrontier(
      allEntries().filter((e) => e.id.startsWith(`${f}/`)),
      pool,
    );
    // Sampling still favours whatever the learner hasn't shown mastery of yet, even within a
    // branch's own band — mirrors course-quiz's inverse-star weighting.
    const weightOf = (id: string) => 1 / (1 + Math.max(0, readEntry(id)?.stars ?? 0));
    const manifest = await (await fetch("/dist/asset-manifest.json")).json();
    // Use the app bundle (not the concept `primer` entry): that entry side-effect-runs render.ts.
    const bundleUrl = location.origin + (manifest.app ?? manifest.primer);
    const cache = new Map<string, HarvestedQuestion[]>();
    const exclude = new Set<string>();
    let state: PlacementState = startState(f, a, c, pool, prior);

    // harvestPage() captures a page's registrations via document-level CustomEvents and binds the
    // quiz builder to ITS OWN parsed doc — safe only when harvests run one at a time (as
    // course-quiz.ts's sequential loop does). prefetch() below fires two speculative harvests
    // without awaiting them, so a shared FIFO chain serializes the actual harvestPage() calls:
    // otherwise two overlapping harvests each see the OTHER's registration events (both listeners
    // are live on `document` at once), one page's quiz builder gets invoked bound to the WRONG
    // page's doc, and its sceneStrings() calls miss every key — surfacing as a literal
    // "$$questXQuiz@1.someKey$$" placeholder in place of the question text.
    let harvestChain: Promise<unknown> = Promise.resolve();

    const status = el("p", "muted gs-progress");
    const endBtn = document.createElement("button");
    endBtn.type = "button";
    endBtn.className = "chip cq-mode gs-end";
    endBtn.textContent = t("getstarted.endEarly");
    const streamHost = el("div", "gs-stream");
    quizWrap.innerHTML = "";
    quizWrap.append(status, endBtn, streamHost);
    const stream = document.createElement("primer-quiz-stream") as PrimerQuizStream;
    streamHost.appendChild(stream);

    const harvest = (id: string): Promise<HarvestedQuestion[]> => {
      if (cache.has(id)) return Promise.resolve(cache.get(id)!);
      const run = harvestChain.then(async () => {
        // Re-check: another call already queued ahead of us may have harvested this id meanwhile.
        if (cache.has(id)) return cache.get(id)!;
        try {
          const all = await harvestPage(id, locale, bundleUrl);
          const light = all.filter((hq) => isLightQuestion(hq.question));
          cache.set(id, light);
          return light;
        } catch (err) {
          console.warn("[get-started] harvest failed:", id, err);
          cache.set(id, []);
          return [];
        }
      });
      // Keep the chain alive even if this harvest rejected, so later queued calls still run.
      harvestChain = run.catch(() => {});
      return run;
    };

    const prefetch = (s: PlacementState, id: string, level: number) => {
      for (const ok of [true, false]) {
        const next = applyAnswer(s, id, level, ok);
        const p = pickNext(next, pool, new Set([...exclude, id]), Math.random, ceiling, weightOf);
        if ("id" in p) void harvest(p.id);
      }
    };

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      quizWrap.hidden = true;
      showSummary(state, pool);
    };
    endBtn.addEventListener("click", finish);

    const showNext = async (): Promise<void> => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const pick = pickNext(state, pool, exclude, Math.random, ceiling, weightOf);
        if ("done" in pick) {
          finish();
          return;
        }
        status.textContent = t("getstarted.progress", { n: state.probes.length + 1, cap: 25 });
        const bank = await harvest(pick.id);
        if (bank.length === 0) {
          exclude.add(pick.id);
          continue;
        }
        const hq = bank[Math.floor(Math.random() * bank.length)]!;
        try {
          const generated = generateQuestion(hq.question as any, Math.random);
          const node = pool.find((n) => n.id === pick.id) ?? ceiling.find((n) => n.id === pick.id);
          if (!node) {
            exclude.add(pick.id);
            continue;
          }
          prefetch(state, pick.id, node.level);
          stream.push(generated, {
            conceptId: pick.id,
            title: titleOf(pick.id),
            onAnswered: (correct: boolean) => {
              // Every answer writes real confidence so this quiz bootstraps the profile.
              const rec = recordAnswers(pick.id, 1, correct ? 1 : 0);
              document.dispatchEvent(
                new CustomEvent("confidence-change", { detail: { conceptId: pick.id, value: rec.stars } }),
              );
              exclude.add(pick.id);
              state = applyAnswer(state, pick.id, node.level, correct);
              if (!finished) void showNext();
              return { stars: rec.stars };
            },
          });
          return;
        } catch (err) {
          console.warn("[get-started] question failed:", err);
          exclude.add(pick.id);
        }
      }
      finish();
    };

    await showNext();
  }

  function showSummary(state: PlacementState, pool: ProbeNode[]): void {
    const byMap = new Map(nodes.map((n) => [n.id, n]));
    const s = summarise(state, pool, byMap, (id) => readEntry(id)?.stars ?? 0);
    summary.hidden = false;
    const hubId = state.field === "computer-science" ? "computer-science/computer-science"
      : state.field === "physics" ? "physics/physics"
        : "mathematics/mathematics";
    const branchLabel = (b: string) => b.replace(/-/g, " ");

    // Cross-session progress: compare this run's per-branch frontier against the last snapshot for
    // this field, then persist a fresh one (merging in any branch this run didn't touch) — this is
    // what makes repeat runs visibly "remember" what they learned last time, not just internally.
    interface Snapshot { date?: string; branches?: Record<string, number> }
    let prevSnap: Snapshot = {};
    try {
      prevSnap = (JSON.parse(safeGet(SNAPSHOT_KEY(state.field)) || "{}") ?? {}) as Snapshot;
    } catch {
      prevSnap = {};
    }
    const progressLines: string[] = [];
    for (const b of s.branches) {
      if (b.strongTo == null) continue;
      const prev = prevSnap.branches?.[b.branch];
      if (prev != null && b.strongTo > prev) {
        progressLines.push(
          t("getstarted.progressLine", { branch: branchLabel(b.branch), from: String(prev), to: String(b.strongTo) }),
        );
      }
    }
    const newBranches: Record<string, number> = { ...prevSnap.branches };
    for (const b of s.branches) if (b.strongTo != null) newBranches[b.branch] = b.strongTo;
    safeSet(
      SNAPSHOT_KEY(state.field),
      JSON.stringify({ date: new Date().toISOString().slice(0, 10), branches: newBranches } satisfies Snapshot),
    );
    const progressBlock = progressLines.length
      ? `<div class="gs-progress-since">
           <h3>${esc(t("getstarted.progressTitle", { date: prevSnap.date ?? "" }))}</h3>
           <ul>${progressLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
         </div>`
      : "";
    const chips = s.branches
      .map((b) => {
        const label = branchLabel(b.branch);
        const text = b.strongTo == null
          ? t("getstarted.branchUntested", { branch: label })
          : t("getstarted.branchLine", { branch: label, n: String(b.strongTo) });
        return `<span class="gs-branch gs-branch-${b.status}">${esc(text)}</span>`;
      })
      .join("");
    const starts = s.startHere
      .map((id) => `<li><a href="/concepts/${esc(id)}">${esc(titleOf(id))}</a> <span class="muted">(${esc(branchOf(id).replace(/-/g, " "))})</span></li>`)
      .join("");
    const regionLabel = (region: string) => {
      const key = "getstarted.region." + region;
      const label = t(key);
      return label === key ? region.toUpperCase() : label;
    };
    const byRegion = new Map<string, typeof s.courses>();
    for (const c of s.courses) {
      const list = byRegion.get(c.region) ?? [];
      list.push(c);
      byRegion.set(c.region, list);
    }
    const courseGroups = [...byRegion.entries()]
      .map(([region, list]) => {
        const buttons = list
          .map(
            (c) =>
              `<button type="button" class="chip cq-mode" data-value="${esc(c.id)}" data-course="${esc(c.id)}">${esc(titleOf(c.id))}</button>`,
          )
          .join("");
        return `<div class="gs-course-region">
          <h4>${esc(regionLabel(region))}</h4>
          <div class="gs-chips">${buttons}</div>
        </div>`;
      })
      .join("");
    const courseBlock = s.courses.length
      ? `<h3>${esc(t("getstarted.coursesTitle"))}</h3>
         <p class="muted">${esc(t("getstarted.coursesHint"))}</p>
         <div class="gs-courses">${courseGroups}</div>
         <p class="gs-course-focused" hidden aria-live="polite"></p>`
      : `<p class="muted">${esc(t("getstarted.noCourses"))}</p>`;
    summary.innerHTML = `
      <h2>${esc(t("getstarted.summaryTitle"))}</h2>
      <p>${esc(t("getstarted.frontier", { n: String(s.frontier), field: t("getstarted.field." + state.field) }))}</p>
      ${progressBlock}
      ${courseBlock}
      <div class="gs-branches">${chips || `<span class="muted">${esc(t("getstarted.noBranches"))}</span>`}</div>
      <h3>${esc(t("getstarted.startHere"))}</h3>
      <ul class="gs-starts">${starts || `<li class="muted">${esc(t("getstarted.noStarts"))}</li>`}</ul>
      <p class="gs-ctas">
        <a class="p-next-cta" href="/course">${esc(t("getstarted.openProgress"))} →</a>
        <a class="p-next-cta" id="gs-quiz-cta" hidden href="/course-quiz">${esc(t("getstarted.openQuiz"))} →</a>
        <a class="quiet" href="/concepts/${esc(hubId)}">${esc(t("getstarted.openHub"))}</a>
        · <a class="quiet" href="/explore">${esc(t("getstarted.openExplore"))}</a>
      </p>`;
    const focused = summary.querySelector(".gs-course-focused") as HTMLElement | null;
    const quizCta = summary.querySelector("#gs-quiz-cta") as HTMLAnchorElement | null;
    const courseRoot = summary.querySelector(".gs-courses") as HTMLElement | null;
    courseRoot?.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest("button[data-course]") as HTMLButtonElement | null;
      if (!b?.dataset.course) return;
      const id = b.dataset.course;
      setCurrentCourse(id);
      paintChips(courseRoot, id);
      if (focused) {
        focused.hidden = false;
        focused.textContent = t("getstarted.courseFocused", { name: titleOf(id) });
      }
      if (quizCta) quizCta.hidden = false;
    });
  }
}
