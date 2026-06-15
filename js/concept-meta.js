// @ts-check
/**
 * Parse and validate a concept's metadata. This is the SINGLE source of truth for
 * a concept's graph data: in the browser it is read from the page's inline
 * `<script type="application/json" class="concept-meta">` block; in Node the
 * graph script extracts the same block from each .html file. Both paths funnel
 * through {@link parseConceptMeta} so the rules live in one place.
 * @module
 */

/** @typedef {import("./types/domain.js").ConceptMeta} ConceptMeta */

/**
 * Validate an arbitrary parsed-JSON value as a {@link ConceptMeta}. Throws an Error
 * with a clear message on any problem so authoring mistakes fail loudly (and, in
 * CI, fail the build).
 * @param {unknown} raw
 * @returns {ConceptMeta}
 */
export function parseConceptMeta(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("concept metadata must be a JSON object");
  }
  const obj = /** @type {Record<string, unknown>} */ (raw);

  const id = obj.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("concept metadata requires a non-empty string `id`");
  }
  if (id !== id.trim() || id.startsWith("/") || id.endsWith("/") || id.includes("//")) {
    throw new Error(`concept id "${id}" must be a clean full path (no leading/trailing/double slashes)`);
  }

  const title = obj.title;
  if (typeof title !== "string" || title.trim() === "") {
    throw new Error(`concept "${id}" requires a non-empty string \`title\``);
  }

  const rawPre = obj.prerequisites ?? [];
  if (!Array.isArray(rawPre) || rawPre.some((p) => typeof p !== "string")) {
    throw new Error(`concept "${id}" \`prerequisites\` must be an array of id strings`);
  }
  const prerequisites = /** @type {string[]} */ (rawPre).map((p) => p.trim()).filter(Boolean);

  /** @type {ConceptMeta} */
  const meta = { id, title, prerequisites };

  if (obj.declaredLevel !== undefined) {
    const lvl = obj.declaredLevel;
    if (typeof lvl !== "number" || !Number.isFinite(lvl)) {
      throw new Error(`concept "${id}" \`declaredLevel\` must be a finite number`);
    }
    meta.declaredLevel = lvl;
  }

  if (obj.root !== undefined) {
    if (typeof obj.root !== "boolean") {
      throw new Error(`concept "${id}" \`root\` must be a boolean`);
    }
    meta.root = obj.root;
  }

  if (obj.completedDate !== undefined) {
    meta.completedDate = validateDate(obj.completedDate, "completedDate", id);
  }
  if (obj.needsReviewDate !== undefined) {
    meta.needsReviewDate = validateDate(obj.needsReviewDate, "needsReviewDate", id);
  }

  return meta;
}

/**
 * Validate an optional curation date: an ISO "YYYY-MM-DD" string for a real calendar
 * date. Throws a clear error otherwise.
 * @param {unknown} value
 * @param {string} field
 * @param {string} id
 * @returns {string}
 */
function validateDate(value, field, id) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(`concept "${id}" \`${field}\` must be an ISO date string "YYYY-MM-DD"`);
  }
  return value;
}

/**
 * Read the current page's concept metadata from its inline JSON block. Browser-only
 * helper (uses `document`). Returns null if no block is present.
 * @param {Document} [doc]
 * @returns {ConceptMeta | null}
 */
export function getConceptMeta(doc = document) {
  const el = doc.querySelector("script.concept-meta");
  if (!el || !el.textContent) return null;
  return parseConceptMeta(JSON.parse(el.textContent));
}
