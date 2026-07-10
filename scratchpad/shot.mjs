import puppeteer from "puppeteer";
const b = await puppeteer.launch();
const p = await b.newPage();
await p.setViewport({width:1100,height:600,deviceScaleFactor:1});
await p.goto("http://localhost:8080/concepts/computer-science/networks/programming/the-socket-api.html",{waitUntil:"networkidle0"});
await new Promise(r=>setTimeout(r,1800));
// screenshot just the geometry widget
const el = await p.$("primer-geometry");
await el.screenshot({path:"scratchpad/socket-geo.png"});
await b.close();
console.log("done");
