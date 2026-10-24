import { expect, test } from "@playwright/test";

const lab = "/widgets-lab.html";
const cards = "#board > .widget";

test("widget review keeps one of each type, selected records and annotations", async ({ page }) => {
  const errors: string[] = [];
  const apiCalls: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/\/(rest|auth|functions)\/v1\/|\/api\//.test(request.url())) apiCalls.push(request.url());
  });
  await page.goto(lab);
  await expect(page.locator(cards)).toHaveCount(17);
  await page.getByRole("button", { name: "Añadir widgets", exact: true }).click();
  await expect(page.getByRole("button", { name: "Añadir facturas", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cerrar catálogo", exact: true }).click();

  await page.getByRole("button", { name: "Revisar lista específica", exact: true }).click();
  await page.locator("#widget-adjustments > summary").click();
  await page.getByLabel("Lista", { exact: true }).selectOption("groceries");
  const comment = "Dejar solo información. <img src=x onerror=alert(1)>";
  await page.getByLabel("Tus indicaciones", { exact: true }).fill(comment);
  await page.getByRole("button", { name: "Me gusta", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar revisión", exact: true }).click();
  await expect(page.locator('#board > [data-id="specific-list"]')).toContainText("Supermercado");
  await expect(page.locator('#board > [data-id="specific-list"]')).toContainText("Leche");
  await page.reload();
  await page.getByRole("button", { name: "Revisar lista específica", exact: true }).click();
  await page.locator("#widget-adjustments > summary").click();
  await expect(page.getByLabel("Tus indicaciones", { exact: true })).toHaveValue(comment);
  await expect(page.getByLabel("Lista", { exact: true })).toHaveValue("groceries");
  await expect(page.getByRole("button", { name: "Me gusta", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar revisión", exact: true }).click();
  const download = await downloading;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.reviews["specific-list"].comment).toBe(comment);
  expect(exported.refs["specific-list"]).toBe("groceries");
  expect(new Set(exported.layout.map((w: { id: string }) => w.id)).size).toBe(17);
  await page.getByRole("button", { name: "Cerrar revisión", exact: true }).click();

  await page.getByRole("button", { name: "Editar widgets", exact: true }).click();
  await page.getByRole("button", { name: "Quitar facturas", exact: true }).click();
  await expect(page.locator(cards)).toHaveCount(16);
  await page.getByRole("button", { name: "Añadir widgets", exact: true }).click();
  await page.getByRole("button", { name: "Añadir facturas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Añadir facturas", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cerrar catálogo", exact: true }).click();
  await expect(page.locator('#board > [data-id="bills"]')).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(apiCalls).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("large calendar fills its widget and every widget can be reviewed alone", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(lab);
  await page.getByRole("button", { name: "Revisar calendario", exact: true }).click();
  await page.locator("#widget-adjustments > summary").click();
  await page.getByRole("button", { name: "Tamaño 3 por 4", exact: true }).click();
  await page.getByRole("button", { name: "Ver este widget solo", exact: true }).click();
  await expect(page.locator(cards)).toHaveCount(1);
  await expect(page.locator(".month-grid .day")).toHaveCount(42);
  const geometry = await page.locator('#board > [data-id="month-calendar"]').evaluate((node) => {
    const inner = node.querySelector(".widget-main")!.getBoundingClientRect();
    const grid = node.querySelector(".month-grid")!.getBoundingClientRect();
    const last = node.querySelector(".month-grid .day:last-child")!.getBoundingClientRect();
    return {
      ratio: grid.height / inner.height,
      fits: last.bottom <= inner.bottom + 1,
      reachesBottom: Math.abs(grid.bottom - inner.bottom) < 2,
    };
  });
  expect(geometry.ratio).toBeGreaterThan(0.7);
  expect(geometry.fits).toBe(true);
  expect(geometry.reachesBottom).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("calendar-full.png"), fullPage: true });
  await page.getByRole("button", { name: "Widget siguiente", exact: true }).click();
  await expect(page.locator(cards)).toHaveCount(1);
  await expect(page.locator('#board > [data-id="specific-note"]')).toBeVisible();
  await page.getByRole("button", { name: "Revisar uno a uno", exact: true }).click();
  await expect(page.locator(cards)).toHaveCount(17);
});

test("editing moves with one finger and scrolls over widgets with two fingers", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Uses real Chromium multi-touch events");
  await page.goto(lab);
  await page.getByRole("button", { name: "Editar widgets", exact: true }).click();
  const client = await context.newCDPSession(page);
  const first = await page.locator('#board > [data-id="clock"]').boundingBox();
  const third = await page.locator('#board > [data-id="shopping"]').boundingBox();
  const start = { x: first!.x + first!.width / 2, y: first!.y + first!.height / 2 };
  const end = { x: third!.x + third!.width / 2, y: third!.y + third!.height / 2 };
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...start, id: 1 }],
  });
  await page.waitForTimeout(300);
  for (let i = 1; i <= 7; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start.x + ((end.x - start.x) * i) / 7, y: start.y, id: 1 }],
    });
    await page.waitForTimeout(35);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const order = () =>
    page.locator(cards).evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-id")));
  await expect.poll(async () => (await order()).indexOf("clock")).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBeLessThan(2);

  const before = await order();
  const y = Math.min(page.viewportSize()!.height - 120, 500);
  const points = [
    { x: 130, y, id: 2 },
    { x: 270, y, id: 3 },
  ];
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points });
  for (let i = 1; i <= 8; i++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points.map((p) => ({ ...p, y: p.y - (220 * i) / 8 })),
    });
    await page.waitForTimeout(25);
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(160);
  expect(await order()).toEqual(before);
  await client.detach();
});

test("corner resize and cancelled dragging preserve the intended layout", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Complements the multi-touch case with mouse input",
  );
  await page.goto(lab);
  await page.getByRole("button", { name: "Editar widgets", exact: true }).click();
  const card = page.locator('#board > [data-id="tasks"]');
  await card.getByRole("button", { name: "Cambiar tamaño de tareas de hoy", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Revisar widget", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar revisión", exact: true }).click();
  const size = await card.boundingBox();
  const corner = await card
    .getByRole("button", { name: "Cambiar tamaño de tareas de hoy", exact: true })
    .boundingBox();
  const x = corner!.x + corner!.width / 2,
    y = corner!.y + corner!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + size!.width + 12, y + size!.height + 15, { steps: 10 });
  await page.mouse.up();
  await expect(card).toHaveAttribute("data-cols", "2");
  await expect(card).toHaveAttribute("data-rows", "2");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await page
    .locator(cards)
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-id")));
  const clock = await page.locator('#board > [data-id="clock"]').boundingBox();
  await page.mouse.move(clock!.x + 25, clock!.y + 50);
  await page.mouse.down();
  await page.waitForTimeout(280);
  await expect(page.locator(".drag-ghost")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".drag-ghost")).toHaveCount(0);
  expect(
    await page.locator(cards).evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-id"))),
  ).toEqual(before);
});
