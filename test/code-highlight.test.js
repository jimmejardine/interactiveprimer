// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { highlight, dedent, esc } from "../js/code-highlight.js";

test("esc: escapes HTML-special chars", () => {
  assert.equal(esc('a < b & c > d'), "a &lt; b &amp; c &gt; d");
});

test("highlight: javascript is the default; keywords, builtins, strings, comments, numbers", () => {
  const html = highlight('function f(x) {\n  return console.log("hi", 42);  // note\n}');
  assert.match(html, /<span class="k">function<\/span>/);
  assert.match(html, /<span class="k">return<\/span>/);
  assert.match(html, /<span class="f">f<\/span>/); // f( → call-name
  assert.match(html, /<span class="b">console<\/span>/); // builtin
  assert.match(html, /<span class="s">"hi"<\/span>/);
  assert.match(html, /<span class="n">42<\/span>/);
  assert.match(html, /<span class="c">\/\/ note<\/span>/); // // line comment
});

test("highlight: javascript let/const, block comments, template literals", () => {
  const html = highlight('const s = `hi`;\n/* block\ncomment */\nlet x = 1;', "js");
  assert.match(html, /<span class="k">const<\/span>/);
  assert.match(html, /<span class="k">let<\/span>/);
  assert.match(html, /<span class="s">`hi`<\/span>/); // template literal
  assert.match(html, /<span class="c">\/\* block\ncomment \*\/<\/span>/); // multiline block comment
});

test("highlight: python keywords, builtins, call-names, numbers, strings, comments", () => {
  const html = highlight('def f(x):\n    return print("hi", 42)  # note', "python");
  assert.match(html, /<span class="k">def<\/span>/);
  assert.match(html, /<span class="k">return<\/span>/);
  assert.match(html, /<span class="f">f<\/span>/); // f( → call-name
  assert.match(html, /<span class="b">print<\/span>/); // builtin
  assert.match(html, /<span class="s">"hi"<\/span>/); // string
  assert.match(html, /<span class="n">42<\/span>/); // number
  assert.match(html, /<span class="c"># note<\/span>/); // comment
});

test("highlight: escapes < > & in code (must not emit raw tags)", () => {
  const html = highlight("if x < 10 and y > 2:", "python");
  assert.ok(!/[^;]<[a-z/]/.test(html.replace(/<span[^>]*>|<\/span>/g, "")), "no stray raw tags");
  assert.match(html, /&lt;/);
  assert.match(html, /&gt;/);
  assert.match(html, /<span class="k">if<\/span>/);
  assert.match(html, /<span class="k">and<\/span>/);
});

test("highlight: lang=text does no highlighting, only escaping", () => {
  assert.equal(highlight("if a < b: return", "text"), "if a &lt; b: return");
});

test("highlight: sql keywords (case-insensitive)", () => {
  const html = highlight("select name from users where id = 1", "sql");
  assert.match(html, /<span class="k">select<\/span>/);
  assert.match(html, /<span class="k">from<\/span>/);
  assert.match(html, /<span class="k">where<\/span>/);
  assert.match(html, /<span class="n">1<\/span>/);
});

test("dedent: strips common indent and leading/trailing blank lines", () => {
  const src = "\n        for i in range(3):\n            print(i)\n        \n";
  assert.equal(dedent(src), "for i in range(3):\n    print(i)");
});

test("dedent: tabs become 4 spaces; empty stays empty", () => {
  assert.equal(dedent("\tx = 1"), "x = 1");
  assert.equal(dedent("   "), "");
});
