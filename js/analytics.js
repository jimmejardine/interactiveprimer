// @ts-check
/**
 * Cookieless visitor analytics — Cloudflare Web Analytics + GoatCounter. Both are cookieless and
 * collect no personal data, so NO EU consent banner is needed. Loaded on every page (boot.js injects
 * it on concept pages; index.html and concepts.html include it directly), but only ACTUALLY fires on
 * the real production domain — never localhost, preview deploys, forks, or mirrors.
 * @module
 */
(function () {
  var TOKEN = "cb0473cb3ef84b339dc962a565dda272"; // Cloudflare Web Analytics beacon token
  if (!TOKEN || TOKEN.charAt(0) === "_") return; // not configured yet → do nothing
  // Only count the real production site — never localhost, preview deploys, forks, or mirrors.
  var h = location.hostname;
  if (h !== "interactiveprimer.com" && h !== "www.interactiveprimer.com") return;

  // CF's beacon.min.js reads the token off its own <script> tag's data-cf-beacon attribute, so
  // injecting the element dynamically (the documented manual-install pattern) works fine.
  var s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN }));
  document.head.appendChild(s);

  // GoatCounter — same idea: count.js auto-counts the pageview, reading its endpoint from the
  // data-goatcounter attribute on its own tag (so dynamic injection works). https-pinned.
  var gc = document.createElement("script");
  gc.async = true;
  gc.src = "https://gc.zgo.at/count.js";
  gc.setAttribute("data-goatcounter", "https://interactiveprimer.goatcounter.com/count");
  document.head.appendChild(gc);
})();
