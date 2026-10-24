import { expect, test } from "@playwright/test";
import { HouseholdBackend, HOME_ID, signIn } from "./backend";

const school = "10000000-0000-4000-8000-000000000041";
const account = "20000000-0000-4000-8000-000000000001";
function seed(backend: HouseholdBackend) {
  backend.rows["shopping_lists"]!.push({
    id: school,
    household_id: HOME_ID,
    name: "School",
    archived: false,
    revision: 1,
    position: 1,
  });
  backend.rows["shopping_items"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Milk",
      done: false,
      revision: 1,
      position: 0,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: school,
      name: "Pencils",
      done: false,
      revision: 1,
      position: 1,
    },
  ];
  const bill = crypto.randomUUID();
  backend.rows["bills"] = [
    {
      id: bill,
      household_id: HOME_ID,
      name: "Internet",
      category: "Casa",
      base: 40,
      due_day: 28,
      auto_pay: false,
      revision: 1,
      position: 0,
    },
  ];
  backend.rows["bill_splits"] = [{ bill_id: bill, person_key: "m_ana", type: "equal", value: 0 }];
  const now = new Date(),
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  backend.rows["contributions"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      person_key: "m_ana",
      amount: 10,
      month,
      note: "",
      revision: 1,
      occurred_on: `${month}-01`,
    },
  ];
  backend.dashboardPreference = {
    user_id: account,
    revision: 1,
    layout: { version: 3, widgets: [] },
  };
}

test("choosing a shopping list, financial progress and expanded catalogue persist without duplicates", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  await page.getByRole("button", { name: "Añadir widgets", exact: true }).click();
  let catalog = page.getByRole("dialog", { name: "Añadir widgets", exact: true });
  await expect(catalog.getByRole("button", { name: /^Añadir / })).toHaveCount(20);
  await catalog.getByRole("button", { name: "Añadir lista de compras", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Elegir lista", exact: true });
  await expect(page.locator('[data-widget="shopping"]')).toHaveCount(0);
  await chooser.getByRole("button", { name: "School", exact: true }).click();
  catalog = page.getByRole("dialog", { name: "Añadir widgets", exact: true });
  await expect(
    catalog.getByRole("button", { name: "Añadir lista de compras", exact: true }),
  ).toBeDisabled();
  await catalog.getByRole("button", { name: "Añadir resumen de miembro", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Elegir miembro", exact: true })
    .getByRole("button", { name: "Ana", exact: true })
    .click();
  await catalog.getByRole("button", { name: "Añadir calendario", exact: true }).click();
  for (const name of [
    "tareas de miembro",
    "recordatorios",
    "próximo vencimiento",
    "resumen de compras",
  ]) {
    await catalog.getByRole("button", { name: `Añadir ${name}`, exact: true }).click();
    if (name === "tareas de miembro")
      await page
        .getByRole("dialog", { name: "Elegir miembro", exact: true })
        .getByRole("button", { name: "Nico", exact: true })
        .click();
  }
  await catalog.getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("button", { name: "Configurar calendario", exact: true }).click();
  const config = page.getByRole("dialog", { name: "Configurar widget", exact: true });
  await config.getByRole("button", { name: "Tamaño 3 por 4", exact: true }).click();
  await config.getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator('[data-widget="shopping"]')).toContainText("Pencils");
  await expect(page.locator('[data-widget="shopping"]')).not.toContainText("Milk");
  await expect(
    page.getByRole("progressbar", { name: "Aporte de Ana", exact: true }),
  ).toHaveAttribute("aria-valuenow", "25");
  const progressBounds = await page
    .getByRole("progressbar", { name: "Aporte de Ana", exact: true })
    .evaluate((node) => {
      const bar = node.getBoundingClientRect(),
        card = node.closest(".widget-card")!.getBoundingClientRect();
      return bar.height >= 5 && bar.bottom <= card.bottom;
    });
  expect(progressBounds).toBe(true);
  const calendar = page.locator('[data-widget="month-calendar"]');
  const geometry = await calendar.evaluate((node) => {
    const card = node.getBoundingClientRect(),
      days = [...node.querySelectorAll(".dw-day")],
      first = days[0]!.getBoundingClientRect(),
      last = days[41]!.getBoundingClientRect();
    return {
      coverage: (last.bottom - first.top) / card.height,
      bottom: last.bottom <= card.bottom,
    };
  });
  expect(geometry.coverage).toBeGreaterThan(0.65);
  expect(geometry.bottom).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("reviewed-widgets.png"), fullPage: true });
  await page.reload();
  await expect(page.locator('[data-widget="shopping"]')).toContainText("School");
  await expect(page.locator('[data-widget="shopping"]')).toHaveCount(1);
  await expect(page.locator('[data-widget="month-calendar"]')).toHaveAttribute("data-size", "full");
  const saved = backend.dashboardPreference!["layout"] as {
    version: number;
    widgets: Record<string, unknown>[];
  };
  expect(saved.version).toBe(3);
  expect(saved.widgets.find((w) => w["id"] === "shopping")?.["listId"]).toBe(school);
  expect(JSON.stringify(saved)).not.toMatch(/Pencils|School|Internet|amount/);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("one finger scrolls the widget bodies naturally before and during editing", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Uses native touch scrolling");
  const backend = new HouseholdBackend();
  backend.dashboardPreference = {
    user_id: account,
    revision: 1,
    layout: {
      version: 3,
      widgets: [
        { id: "tasks", key: "tasks", size: "full" },
        { id: "notes", key: "notes", size: "full" },
        { id: "shopping", key: "shopping", size: "full" },
      ],
    },
  };
  await backend.install(page);
  await signIn(page);
  const touch = await page.context().newCDPSession(page),
    grid = page.locator(".dashboard-grid");
  const original = await grid
    .locator("[data-widget]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-widget")));
  for (const editing of [false, true]) {
    await page.evaluate(() => window.scrollTo(0, 0));
    if (editing) await page.getByRole("button", { name: "Personalizar", exact: true }).click();
    const box = (await grid.boundingBox())!,
      start = { x: box.x + box.width / 2, y: Math.min(600, box.y + 240), id: 1 };
    const scroll = await page.evaluate(() => scrollY);
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    await page.waitForTimeout(600);
    await expect(page.locator(".widget-lifted")).toHaveCount(0);
    for (let step = 1; step <= 10; step++) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...start, y: start.y - step * 20 }],
      });
      await page.waitForTimeout(20);
    }
    await page.waitForTimeout(100);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll + 100);
    expect(
      await grid
        .locator("[data-widget]")
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-widget"))),
    ).toEqual(original);
    await expect(page.locator(".widget-lifted")).toHaveCount(0);
  }
  // An incidental second finger cancels a grip drag without custom scrolling.
  await page.evaluate(() => window.scrollTo(0, 0));
  const grip = (await page
    .getByRole("button", { name: "Mover tareas de hoy", exact: true })
    .boundingBox())!;
  const start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2, id: 2 };
  const before = await page.evaluate(() => scrollY);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await expect(page.locator(".widget-lifted")).toHaveCount(1);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start, { x: start.x + 100, y: start.y - 60, id: 3 }],
  });
  await expect(page.locator(".widget-lifted")).toHaveCount(0);
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 0);
  expect(
    await grid
      .locator("[data-widget]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-widget"))),
  ).toEqual(original);
  expect(
    await grid
      .locator(".widget-card")
      .evaluateAll((nodes) =>
        nodes.every((node) => (node as HTMLElement).style.position !== "fixed"),
      ),
  ).toBe(true);
  expect(backend.dashboardSaveRequests).toBe(0);
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  expect(backend.unexpectedRequests).toEqual([]);
});
