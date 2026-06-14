// @ts-check
/**
 * Levels of knowledge, in ascending order. A level roughly equates to a stage of
 * education. The ORDER of this array defines each level's rank; nothing else should
 * hard-code level ordering.
 * @module
 */

/** @typedef {import("./types/domain.js").Level} Level */

/**
 * Levels from lowest to highest. Index = rank.
 * @type {readonly Level[]}
 */
export const LEVELS = /** @type {const} */ ([
  "early-school",
  "later-school",
  "undergraduate",
  "graduate",
  "research",
]);

/**
 * Rank of a level (0 = lowest). Throws on an unknown level so typos surface early.
 * @param {Level} level
 * @returns {number}
 */
export function levelRank(level) {
  const rank = LEVELS.indexOf(level);
  if (rank === -1) throw new Error(`Unknown level: ${level}`);
  return rank;
}

/**
 * Returns whichever of two levels is higher. `null` represents "no level"; a real
 * level always beats `null`, and `null` vs `null` stays `null`.
 * @param {Level | null} a
 * @param {Level | null} b
 * @returns {Level | null}
 */
export function maxLevel(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return levelRank(a) >= levelRank(b) ? a : b;
}

/**
 * A short, human-friendly label for a level (for badges etc.).
 * @param {Level} level
 * @returns {string}
 */
export function levelLabel(level) {
  switch (level) {
    case "early-school": return "Early school";
    case "later-school": return "Later school";
    case "undergraduate": return "Undergraduate";
    case "graduate": return "Graduate";
    case "research": return "Research";
    default: {
      /** @type {never} */ const _exhaustive = level;
      return _exhaustive;
    }
  }
}
