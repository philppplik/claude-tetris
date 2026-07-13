// shot-demo.cjs — capture just the #demo section element, paused for render.
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  await page.goto("http://localhost:8137/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.getElementById("demo").scrollIntoView());
  await page.waitForTimeout(700);
  const demo = await page.$("#demo");
  await demo.screenshot({ path: "/tmp/shot-demo-sect.png" });
  console.log("errors:", JSON.stringify(errors));
  await browser.close();
  console.log("done");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
