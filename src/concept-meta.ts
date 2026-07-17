/**
 * Parse and validate a concept's metadata. This is the SINGLE source of truth for
 * a concept's graph data: in the browser it is read from the page's inline
 * `<script type="application/json" class="concept-meta">` block; in Node the
 * graph script extracts the same block from each .html file. Both paths funnel
 * through {@link parseConceptMeta} so the rules live in one place.
 * @module
 */

import { parseJsonc } from "./jsonc.ts";
import type { ConceptMeta } from "./types/domain.ts";

/**
 * Validate an arbitrary parsed-JSON value as a {@link ConceptMeta}. Throws an Error
 * with a clear message on any problem so authoring mistakes fail loudly (and, in
 * CI, fail the build).
 */
export function parseConceptMeta(raw: unknown): ConceptMeta {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("concept metadata must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  // `id` and `title` are no longer authored here — `id` is implied by the file path / URL (see
  // conceptIdFromPath) and `title` lives in the <primer-title> element. They are accepted if
  // present (legacy pages) but optional; both are populated downstream from the path/element.
  const id = obj.id;
  if (id !== undefined) {
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error("concept metadata `id`, when present, must be a non-empty string");
    }
    if (id !== id.trim() || id.startsWith("/") || id.endsWith("/") || id.includes("//")) {
      throw new Error(`concept id "${id}" must be a clean full path (no leading/trailing/double slashes)`);
    }
  }

  const title = obj.title;
  if (title !== undefined && (typeof title !== "string" || title.trim() === "")) {
    throw new Error("concept metadata `title`, when present, must be a non-empty string");
  }

  const rawPre = obj.prerequisites ?? [];
  if (!Array.isArray(rawPre) || rawPre.some((p) => typeof p !== "string")) {
    throw new Error("concept `prerequisites` must be an array of id strings");
  }
  const prerequisites = (rawPre as string[]).map((p) => p.trim()).filter(Boolean);

  const meta: ConceptMeta = { prerequisites };
  if (typeof id === "string") meta.id = id;
  if (typeof title === "string") meta.title = title;

  if (obj.declaredLevel !== undefined) {
    const lvl = obj.declaredLevel;
    if (typeof lvl !== "number" || !Number.isFinite(lvl)) {
      throw new Error("concept `declaredLevel` must be a finite number");
    }
    meta.declaredLevel = lvl;
  }

  if (obj.completedDate !== undefined) {
    meta.completedDate = validateDate(obj.completedDate, "completedDate");
  }
  if (obj.needsReviewDate !== undefined) {
    meta.needsReviewDate = validateDate(obj.needsReviewDate, "needsReviewDate");
  }

  // `course: true` marks this page as a course — a curated path. The build harvests the page's
  // <primer-ref>s (normal + soft) into the course's ordered concept list (see extractCourseMembers).
  if (obj.course !== undefined) {
    if (typeof obj.course !== "boolean") {
      throw new Error("concept `course`, when present, must be a boolean");
    }
    meta.course = obj.course;
  }

  // Legacy: previously set on translation overlays; overlays now carry a trailing
  // `<!-- sourceHash: … -->` comment instead. Still accepted if present.
  if (obj.sourceHash !== undefined) {
    if (typeof obj.sourceHash !== "string" || obj.sourceHash.trim() === "") {
      throw new Error("concept `sourceHash` must be a non-empty string");
    }
    meta.sourceHash = obj.sourceHash;
  }

  return meta;
}

/**
 * Validate an optional curation date: an ISO "YYYY-MM-DD" string for a real calendar
 * date. Throws a clear error otherwise.
 */
function validateDate(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(`concept \`${field}\` must be an ISO date string "YYYY-MM-DD"`);
  }
  return value;
}

/**
 * Read the current page's concept metadata from its inline JSON block. Browser-only
 * helper (uses `document`). Returns null if no block is present.
 */
export function getConceptMeta(doc: Document = document): ConceptMeta | null {
  const el = doc.querySelector("script.concept-meta");
  if (!el || !el.textContent) return null;
  return parseConceptMeta(parseJsonc(el.textContent));
}

/**
 * Derive a concept's id from a page URL path. The canonical URL is always
 * `/concepts/<id>.html`, so the id is implied by the path — it is no longer stored in the
 * concept-meta block. Returns "" if the path isn't a concept URL.
 */
export function conceptIdFromPath(pathname: string = location.pathname): string {
  const m = pathname.match(/\/concepts\/(.+?)\.html?$/i);
  return m ? m[1] : "";
}
