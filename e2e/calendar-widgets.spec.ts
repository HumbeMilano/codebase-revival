import { expect, test } from "@playwright/test";
import { HouseholdBackend, openTabletPin, HOME_ID, signIn, section, enterPin } from "./backend";
const noteA = "10000000-0000-4000-8000-000000000021",
  noteB = "10000000-0000-4000-8000-000000000022",
  billId = "10000000-0000-4000-8000-000000000023";
function seed(backend: HouseholdBackend) {
  backend.rows["notes"] = [
    {
      id: noteA,
      household_id: HOME_ID,
      title: "Nota de escuela",
      body: "Llevar cuaderno",
      member_key: "m_ana",
      pinned: false,
      revision: 1,
    },
    {
      id: noteB,
      household_id: HOME_ID,
      title: "Nota de viaje",
      body: "Llevar pasaporte",
      member_key: "m_ana",
      pinned: false,
      revision: 1,
    },
  ];
  backend.rows["bills"] = [
    {
      id: billId,
      household_id: HOME_ID,
      name: "Internet privado",
      category: "Internet",
      base: 45,
      due_day: new Date().getDate(),
      auto_pay: false,
      position: 0,
      revision: 1,
    },
  ];
  backend.rows["bill_splits"] = [{ bill_id: billId, person_key: "m_ana", type: "equal", value: 0 }];
}
test("three small widgets and legacy selections upgrade without repeated types", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  backend.dashboardPreference = {
    user_id: "20000000-0000-4000-8000-000000000001",
    revision: 1,
    layout: {
      version: 2,
      widgets: [
        { id: "clock", key: "one", size: "small" },
        { id: "tasks", key: "two", size: "small" },
        { id: "shopping", key: "three", size: "small" },
        { id: "specific-note", key: "note-a", size: "column", noteId: noteA },
        { id: "specific-note", key: "note-b", size: "wide", noteId: noteB },
        { id: "member-summary", key: "member", size: "compact", memberId: "m_ana" },
      ],
    },
  };
  await backend.install(page);
  await signIn(page);
  await expect(page.locator('[data-widget-key="one"]')).toBeVisible();
  const rects = await page
    .locator('[data-widget-key="one"], [data-widget-key="two"], [data-widget-key="three"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        x: n.getBoundingClientRect().x,
        y: n.getBoundingClientRect().y,
        width: n.getBoundingClientRect().width,
      })),
    );
  expect(rects).toHaveLength(3);
  expect(Math.abs(rects[0]!.y - rects[2]!.y)).toBeLessThan(1);
  expect(rects[2]!.x).toBeGreaterThan(rects[1]!.x);
  await expect(page.locator('[data-widget-key="note-a"]')).toContainText("Llevar cuaderno");
  await expect(page.locator('[data-widget-key="note-b"]')).toHaveCount(0);
  await expect(page.locator('[data-widget-key="member"]')).toContainText("$45.00");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .locator('[data-widget-key="note-a"]')
    .getByRole("button", { name: "Configurar nota específica", exact: true })
    .click();
  const config = page.getByRole("dialog", { name: "Configurar widget", exact: true });
  await config.getByLabel("Nota del widget").selectOption(noteB);
  await config.getByRole("button", { name: "Tamaño 1 por 4", exact: true }).click();
  await config.getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("button", { name: "Widgets", exact: true }).click();
  const catalogue = page.getByRole("dialog", { name: "Añadir widgets", exact: true });
  await expect(
    catalogue.getByRole("button", { name: "Añadir reloj y fecha", exact: true }),
  ).toBeDisabled();
  await catalogue.getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator('[data-widget="clock"]')).toHaveCount(1);
  await expect(page.locator('[data-widget-key="note-a"]')).toContainText("Llevar pasaporte");
  await expect(page.locator('[data-widget-key="note-a"]')).toHaveAttribute("data-size", "column");
  expect(JSON.stringify(backend.dashboardPreference?.["layout"])).not.toContain("Llevar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(backend.unexpectedRequests).toEqual([]);
});
test("calendar keeps bill status in finances and reminders separate from timed events", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 1024, height: 768 });
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  await section(page, "Calendario");
  await page
    .locator('[data-calendar-kind="bill"]')
    .getByRole("button", { name: /Internet privado/ })
    .click();
  const bill = page.getByRole("dialog", { name: "Internet privado", exact: true });
  await bill.getByRole("button", { name: "Marcar pagada", exact: true }).click();
  await expect(bill.getByRole("button", { name: "Marcar pendiente", exact: true })).toBeVisible();
  expect(backend.rows["bill_overrides"]?.[0]?.["status"]).toBe("paid");
  await bill.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Añadir al calendario", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Recordatorio", exact: true }).click();
  const reminder = page.getByRole("dialog", { name: "Nuevo recordatorio", exact: true });
  await reminder.getByLabel("Título", { exact: true }).fill("Recoger cuaderno");
  await reminder.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("button", { name: "Completar Recoger cuaderno", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Completar Recoger cuaderno", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Añadir al calendario", exact: true }).click();
  const event = page.getByRole("dialog", { name: "Nuevo evento", exact: true });
  await event.getByLabel("Título", { exact: true }).fill("Reunión de escuela");
  await event.getByLabel("Todo el día", { exact: true }).uncheck();
  await event.getByLabel("Hora", { exact: true }).fill("14:00");
  await event.getByLabel("Fin (opcional)", { exact: true }).fill("15:00");
  await event.getByLabel("Nota", { exact: true }).fill("Entrada principal");
  expect(
    await event.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return box.x >= 0 && box.right <= innerWidth && box.y >= 0 && box.bottom <= innerHeight;
    }),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("calendar-form.png"), fullPage: true });
  await event.getByRole("button", { name: "Guardar", exact: true }).click();
  expect(backend.rows["events"]?.find((e) => e["title"] === "Reunión de escuela")).toMatchObject({
    kind: "event",
    time: "14:00",
    end_time: "15:00",
    completed: false,
  });
  expect(backend.rows["events"]?.find((e) => e["title"] === "Recoger cuaderno")).toMatchObject({
    kind: "reminder",
    completed: true,
  });
  await page.reload();
  await section(page, "Calendario");
  await expect(page.locator('[data-calendar-kind="bill"]')).toContainText("Pagada");
  await expect(
    page.getByRole("button", { name: "Completar Recoger cuaderno", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
test("a child calendar and widget catalogue expose no household financial details", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await page.addInitScript(() =>
    localStorage.setItem("homehub-device-token", "fixture-device-token"),
  );
  await backend.install(page);
  await page.goto("/");
  await openTabletPin(page);
  await enterPin(page, "5678");
  await expect(page.getByRole("button", { name: "Personalizar", exact: true })).toBeEnabled();
  await section(page, "Calendario");
  await expect(page.locator('[data-calendar-kind="bill"]')).toHaveCount(0);
  await expect(page.getByText("Internet privado", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Tipo de calendario").locator('option[value="bill"]')).toHaveCount(
    0,
  );
  expect(backend.financialReadsWithoutGrant).toBe(0);
});
