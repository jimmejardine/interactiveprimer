import puppeteer from "puppeteer";
const targets = [
  ["computer-science/networks/transport/tcp-congestion-control", "primer-chart", "cc-chart"],
  ["computer-science/networks/network-layer/link-state-and-distance-vector-routing", "primer-geometry", "routing-geo"],
  ["computer-science/networks/distributed-apps/load-balancing", "primer-geometry", "lb-geo"],
];
const b = await puppeteer.launch();
for (const [id, sel, name] of targets) {
  const p = await b.newPage();
  await p.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
  await p.goto("http://localhost:8080/concepts/" + id + ".html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1800));
  const el = await p.$(sel);
  if (el) { await el.screenshot({ path: "scratchpad/" + name + ".png" }); console.log("shot " + name); }
  else console.log("NO " + sel + " on " + id);
  await p.close();
}
await b.close();
