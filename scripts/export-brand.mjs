import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { campaigns } from "../branding/content.mjs";
const root = resolve("site"),
  generated = resolve(root, "assets/generated");
await mkdir(generated, { recursive: true });
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    let file = resolve(root, "." + decodeURIComponent(path));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (path.endsWith("/")) file = resolve(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address(),
  origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1250, height: 1950 },
    deviceScaleFactor: 1,
  });
  const manifest = [];
  for (const piece of Object.keys(campaigns))
    for (const lang of ["en", "es"])
      for (const [format, width, height] of [
        ["post", 1080, 1350],
        ["story", 1080, 1920],
        ["share", 1200, 630],
      ]) {
        await page.goto(`${origin}/kit/?piece=${piece}&language=${lang}&format=${format}&export=1`);
        await page.evaluate(() => document.fonts.ready);
        await page
          .locator("#artboard img")
          .evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode())));
        const card = page.locator("#artboard"),
          bounds = await card.boundingBox();
        if (!bounds || bounds.width !== width || bounds.height !== height)
          throw Error(`Wrong export size ${piece}/${lang}/${format}`);
        if (await page.locator("#overflow-status").textContent())
          throw Error(`Copy overflow ${piece}/${lang}/${format}`);
        const file = `${piece}-${lang}-${format}.png`;
        await card.screenshot({ path: resolve(generated, file) });
        if (piece === "launch" && format === "share")
          await card.screenshot({ path: resolve(root, `assets/share-${lang}.png`) });
        manifest.push({
          piece,
          language: lang,
          format,
          width,
          height,
          file,
          alt: campaigns[piece][lang].alt,
          caption: campaigns[piece][lang].caption,
        });
      }
  await writeFile(resolve(generated, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Exported ${manifest.length} marketing PNGs and 2 social sharing images.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
