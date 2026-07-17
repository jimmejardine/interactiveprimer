/**
 * Tiny, dependency-free syntax highlighter for `<primer-code>` (js/components/primer-code.js).
 * Pure functions only (no DOM), so they can be unit-tested in Node. A small hand-written scanner —
 * robust on the simple loops/functions/strings school code uses; unknown text is escaped ink.
 * @module
 */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
/**
 * Escape only the three HTML-structural characters for safe innerHTML. Code display deliberately leaves
 * quotes literal — they're pervasive in source and need no escaping in text content, and the highlighter's
 * snapshot tests pin that. This is intentionally NOT the shared 5-char {@link escapeHtml}.
 */
export function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ESC[c]);
}

const JS_KEYWORDS = [
  "let", "const", "var", "function", "return", "if", "else", "for", "while", "do", "break",
  "continue", "switch", "case", "default", "in", "of", "new", "class", "extends", "super", "this",
  "typeof", "instanceof", "try", "catch", "finally", "throw", "true", "false", "null", "undefined",
  "void", "delete", "yield", "async", "await", "import", "export", "from", "as",
];
// TypeScript adds structural keywords + the primitive type names (all shown in the keyword colour).
const TS_KEYWORDS = [
  "interface", "type", "enum", "implements", "abstract", "public", "private", "protected", "readonly",
  "is", "keyof", "infer", "satisfies", "override", "declare", "namespace", "get", "set",
  "string", "number", "boolean", "symbol", "bigint", "any", "unknown", "never", "object",
];

/** Language keyword sets (control/structure words → the "keyword" colour). */
const KEYWORDS: Record<string, Set<string>> = {
  typescript: new Set([...JS_KEYWORDS, ...TS_KEYWORDS]),
  javascript: new Set(JS_KEYWORDS),
  python: new Set([
    "def", "return", "if", "elif", "else", "for", "while", "in", "and", "or", "not", "is",
    "True", "False", "None", "import", "from", "as", "class", "break", "continue", "pass",
    "with", "try", "except", "finally", "raise", "lambda", "global", "nonlocal", "yield", "assert", "del",
  ]),
  sql: new Set([
    "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE",
    "TABLE", "JOIN", "INNER", "LEFT", "RIGHT", "ON", "AND", "OR", "NOT", "NULL", "ORDER", "BY",
    "GROUP", "HAVING", "AS", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "LIKE", "IN", "BETWEEN",
    "PRIMARY", "KEY", "FOREIGN", "REFERENCES",
  ]),
};

/** Common builtin/library names → the "builtin" colour (Python-ish; harmless elsewhere). */
const BUILTINS: Record<string, Set<string>> = {
  javascript: new Set([
    "console", "log", "Math", "Array", "Object", "String", "Number", "Boolean", "JSON", "parseInt",
    "parseFloat", "isNaN", "length", "push", "pop", "shift", "unshift", "map", "filter", "reduce",
    "forEach", "includes", "indexOf", "slice", "splice", "join", "split", "charAt", "toUpperCase",
    "toLowerCase", "document", "window", "alert", "prompt", "Date", "random", "floor", "round",
  ]),
  python: new Set([
    "print", "range", "len", "int", "str", "float", "bool", "input", "list", "dict", "set",
    "tuple", "type", "abs", "min", "max", "sum", "sorted", "round", "open", "enumerate", "zip",
    "map", "filter", "append", "self",
  ]),
  sql: new Set([]),
};

function span(cls: string, s: string) {
  return `<span class="${cls}">${esc(s)}</span>`;
}

/**
 * Tokenize `code` into highlighted HTML (escaped) with `<span class="k|b|s|n|c|f">` tokens.
 * @param lang  `javascript`/`js` (default) · `python` · `sql` · `text`/`pseudocode`/`plain` (no highlighting)
 */
export function highlight(code: string, lang: string = "typescript"): string {
  if (lang === "ts") lang = "typescript";
  if (lang === "js") lang = "javascript";
  if (lang === "text" || lang === "pseudocode" || lang === "plain") return esc(code);
  const kw = KEYWORDS[lang as keyof typeof KEYWORDS] ?? KEYWORDS.typescript;
  const bi = BUILTINS[lang as keyof typeof BUILTINS] ?? BUILTINS.javascript;
  const lineComment = lang === "sql" ? "--" : lang === "python" ? "#" : "//";
  const blockComments = lang === "javascript" || lang === "typescript"; // /* … */
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    if (blockComments && code.startsWith("/*", i)) {
      const end = code.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      out += span("c", code.slice(i, j));
      i = j;
      continue;
    }
    if (code.startsWith(lineComment, i)) {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      out += span("c", code.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      let j = i + 1;
      while (j < n && code[j] !== q) {
        if (code[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, n);
      out += span("s", code.slice(i, j));
      i = j;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      let j = i;
      while (j < n && /[0-9._]/.test(code[j])) j++;
      out += span("n", code.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(code[j])) j++;
      const w = code.slice(i, j);
      let k = j;
      while (k < n && code[k] === " ") k++;
      if (kw.has(w) || (lang === "sql" && kw.has(w.toUpperCase()))) out += span("k", w);
      else if (bi.has(w)) out += span("b", w);
      else if (code[k] === "(") out += span("f", w);
      else out += esc(w);
      i = j;
      continue;
    }
    out += esc(ch);
    i++;
  }
  return out;
}

/**
 * Trim leading/trailing blank lines and strip the common leading indent (so an HTML-indented block
 * renders flush-left). Tabs → 4 spaces.
 */
export function dedent(code: string): string {
  const lines = code.replace(/\t/g, "    ").replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && lines[0].trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  const indents = lines.filter((l) => l.trim() !== "").map((l) => (l.match(/^ */) ?? [""])[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}
