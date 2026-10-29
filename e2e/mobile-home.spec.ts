import { expect, test, type Page } from "@playwright/test";
import { HOME_ID, HouseholdBackend, signIn, section, openTabletPin, enterPin } from "./backend";
const userId = "20000000-0000-4000-8000-000000000001";
const schoolId = "10000000-0000-4000-8000-000000000094";
const targetDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 12);
const targetDate = `${targetDay.getFullYear()}-${String(targetDay.getMonth() + 1).padStart(2, "0")}-12`;
const dayLabel = targetDay.toLocaleDateString("es", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
function seed(backend: HouseholdBackend) {
  backend.rows["shopping_lists"]!.push({
    id: schoolId,
    household_id: HOME_ID,
    name: "School",
    archived: false,
    position: 1,
    revision: 1,
  });
  backend.rows["shopping_items"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: schoolId,
      name: "Cuaderno",
      done: false,
      position: 0,
      revision: 1,
    },
  ];
  backend.rows["events"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Reunión de clase",
      date: targetDate,
      time: "16:00",
      end_time: "17:00",
      note: "Traer carpeta",
      member_key: "m_ana",
      kind: "event",
      completed: false,
      revision: 1,
    },
  ];
  const id = crypto.randomUUID();
  backend.rows["bills"] = [
    {
      id,
      household_id: HOME_ID,
      name: "Internet familiar",
      category: "Internet",
      base: 45,
      due_day: 12,
      auto_pay: false,
      position: 0,
      revision: 1,
    },
  ];
  backend.rows["bill_splits"] = [{ bill_id: id, person_key: "m_ana", type: "equal", value: 0 }];
  backend.dashboardPreference = {
    user_id: userId,
    revision: 1,
    layout: {
      version: 3,
      widgets: [
        { id: "progress", key: "progress", size: "wide" },
        { id: "member-summary", key: "member", size: "column", memberId: "m_ana" },
        { id: "shopping", key: "shopping", size: "portrait", listId: schoolId },
        { id: "month-calendar", key: "month", size: "portrait" },
        { id: "calendar", key: "agenda", size: "column" },
        { id: "finance", key: "money", size: "column" },
      ],
    },
  };
}

async function layoutCells(page: Page) {
  return page.locator(".dashboard-grid").evaluate((grid) => {
    const style = getComputedStyle(grid);
    const columns = style.gridTemplateColumns.split(" ").filter(Boolean).map(Number.parseFloat);
    const gapX = Number.parseFloat(style.columnGap),
      gapY = Number.parseFloat(style.rowGap);
    const unitX = columns[0]! + gapX,
      unitY = Number.parseFloat(style.gridAutoRows) + gapY;
    const origin = grid.getBoundingClientRect();
    return {
      columns: columns.length,
      cells: Array.from(grid.querySelectorAll<HTMLElement>("[data-grid-widget]")).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.dataset["widget"],
          key: node.dataset["widgetKey"],
          column: Math.round((rect.left - origin.left) / unitX),
          row: Math.round((rect.top - origin.top) / unitY),
          width: Math.round((rect.width + gapX) / unitX),
          height: Math.round((rect.height + gapY) / unitY),
        };
      }),
    };
  });
}

test("phone defaults keep the same explicit grid through editing, reset, save and changing content", async ({
  page,
}, info) => {
  const backend = new HouseholdBackend();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await backend.install(page);
  await signIn(page);
  const original = await layoutCells(page);
  expect(original.columns).toBe(3);
  expect(original.cells.map(({ id, width, height }) => ({ id, width, height }))).toEqual([
    { id: "tasks", width: 3, height: 1 },
    { id: "shopping", width: 3, height: 2 },
    { id: "calendar", width: 3, height: 2 },
  ]);
  expect(original.cells.map(({ row }) => row)).toEqual([0, 1, 3]);
  expect(backend.dashboardSaveRequests).toBe(0);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  expect(await layoutCells(page)).toEqual(original);
  await page.getByRole("button", { name: "Ocultar próximos eventos", exact: true }).click();
  await page.getByRole("button", { name: "Restablecer diseño", exact: true }).click();
  expect(await layoutCells(page)).toEqual(original);
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  expect(await layoutCells(page)).toEqual(original);
  expect(backend.dashboardSaveRequests).toBe(1);
  backend.rows["shopping_items"] = Array.from({ length: 18 }, (_, position) => ({
    id: crypto.randomUUID(),
    household_id: HOME_ID,
    list_id: HOME_ID,
    name: `Producto ${position}`,
    done: false,
    position,
    revision: 1,
  }));
  await page.reload();
  await expect(page.getByRole("button", { name: "Personalizar", exact: true })).toBeEnabled();
  expect(await layoutCells(page)).toEqual(original);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath("phone-default-grid.png"), fullPage: true });
  expect(backend.unexpectedRequests).toEqual([]);
});

test("all twelve widget sizes retain their chosen cells after customizing, saving and reloading", async ({
  page,
}, info) => {
  const backend = new HouseholdBackend();
  const choices = [
    { id: "clock", size: "small", width: 1, height: 1 },
    { id: "tasks", size: "compact", width: 1, height: 2 },
    { id: "shopping", size: "tall", width: 1, height: 3 },
    { id: "family", size: "column", width: 1, height: 4 },
    { id: "shopping-summary", size: "short", width: 2, height: 1 },
    { id: "notes", size: "wide", width: 2, height: 2 },
    { id: "progress", size: "square", width: 2, height: 3 },
    { id: "calendar", size: "portrait", width: 2, height: 4 },
    { id: "reminders", size: "banner", width: 3, height: 1 },
    { id: "week", size: "panorama", width: 3, height: 2 },
    { id: "month-calendar", size: "large", width: 3, height: 3 },
    { id: "pinned-note", size: "full", width: 3, height: 4 },
  ];
  backend.dashboardPreference = {
    user_id: userId,
    revision: 1,
    layout: { version: 3, widgets: choices.map(({ id, size }) => ({ id, key: id, size })) },
  };
  const widths = info.project.name === "mobile" ? [320, 390, 430, 767] : [1024];
  await page.setViewportSize({ width: widths[0]!, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await backend.install(page);
  await signIn(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const before = await layoutCells(page);
    expect(before.columns).toBe(3);
    await page.getByRole("button", { name: "Personalizar", exact: true }).click();
    expect(await layoutCells(page)).toEqual(before);
    await page.getByRole("button", { name: "Configurar tareas de hoy", exact: true }).click();
    const config = page.getByRole("dialog", { name: "Configurar widget", exact: true });
    await config.getByRole("button", { name: "Tamaño 2 por 3", exact: true }).click();
    await config.getByRole("button", { name: "Listo", exact: true }).click();
    await page.getByRole("button", { name: "Mover reloj y fecha", exact: true }).press("ArrowDown");
    const draft = await layoutCells(page);
    expect(draft.columns).toBe(3);
    for (const cell of draft.cells) {
      const wanted =
        cell.id === "tasks"
          ? { width: 2, height: 3 }
          : choices.find((choice) => choice.id === cell.id)!;
      expect({ width: cell.width, height: cell.height }).toEqual({
        width: wanted.width,
        height: wanted.height,
      });
    }
    await page.screenshot({ path: info.outputPath(`layout-editor-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Personalizar inicio", exact: true }),
    ).toHaveCount(0);
    expect(await layoutCells(page)).toEqual(draft);
    await page.reload();
    await expect(page.getByRole("button", { name: "Personalizar", exact: true })).toBeEnabled();
    expect(await layoutCells(page)).toEqual(draft);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`layout-saved-${width}.png`), fullPage: true });
  }
  expect(backend.dashboardSaveRequests).toBe(widths.length);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("widgets navigate to their section and selected list while product taps stay on home", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  const shopping = page.locator('[data-widget="shopping"]');
  await shopping.getByRole("checkbox", { name: "Cuaderno" }).click();
  await expect(shopping.getByRole("checkbox", { name: "Cuaderno" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await shopping.getByRole("button", { name: "Ver lista de compras", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toBeVisible();
  await section(page, "Inicio");
  await page
    .locator('[data-widget="finance"]')
    .getByRole("button", { name: "Ver fondo común", exact: true })
    .click();
  await expect(page.locator("[data-widget]")).toHaveCount(0);
  await section(page, "Inicio");
  await page.locator('[data-widget="progress"] .dw-ring').click();
  await expect(page.locator("[data-widget]")).toHaveCount(0);
  await section(page, "Inicio");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const count = backend.writeRequests;
  await page
    .locator('[data-widget="shopping"] [role="checkbox"]')
    .evaluate((node: HTMLElement) => node.click());
  await page
    .locator('[data-widget="month-calendar"] .dw-day')
    .first()
    .evaluate((node: HTMLElement) => node.click());
  expect(backend.writeRequests).toBe(count);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Personalizar inicio", exact: true }),
  ).toBeVisible();
});

test("dashboard day popup shows real entries and saves new reminders without leaving home", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  await page
    .locator('[data-widget="month-calendar"]')
    .getByRole("button", { name: "Mes siguiente del widget", exact: true })
    .click();
  await page
    .locator('[data-widget="month-calendar"]')
    .getByRole("button", { name: dayLabel, exact: true })
    .click();
  const day = page.getByRole("dialog", { name: /Agenda ·/ });
  await expect(day).toContainText("Reunión de clase");
  await expect(day).toContainText("Internet familiar");
  await day.getByRole("button", { name: "Añadir al calendario", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Nuevo evento", exact: true });
  await expect(editor.getByLabel("Fecha", { exact: true })).toHaveValue(targetDate);
  await editor.getByRole("button", { name: "Recordatorio", exact: true }).click();
  const reminder = page.getByRole("dialog", { name: "Nuevo recordatorio", exact: true });
  await reminder.getByLabel("Título", { exact: true }).fill("Llevar cartulina");
  backend.failNextSave = true;
  await reminder.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(reminder).toBeVisible();
  expect(backend.rows["events"]!.some((e) => e["title"] === "Llevar cartulina")).toBe(false);
  await reminder.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(day).toBeVisible();
  await expect(day).toContainText("Llevar cartulina");
  const saved = backend.rows["events"]!.find((e) => e["title"] === "Llevar cartulina")!;
  expect(saved).toMatchObject({ date: targetDate, kind: "reminder", completed: false });
  await day.getByRole("button", { name: "Completar Llevar cartulina", exact: true }).click();
  await expect
    .poll(
      () => backend.rows["events"]!.find((e) => e["title"] === "Llevar cartulina")!["completed"],
    )
    .toBe(true);
  await day.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator('[data-widget="month-calendar"]')).toBeVisible();
  await page.reload();
  await page
    .locator('[data-widget="month-calendar"]')
    .getByRole("button", { name: "Mes siguiente del widget", exact: true })
    .click();
  await page
    .locator('[data-widget="month-calendar"]')
    .getByRole("button", { name: dayLabel, exact: true })
    .click();
  await expect(day).toContainText("Llevar cartulina");
  await expect(
    day.getByRole("button", { name: "Completar Llevar cartulina", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(backend.unexpectedRequests).toEqual([]);
});

test("dashboard bill details remain financial records and child day popups expose shared entries only", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  const openDay = async () => {
    await page
      .locator('[data-widget="month-calendar"]')
      .getByRole("button", { name: "Mes siguiente del widget", exact: true })
      .click();
    await page
      .locator('[data-widget="month-calendar"]')
      .getByRole("button", { name: dayLabel, exact: true })
      .click();
  };
  await openDay();
  const day = page.getByRole("dialog", { name: /Agenda ·/ });
  await day.locator('[data-calendar-kind="bill"]').getByRole("button").click();
  const bill = page.getByRole("dialog", { name: "Internet familiar", exact: true });
  await bill.getByRole("button", { name: "Marcar pagada", exact: true }).click();
  await expect(bill).toContainText("Pagada");
  await bill.getByRole("button", { name: "Close", exact: true }).click();
  await expect(day).toBeVisible();
  await expect(day.locator('[data-calendar-kind="bill"]')).toContainText("Pagada");
  expect(backend.rows["events"]).toHaveLength(1);
  await day.getByRole("button", { name: "Close", exact: true }).click();
  // A separate shared-tablet profile has no personal layout or financial grant.
  await page.evaluate(
    ({ home, layout }) => {
      localStorage.clear();
      localStorage.setItem("homehub-device-token", "fixture-device-token");
      localStorage.setItem(
        `homehub-dashboard-device:v3:${home}:m_nico`,
        JSON.stringify({ layout, revision: 1 }),
      );
    },
    { home: HOME_ID, layout: backend.dashboardPreference!["layout"] },
  );
  await page.reload();
  await openTabletPin(page);
  await enterPin(page, "5678");
  await openDay();
  await expect(day).toContainText("Reunión de clase");
  await expect(day.locator('[data-calendar-kind="bill"]')).toHaveCount(0);
  await expect(day).not.toContainText("Internet familiar");
  await day.getByRole("button", { name: "Añadir al calendario", exact: true }).click();
  const event = page.getByRole("dialog", { name: "Nuevo evento", exact: true });
  await expect(event.getByRole("button", { name: "Factura", exact: true })).toHaveCount(0);
  await expect(event.getByLabel("Fecha", { exact: true })).toHaveValue(targetDate);
  await event.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.dashboardDeviceReads).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
