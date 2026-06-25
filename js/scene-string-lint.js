// @ts-check
/**
 * Lint helpers for the i18n "prose/maths split" contract on scene-strings.
 *
 * A scene-strings value (manim narration, chart labels, geometry captions, quiz prose) is a
 * TRANSLATABLE string. Its only interpolation is {@link module:i18n.fillVars}, which substitutes
 * **simple `{name}` placeholders only** (`/\{(\w+)\}/g`). So an *expression* in braces — e.g.
 * `{10*t + o}`, `{x + y}`, `{a + 2*d}` — is NOT evaluated; it renders literally to the learner.
 * The fix is always to precompute the value in the language-neutral builder and pass it as a named
 * variable: `sceneStrings("key", { ...v, n: 10*v.t + v.o })`.
 *
 * These pure helpers (no DOM, no FS) back the build-time guardrails in `scripts/i18n-check.js`:
 *   - {@link expressionPlaceholders} flags an expression-in-a-scene-string (Check A);
 *   - {@link placeholderNames} powers the locale↔English placeholder-consistency check (Check B).
 *
 * Literal braces that must survive (rare LaTeX whose letters collide with a quiz variable) are
 * escaped by DOUBLING — `{{x + 1}}` — exactly as the quiz `substitute`/CLAUDE.md convention does.
 * Both helpers strip doubled braces first so escaped groups are never inspected.
 * @module
 */

/** Remove doubled `{{…}}` literal-escapes so only real single-brace placeholders remain.
 * @param {string} value @returns {string} */
function stripEscaped(value) {
  return value.replace(/\{\{[^{}]*\}\}/g, "");
}

/**
 * The set of simple `{name}` placeholders in a value (the only kind `fillVars` interpolates),
 * ignoring doubled `{{…}}` literal-escapes. Used to compare a translation against its English
 * source — they must reference the exact same placeholders.
 * @param {string} value
 * @returns {Set<string>}
 */
export function placeholderNames(value) {
  const names = new Set();
  const re = /\{(\w+)\}/g;
  let m;
  const scrubbed = stripEscaped(value);
  while ((m = re.exec(scrubbed)) !== null) names.add(m[1]);
  return names;
}

/**
 * Find brace-groups in a scene-strings value that look like an arithmetic EXPRESSION over the
 * page's drawn quiz variables — i.e. an author mistake that `fillVars` will leave literal.
 *
 * A group `{…}` is flagged only when ALL of:
 *   1. it is not a bare identifier (`^\s*\w+\s*$`) — a plain `{n}` is fine;
 *   2. it is not a LaTeX context — its inner text has no backslash (rules out `{\mu t}`,
 *      `{d\times r}`) AND the character just before the `{` is not `_`, `^`, `\`, a letter, or `}`
 *      (rules out a subscript/superscript `x_{n+1}`, `e^{-z}`, a command argument `\sqrt{t - s}`,
 *      and a following command argument like the denominator of `\frac{…}{b - a}`); and
 *   3. it references at least one declared quiz variable name (its identifiers intersect `varNames`).
 *
 * Together these catch the real authoring bug — a computed value written as an interpolation, e.g.
 * `${10*t + o}$`, `{x + y}`, `{a + 2*d}`, where `t,o,x,y,a,d` are drawn variables — while leaving
 * the LaTeX that pervades maths prompts untouched. The rare literal that still collides can be
 * escaped by doubling the braces, `{{…}}` (ignored here).
 * @param {string} value
 * @param {Set<string> | Iterable<string>} varNames Declared quiz variable names on the page.
 * @returns {string[]} The offending inner-expressions (e.g. `["10*t + o"]`); empty when clean.
 */
export function expressionPlaceholders(value, varNames) {
  const vars = varNames instanceof Set ? varNames : new Set(varNames);
  /** @type {string[]} */
  const hits = [];
  const re = /\{([^{}]+)\}/g;
  let m;
  const scrubbed = stripEscaped(value);
  while ((m = re.exec(scrubbed)) !== null) {
    const inner = m[1];
    if (/^\s*\w+\s*$/.test(inner)) continue; // a bare {name} — fine
    if (inner.includes("\\")) continue; // LaTeX command inside, e.g. {\mu t}, {d\times r}
    const before = m.index > 0 ? scrubbed[m.index - 1] : "";
    // LaTeX argument group: after _ / ^ (sub/superscript), \ or a letter (a command name), or }
    // (a command's following argument, e.g. the denominator of \frac{…}{…}).
    if (before === "_" || before === "^" || before === "\\" || before === "}" || /[A-Za-z]/.test(before)) continue;
    const ids = inner.match(/[A-Za-z_]\w*/g) ?? [];
    if (ids.some((id) => vars.has(id))) hits.push(inner.trim());
  }
  return hits;
}
