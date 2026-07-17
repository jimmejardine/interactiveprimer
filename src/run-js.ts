/**
 * Run JavaScript in a QuickJS sandbox, capturing `console` output. The WASM-backed `runJs` is validated
 * in-browser; the pure formatting helpers (`formatArgs`, `formatError`) are unit-tested in Node.
 * @module
 */

function stringify(v: any) {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Join `console.*` arguments into one display line (strings bare, everything else JSON-ish) — like a
 * browser console line.
 */
export function formatArgs(values: any[]): string {
  return values.map((v) => (typeof v === "string" ? v : stringify(v))).join(" ");
}

/**
 * A friendly one-line message for an error thrown by / returned from the sandbox.
 */
export function formatError(e: any): string {
  if (e && typeof e === "object" && ("name" in e || "message" in e)) {
    const name = (e as any).name;
    const msg = (e as any).message;
    return name && msg ? `${name}: ${msg}` : String(msg ?? name ?? stringify(e));
  }
  return typeof e === "string" ? e : stringify(e);
}

/**
 * Run `js` in a fresh QuickJS context with console capture, an execution-time interrupt (kills infinite
 * loops), and a memory cap. Synchronous (the sandbox variant is sync); `mod` comes from `getQuickJs()`.
 * @param js  JavaScript source (already transpiled from TypeScript)
 */
export function runJs(
  mod: { QuickJS: any, shouldInterruptAfterDeadline: any },
  js: string,
  { timeoutMs = 1000, memoryBytes = 64 * 1024 * 1024 }: { timeoutMs?: number, memoryBytes?: number } = {},
): { ok: boolean, output: string[], error?: string } {
  const { QuickJS, shouldInterruptAfterDeadline } = mod;
  const vm = QuickJS.newContext();
  const output: string[] = [];
  try {
    vm.runtime.setMemoryLimit(memoryBytes);
    vm.runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));

    const consoleObj = vm.newObject();
    for (const method of ["log", "info", "warn", "error"]) {
      const fn = vm.newFunction(method, (...args: any[]) => {
        const values = args.map((a) => vm.dump(a));
        const prefix = method === "error" ? "Error: " : method === "warn" ? "Warning: " : "";
        output.push(prefix + formatArgs(values));
      });
      vm.setProp(consoleObj, method, fn);
      fn.dispose();
    }
    vm.setProp(vm.global, "console", consoleObj);
    consoleObj.dispose();

    const res = vm.evalCode(js);
    if (res.error) {
      const err = vm.dump(res.error);
      res.error.dispose();
      return { ok: false, output, error: formatError(err) };
    }
    res.value.dispose();
    return { ok: true, output };
  } catch (e) {
    const m = formatError(e);
    const friendly = /interrupt/i.test(m)
      ? "The code took too long to run (it may have an infinite loop) and was stopped."
      : m;
    return { ok: false, output, error: friendly };
  } finally {
    try {
      vm.dispose();
    } catch {
      /* ignore */
    }
  }
}
