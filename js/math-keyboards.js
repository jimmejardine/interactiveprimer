// @ts-check
/**
 * Custom MathLive virtual-keyboard layouts, one per module — start with basic algebra; add
 * exponents / geometry / trig here as those modules arrive. A concept's math question picks
 * one by name via its `keyboard` field; primer-quiz swaps it onto the (shared, singleton)
 * virtual keyboard when the field is focused.
 *
 * Layout schema is MathLive's `mathVirtualKeyboard.layouts`:
 * https://mathlive.io/mathfield/guides/virtual-keyboard/ — a `rows` array of keycaps, where a
 * keycap is a LaTeX string, an action shortcut (`[backspace]`, `[(]`, `[+]`, …), or an object
 * `{ latex, label, key, command, width }`.
 * @module
 */

/** Basic algebra: digits, x, squared, parentheses, + − × ÷, backspace, tab. */
const BASIC_ALGEBRA = {
  label: "Algebra",
  rows: [
    [
      { label: "0", key: "0" },
      { label: "1", key: "1" },
      { label: "2", key: "2" },
      { label: "3", key: "3" },
      { label: "4", key: "4" },
      { class: "action", label: "⌫", command: "deleteBackward" },
    ],
    [

      { label: "5", key: "5" },
      { label: "6", key: "6" },
      { label: "7", key: "7" },
      { label: "8", key: "8" },
      { label: "9", key: "9" },
      { class: "action", label: "X", command: "deleteAll" },

    ],
    [
      { label: "+", key: "+" },
      { label: "−", key: "-" },
      { label: "×", insert: "\\times" },
      { label: "÷", insert: "\\div" },
      { label: ".", key: "." },
      { class: "action", label: "Prev", command: "moveToPreviousPlaceholder" }
    ],
    [
      { label: "x", key: "x" },
      { label: "x²", insert: "x^2" },
      { label: "x³", insert: "x^3" },
      { label: "(", key: "(" },
      { label: ")", key: ")" },
      { class: "action", label: "Next", command: "moveToNextPlaceholder" }
    ],
  ],
};

/** Module keyboards by name. */
const KEYBOARDS = /** @type {Record<string, object>} */ ({
  "algebra-basic": BASIC_ALGEBRA,
});

/**
 * The MathLive layout object for a named keyboard, or null if the name is unknown.
 * @param {string | undefined | null} name
 * @returns {object | null}
 */
export function getMathKeyboard(name) {
  return (name && KEYBOARDS[name]) || null;
}
