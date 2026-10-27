import { expect, test } from "@playwright/test";
import { HouseholdBackend } from "./backend";

test("Skendal installs with PNG icons and an older shell cannot restore the former branding", async ({
  page,
}) => {
  await new HouseholdBackend().install(page);
  // Seed the previous worker before the app registers its current shell.
  await page.goto("/manifest.webmanifest");
  await page.evaluate(async () => {
    const cache = await caches.open("homehub-shell-0000000000000000");
    await cache.put(
      "/manifest.webmanifest",
      new Response(JSON.stringify({ name: "HomeHub", short_name: "HomeHub" }), {
        headers: { "Content-Type": "application/manifest+json" },
      }),
    );
    await cache.put(
      "/icon.svg",
      new Response("former-green-house", { headers: { "Content-Type": "image/svg+xml" } }),
    );
    await cache.put(
      "/assets/previous-open-form.js",
      new Response("previous-open-form", { headers: { "Content-Type": "text/javascript" } }),
    );
  });
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
  });
  await expect(page).toHaveTitle("Skendal");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    "content",
    "Skendal",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/icons/skendal-v1-apple-180.png",
  );
  const metadata = await page.evaluate(async () => ({
    manifest: await (await fetch("/manifest.webmanifest")).json(),
    legacyIcon: await (await fetch("/icon.svg")).text(),
    oldChunk: await (await fetch("/assets/previous-open-form.js")).text(),
    caches: await caches.keys(),
  }));
  expect(metadata.manifest).toMatchObject({
    name: "Skendal",
    short_name: "Skendal",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  expect(metadata.legacyIcon).toContain("<title>Skendal</title>");
  expect(metadata.legacyIcon).not.toContain("former-green-house");
  expect(metadata.oldChunk).toBe("previous-open-form");
  expect(metadata.caches).toContain("homehub-shell-0000000000000000");
  const icons = await page.evaluate(async () => {
    const manifest = (await (await fetch("/manifest.webmanifest")).json()) as {
      icons: { src: string }[];
    };
    const paths = [
      ...manifest.icons.map((icon: { src: string }) => icon.src),
      document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!.href,
    ];
    return Promise.all(
      paths.map(async (path: string) => {
        const image = new Image();
        image.src = path;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = true;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) opaque = false;
        return { width: image.naturalWidth, height: image.naturalHeight, opaque };
      }),
    );
  });
  expect(icons).toEqual(
    [192, 512, 512, 180].map((size) => ({ width: size, height: size, opaque: true })),
  );
  const chrome = await page.context().newCDPSession(page);
  // Playwright isolates each test in a private profile, where Chrome disables installation.
  await expect
    .poll(async () =>
      (await chrome.send("Page.getInstallabilityErrors")).installabilityErrors.filter(
        (error) => error.errorId !== "in-incognito",
      ),
    )
    .toEqual([]);
});
