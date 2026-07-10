import puppeteer from "puppeteer";
import { globSync } from "glob";

const files = globSync("concepts/computer-science/networks/*/*.html")
  .map((f) => f.split("\\").join("/"))
  .concat(["concepts/computer-science/courses/masters/computer-networks.html"]);

const b = await puppeteer.launch();
let broken = 0;
for (const f of files) {
  const url = "http://localhost:8080/" + f;
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  try {
    await p.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1200));
    const widget = await p.evaluate(() => (window.__primerErrors || []).slice());
    for (const e of widget) errs.push("widget: " + (typeof e === "string" ? e : JSON.stringify(e)));
  } catch (e) {
    errs.push("nav: " + e.message);
  }
  if (errs.length) {
    broken++;
    console.log("BROKEN " + f);
    errs.slice(0, 4).forEach((e) => console.log("    " + e.slice(0, 220)));
  }
  await p.close();
}
await b.close();
console.log(`\nChecked ${files.length} page(s); ${broken} with errors.`);
