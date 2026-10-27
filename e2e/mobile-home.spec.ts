import { expect, test } from "@playwright/test";
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

test("phone defaults are readable, saved widgets reflow without changing the tablet layout", async ({
  page,
}, info) => {
  const backend = new HouseholdBackend();
  await page.setViewportSize({ width: 390, height: 844 });
  await backend.install(page);
  await signIn(page);
  const ids = () =>
    page
      .locator("[data-widget]")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-widget")));
  await expect
    .poll(ids)
    .toEqual(["tasks", "shopping-summary", "shopping", "calendar", "notes", "month-calendar"]);
  expect(backend.dashboardPreference).toBeNull();
  const grid = page.locator(".dashboard-grid");
  expect(
    (await grid.evaluate((n) => getComputedStyle(n).gridTemplateColumns)).split(" "),
  ).toHaveLength(2);
  await page.screenshot({ path: info.outputPath("phone-default.png"), fullPage: true });
  seed(backend);
  await page.reload();
  await expect(page.locator('[data-widget="shopping"]')).toContainText("School");
  await expect
    .poll(ids)
    .toEqual(["progress", "member-summary", "shopping", "month-calendar", "calendar", "finance"]);
  const month = await page.locator('[data-widget="month-calendar"]').boundingBox();
  const shopping = await page.locator('[data-widget="shopping"]').boundingBox();
  expect(month!.width).toBeGreaterThan(330);
  expect(shopping!.width).toBeGreaterThan(330);
  expect((await page.locator('[data-widget="calendar"]').boundingBox())!.height).toBeLessThan(330);
  const calendar = page.locator('[data-widget="month-calendar"]');
  await calendar.scrollIntoViewIfNeeded();
  const body = await calendar.boundingBox(),
    last = await calendar.locator(".dw-day").last().boundingBox();
  expect(last!.y + last!.height).toBeLessThan(body!.y + body!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const headings = await page.locator("[data-widget] .dw-header-link").evaluateAll((nodes) =>
    nodes.map((node) => ({
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
    })),
  );
  expect(headings.every((box) => box.width > 75 && box.height < 60)).toBe(true);
  const ring = await page
    .locator('[data-widget="progress"] .dw-ring')
    .evaluate((node) => ({
      top: node.getBoundingClientRect().top,
      bottom: node.getBoundingClientRect().bottom,
      bodyTop: node.closest(".dw-body")!.getBoundingClientRect().top,
      bodyBottom: node.closest(".dw-body")!.getBoundingClientRect().bottom,
    }));
  expect(ring.top).toBeGreaterThanOrEqual(ring.bodyTop - 1);
  expect(ring.bottom).toBeLessThanOrEqual(ring.bodyBottom + 1);
  const funding = await page
    .locator('[data-widget="member-summary"]')
    .getByRole("progressbar")
    .evaluate((node) => ({
      bottom: node.getBoundingClientRect().bottom,
      card: node.closest(".widget-card")!.getBoundingClientRect().bottom,
      height: node.getBoundingClientRect().height,
    }));
  expect(funding.height).toBeGreaterThanOrEqual(5);
  expect(funding.bottom).toBeLessThanOrEqual(funding.card);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("phone-top.png") });
  await page.screenshot({ path: info.outputPath("phone-saved-widgets.png"), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    (await grid.evaluate((n) => getComputedStyle(n).gridTemplateColumns)).split(" "),
  ).toHaveLength(3);
  await expect(page.locator('[data-widget="shopping"]')).toHaveAttribute("data-size", "portrait");
  expect(backend.dashboardSaveRequests).toBe(0);
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
