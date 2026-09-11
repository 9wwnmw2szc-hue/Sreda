const { chromium } = require("playwright");
const fs = require("fs");

const out = "/opt/cursor/artifacts";
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const sizes = [
    { name: "1440x900", w: 1440, h: 900 },
    { name: "1280x800", w: 1280, h: 800 },
    { name: "900x1000", w: 900, h: 1000 },
    { name: "390x844", w: 390, h: 844 },
    { name: "1359", w: 1359, h: 900 },
    { name: "1360", w: 1360, h: 900 },
    { name: "1099", w: 1099, h: 900 },
    { name: "1100", w: 1100, h: 900 },
    { name: "767", w: 767, h: 900 },
    { name: "768", w: 768, h: 900 },
  ];

  for (const s of sizes) {
    const page = await browser.newPage({
      viewport: { width: s.w, height: s.h },
    });
    page.on("pageerror", (e) => console.log("PAGEERROR", s.name, e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.log("CONSOLE", s.name, m.text());
    });
    await page.goto("http://localhost:3000/dashboard", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(1400);
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowX:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
      platformW: document
        .querySelector(".solution-scene__platform-board")
        ?.getBoundingClientRect().width,
    }));
    console.log(s.name, JSON.stringify(metrics));
    await page.screenshot({
      path: `${out}/corrective_${s.name}.png`,
      fullPage: true,
    });

    if (s.name === "1440x900") {
      const board = page.locator(".solution-scene__platform-board");
      if (await board.count()) {
        await board.screenshot({ path: `${out}/corrective_scene_closeup.png` });
      }
      await page.goto("http://localhost:3000/dashboard?debugScene=1", {
        waitUntil: "networkidle",
      });
      await page.waitForTimeout(1000);
      if (await board.count()) {
        await board.screenshot({ path: `${out}/corrective_scene_debug.png` });
      }
      await page.screenshot({
        path: `${out}/corrective_compare_impl_1440.png`,
        fullPage: false,
      });
    }
    await page.close();
  }

  await browser.close();
  console.log("SHOTS_DONE");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
