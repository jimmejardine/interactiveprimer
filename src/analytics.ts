/**
 * Cookieless visitor analytics — Cloudflare Web Analytics + GoatCounter. Both are cookieless and
 * collect no personal data, so NO EU consent banner is needed. Loaded on every page (boot.js injects
 * it on concept pages; index.html and explore.html include it directly), but only ACTUALLY fires on
 * the real production domain — never localhost, preview deploys, forks, or mirrors.
 *
 * This is a CLASSIC (non-module) script: scripts/build.mjs transpiles it to the stable
 * `/dist/analytics.js` URL the pages reference. No imports/exports allowed here.
 * @module
 */
(function () {
  const TOKEN = "cb0473cb3ef84b339dc962a565dda272"; // Cloudflare Web Analytics beacon token
  if (!TOKEN || TOKEN.charAt(0) === "_") return; // not configured yet → do nothing
  // Only count the real production site — never localhost, preview deploys, forks, or mirrors.
  const h = location.hostname;
  if (h !== "interactiveprimer.com" && h !== "www.interactiveprimer.com") return;

  // CF's beacon.min.js reads the token off its own <script> tag's data-cf-beacon attribute, so
  // injecting the element dynamically (the documented manual-install pattern) works fine.
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN }));
  document.head.appendChild(s);

  // GoatCounter — reads its endpoint from the data-goatcounter attribute on its own tag (so dynamic
  // injection works); https-pinned. We DISABLE its automatic on-load pageview (no_onload) and count
  // manually once the title is set: concept-page titles are built at runtime by render.js, so a plain
  // auto-count races render and logs a blank title. count.js augments this settings object with count().
  (window as any).goatcounter = { no_onload: true };
  const gc = document.createElement("script");
  gc.async = true;
  gc.src = "https://gc.zgo.at/count.js";
  gc.setAttribute("data-goatcounter", "https://interactiveprimer.goatcounter.com/count");
  document.head.appendChild(gc);

  // Count once, after the page title is in place. count() with no args reads the (now-correct)
  // document.title + location.pathname; retry while count.js is still loading.
  let counted = false;
  function fireCount(): void {
    if (counted) return;
    const g = (window as any).goatcounter;
    if (!g || typeof g.count !== "function") {
      setTimeout(fireCount, 50);
      return;
    }
    counted = true;
    g.count();
  }
  if (document.querySelector("primer-title")) {
    // A render.js page: its <primer-title> becomes document.title during render, then this fires.
    document.addEventListener("primer:rendered", fireCount);
  } else if (document.readyState === "loading") {
    // A static page (index.html / explore.html): the title is already in the HTML <head>.
    document.addEventListener("DOMContentLoaded", fireCount);
  } else {
    fireCount();
  }
})();
