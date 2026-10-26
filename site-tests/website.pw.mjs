import { expect, test } from "@playwright/test";
const catalogue = {
  plans: [{ id: "pro", currency: "USD", amount_cents: 299, annual_amount_cents: 599 }],
};
async function pricing(page, value = catalogue) {
  await page.route("**/rest/v1/rpc/business_catalog", (route) =>
    value === null ? route.abort() : route.fulfill({ json: value }),
  );
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}
test("both static languages navigate, remember a choice, and keep prelaunch and planned prices clear", async ({
  page,
}, info) => {
  await pricing(page);
  await page.goto("/?lang=en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toContainText("Less to juggle.");
  await expect(page.locator("#monthly-price")).toHaveText("$2.99");
  await expect(page.locator("#annual-price")).toHaveText("$5.99");
  await expect(page.locator("#pricing-status")).toContainText("not active");
  await expect(page.locator(".hero .availability")).toContainText("currently in Spanish");
  await expect(page.locator(".hero a.button")).toHaveAttribute("href", "#everyday");
  await noOverflow(page);
  await page.locator(".site-header [data-language=es]").click();
  await expect(page).toHaveURL(/\/es\/$/);
  await expect(page.locator("h1")).toContainText("Menos pendientes.");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("#pricing-status")).toContainText("no están activos");
  await noOverflow(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/es\/$/);
  await page.locator(".site-header [data-language=en]").click();
  await expect(page.locator("h1")).toContainText("Less to juggle.");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page);
  }
  await page.setViewportSize(
    info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  );
  await page.screenshot({ path: info.outputPath("skendal-en.png"), fullPage: true });
  await page.goto("/es/");
  await page.screenshot({ path: info.outputPath("skendal-es.png"), fullPage: true });
  expect(await page.locator("link[rel=alternate][hreflang='en-US']").getAttribute("href")).toBe(
    "https://skendal.com/",
  );
  await expect(page.locator("meta[property='og:image']")).toHaveAttribute(
    "content",
    "https://skendal.com/assets/share-es.png",
  );
});
test("a failed or invalid catalogue keeps prices hidden and account links available", async ({
  page,
}) => {
  await pricing(page, {
    plans: [{ id: "pro", currency: "USD", amount_cents: -299, annual_amount_cents: 599 }],
  });
  await page.goto("/?lang=en");
  await expect(page.locator("#pricing-cards")).toBeHidden();
  await expect(page.locator(".hero a.button")).toBeVisible();
  await page.unroute("**/rest/v1/rpc/business_catalog");
  await pricing(page, null);
  await page.reload();
  await expect(page.locator("#pricing-cards")).toBeHidden();
  await expect(page.locator("#pricing-status")).toContainText("not active");
});
test("language links and FAQs remain readable without JavaScript or browser storage", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    test.info().config.use?.baseURL || process.env.SKENDAL_SITE_URL || "http://127.0.0.1:8084",
  );
  await expect(page.locator("h1")).toContainText("Less to juggle.");
  await page.locator(".site-header [data-language=es]").click();
  await expect(page.locator("h1")).toContainText("Menos pendientes.");
  await page.getByText("¿Necesito tener una tablet?", { exact: true }).click();
  await expect(page.locator("details[open]")).toContainText("No.");
  await context.close();
  const other = await browser.newContext();
  const p = await other.newPage();
  await pricing(p);
  await p.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await p.goto((process.env.SKENDAL_SITE_URL || "http://127.0.0.1:8084") + "/es/");
  await expect(p.locator("h1")).toContainText("Menos pendientes.");
  await p.locator(".site-header [data-language=en]").click();
  await expect(p.locator("h1")).toContainText("Less to juggle.");
  await other.close();
});
test("marketing templates change language, preserve safe edits, and export actual original PNG files", async ({
  page,
}) => {
  await page.goto("/kit/");
  await page.locator("#language").selectOption("en");
  await expect(page.locator("#poster-headline")).toContainText("Less to juggle.");
  await page.locator("#piece").selectOption("lists");
  await expect(page.locator("#poster-headline")).toContainText("Everyone in the loop.");
  const draft = "<script>text only</script>";
  await page.locator("#headline").fill(draft);
  await expect(page.locator("#poster-headline")).toHaveText(draft);
  await page.reload();
  await expect(page.locator("#poster-headline")).not.toHaveText(draft);
  await page.locator("#language").selectOption("en");
  await page.locator("#piece").selectOption("lists");
  await expect(page.locator("#poster-headline")).toHaveText(draft);
  await expect(page.locator("#poster-headline script")).toHaveCount(0);
  await page.getByRole("button", { name: "Restablecer texto" }).click();
  await expect(page.locator("#poster-headline")).toContainText("Everyone in the loop.");
  await page.locator("#format").selectOption("story");
  const link = await page.locator("#original").getAttribute("href"),
    response = await page.request.get(new URL(link, page.url()).href);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect((await response.body()).readUInt32BE(16)).toBe(1080);
  expect((await response.body()).readUInt32BE(20)).toBe(1920);
  await page.goto("/kit/?piece=tablet&language=es&format=story&export=1");
  await expect(page.locator("#poster-headline")).toContainText("Un nuevo lugar");
  await expect(page.locator(".tools")).toBeHidden();
  expect(
    await page.locator("#artboard").evaluate((el) => ({ w: el.offsetWidth, h: el.offsetHeight })),
  ).toEqual({ w: 1080, h: 1920 });
});

test("legal preparation and editable Free / Pro proposals do not present final contracts", async ({
  page,
}) => {
  const limits = { members: 4, lists: 3, devices: 1, photos: 3, widgets: 6 };
  await pricing(page, {
    plans: [
      { id: "free", currency: "USD", amount_cents: 0, annual_amount_cents: 0, limits },
      {
        id: "pro",
        currency: "USD",
        amount_cents: 399,
        annual_amount_cents: 1299,
        limits: { members: 12, lists: 20, devices: 3, photos: 12, widgets: 64 },
      },
    ],
  });
  await page.goto("/?lang=en");
  await expect(page.getByText("Project in preparation", { exact: true })).toBeVisible();
  await expect(page.locator("#monthly-price")).toHaveText("$3.99");
  await expect(page.locator("#plan-comparison table")).toBeVisible();
  await expect(page.locator("#plan-comparison")).toContainText("Full catalogue");
  await page.getByRole("link", { name: "Legal preparation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Legal preparation", exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("has not yet been formed");
  await expect(page.locator("main")).toContainText("13+");
  await page.goto("/es/legal/");
  await expect(page.getByRole("heading", { name: "Preparación legal", exact: true })).toBeVisible();
  await expect(page.locator("main")).toContainText("no está constituida");
  await noOverflow(page);
});
