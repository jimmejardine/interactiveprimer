// @ts-check
/**
 * Cloudflare Web Analytics — cookieless and collects no personal data, so it needs NO EU consent
 * banner. Loaded on every page (boot.js injects it on concept pages; index.html and concepts.html
 * include it directly). The beacon token is the single thing to configure: paste it from the
 * Cloudflare dashboard (Analytics → Web Analytics → your site → JS snippet) in place of the
 * placeholder below. Until then this is a safe no-op.
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
})();
