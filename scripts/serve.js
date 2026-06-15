// @ts-check
/**
 * Zero-dependency static web server for local development. Serves the repository
 * root so concept pages, JS modules, CSS and quiz JSON all resolve at their real
 * absolute paths (e.g. `/js/primer.js`, `/concepts/addition.html`).
 *
 *   node scripts/serve.js            # serve on http://localhost:8080
 *   node scripts/serve.js 3000       # custom port (positional)
 *   PORT=3000 node scripts/serve.js  # custom port (env)
 *
 * @module
 */

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root = the parent of this scripts/ directory (no trailing separator). */
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(
  new RegExp(`\\${sep}$`),
  "",
);

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);

/**
 * Content types by file extension. ES modules MUST be served with a JavaScript
 * MIME type or browsers refuse to execute them.
 * @type {Record<string, string>}
 */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    // Resolve against ROOT and refuse anything that escapes it (path traversal).
    const filePath = normalize(join(ROOT, pathname));
    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("403 Forbidden");
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("404 Not Found");
      log(res.statusCode, req.method, pathname);
      return;
    }

    const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    createReadStream(filePath).pipe(res);
    log(200, req.method, pathname);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("500 Internal Server Error");
    console.error(err);
  }
});

/**
 * @param {number} status
 * @param {string | undefined} method
 * @param {string} pathname
 */
function log(status, method, pathname) {
  console.log(`${status}  ${method ?? "?"}  ${pathname}`);
}

server.listen(PORT, () => {
  console.log(`Interactive Primer dev server`);
  console.log(`  root: ${ROOT}`);
  console.log(`  url:  http://localhost:${PORT}/`);
  console.log(`Press Ctrl+C to stop.`);
});
