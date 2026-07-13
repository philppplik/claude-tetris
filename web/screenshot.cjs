// screenshot.cjs — render web/ with headless Chromium (Playwright) and save a PNG.
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:8137/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // let fonts + hero canvas animate

  // Full hero
  await page.screenshot({ path: "/tmp/shot-hero.png" });

  // Scroll through the page to trigger reveals, then capture sections
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.28));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/shot-how.png" });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.52));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/shot-features.png" });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.72));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/shot-demo.png" });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/shot-install.png" });

  // Full-page stitched
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/shot-full.png", fullPage: true });

  console.log("errors:", JSON.stringify(errors));
  await browser.close();
  console.log("screenshots saved");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
