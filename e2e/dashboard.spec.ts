import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, enterPin, section, signIn } from "./backend";

test("widgets can be hidden, resized, reordered and retained after reload", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Personalizar inicio", exact: true });
  await editor.screenshot({ path: testInfo.outputPath("widget-customizer.png") });
  await editor.getByRole("button", { name: "Ocultar la familia hoy", exact: true }).click();
  await editor.getByRole("button", { name: "Ocultar fondo común", exact: true }).click();
  await editor.getByRole("button", { name: "Ampliar tareas de hoy", exact: true }).click();
  for (let index = 0; index < 3; index++)
    await editor.getByRole("button", { name: "Subir notas", exact: true }).click();
  await editor.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const ids = () =>
    page
      .locator("[data-widget]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-widget")));
  expect(await ids()).toEqual(["notes", "tasks", "shopping", "calendar"]);
  await expect(page.locator('[data-widget="tasks"]')).toHaveAttribute("data-size", "wide");
  await page.reload();
  await expect(page.getByRole("button", { name: "Personalizar", exact: true })).toBeEnabled();
  expect(await ids()).toEqual(["notes", "tasks", "shopping", "calendar"]);
  await page.getByRole("button", { name: "Escribir nota", exact: true }).click();
  const note = page.getByRole("dialog", { name: "Nueva nota", exact: true });
  await note.getByLabel("Título", { exact: true }).fill("Recordatorio familiar");
  await note.getByLabel("Contenido", { exact: true }).fill("Llevar las llaves de repuesto");
  await note.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(note).toHaveCount(0);
  await section(page, "Inicio");
  await expect(
    page.locator('[data-widget="notes"]').getByText("Recordatorio familiar", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(backend.unexpectedRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("custom-dashboard.png"), fullPage: true });
});

test("a lost dashboard response retries once and stale editors cannot overwrite another device", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.loseNextDashboardResponse = true;
  await backend.install(page);
  await signIn(page);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Personalizar inicio", exact: true });
  await editor.getByRole("button", { name: "Ocultar próximos eventos", exact: true }).click();
  await editor.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Comprueba la conexión");
  expect(backend.dashboardPreference?.["revision"]).toBe(1);
  await editor.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(backend.dashboardPreference?.["revision"]).toBe(1);
  expect(backend.dashboardSaveRequests).toBe(2);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  backend.dashboardPreference = {
    ...backend.dashboardPreference,
    revision: 2,
    layout: { version: 1, widgets: [{ id: "notes", size: "wide" }] },
  };
  await editor.getByRole("button", { name: "Ocultar lista de compras", exact: true }).click();
  await editor.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("otra ventana o dispositivo");
  expect(backend.dashboardPreference["revision"]).toBe(2);
  await editor.getByRole("button", { name: "Cargar versión actual", exact: true }).click();
  await expect(
    editor.getByRole("list", { name: "Orden de widgets" }).getByRole("listitem"),
  ).toHaveCount(1);
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator("[data-widget]")).toHaveCount(1);
  await expect(page.locator('[data-widget="notes"]')).toHaveAttribute("data-size", "wide");
  expect(backend.unexpectedRequests).toEqual([]);
});

test("shared tablet layouts stay separate for each PIN member without personal account access", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("homehub-device-token", "fixture-device-token"),
  );
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto("/");
  const unlock = async (pin: string) => {
    await page.getByRole("button", { name: "Entrar con PIN", exact: true }).click();
    await enterPin(page, pin);
    await expect(page.getByRole("button", { name: "Personalizar", exact: true })).toBeEnabled();
  };
  await unlock("5678");
  await expect(page.locator('[data-widget="finance"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Personalizar inicio", exact: true });
  await expect(editor.getByRole("button", { name: "Añadir fondo común", exact: true })).toHaveCount(
    0,
  );
  await editor.getByRole("button", { name: "Ocultar lista de compras", exact: true }).click();
  await editor.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('[data-widget="shopping"]')).toHaveCount(0);
  const key = `homehub-dashboard-device:v1:${HOME_ID}:m_nico`;
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).not.toBeNull();
  await page.getByRole("button", { name: "Bloquear tablet", exact: true }).click();
  await unlock("1234");
  await expect(page.locator('[data-widget="shopping"]')).toBeVisible();
  await expect(page.locator('[data-widget="finance"]')).toBeVisible();
  expect(backend.financeActive).toBe(true);
  await page.getByRole("button", { name: "Bloquear tablet", exact: true }).click();
  await unlock("5678");
  await expect(page.locator('[data-widget="shopping"]')).toHaveCount(0);
  await expect(page.locator('[data-widget="finance"]')).toHaveCount(0);
  expect(backend.dashboardDeviceReads).toBe(0);
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("widget actions update real records and open the selected note or future event", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  const now = new Date();
  const date = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const future = new Date(now.getFullYear(), now.getMonth() + 2, 8, 12);
  backend.rows["chores"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Preparar la cena",
      due_date: date(now),
      when_label: "Hoy",
      member_key: "m_ana",
      done: false,
      revision: 1,
      position: 0,
    },
  ];
  backend.rows["shopping_items"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      name: "Tomates",
      done: false,
      revision: 1,
      position: 0,
    },
  ];
  backend.rows["notes"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Llaves",
      body: "En el cajón",
      pinned: true,
      member_key: "m_ana",
      revision: 1,
    },
  ];
  backend.rows["events"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Visita familiar",
      date: date(future),
      time: "10:00",
      note: "Llevar las fotos",
      member_key: "m_ana",
      revision: 1,
    },
  ];
  await backend.install(page);
  await signIn(page);
  await page
    .locator('[data-widget="tasks"]')
    .getByRole("button", { name: "Preparar la cena", exact: true })
    .click();
  await expect.poll(() => backend.rows["chores"]?.[0]?.["done"]).toBe(true);
  await page
    .locator('[data-widget="shopping"]')
    .getByRole("button", { name: "Marcar Tomates como comprado", exact: true })
    .click();
  await expect.poll(() => backend.rows["shopping_items"]?.[0]?.["done"]).toBe(true);
  await page.locator('[data-widget="notes"]').getByText("Llaves", { exact: true }).click();
  let editor = page.getByRole("dialog", { name: "Editar nota", exact: true });
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue("En el cajón");
  await editor.getByLabel("Contenido", { exact: true }).fill("En la entrada");
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await section(page, "Inicio");
  await page
    .locator('[data-widget="calendar"]')
    .getByText("Visita familiar", { exact: true })
    .click();
  editor = page.getByRole("dialog", { name: "Editar evento", exact: true });
  await expect(editor.getByLabel("Título", { exact: true })).toHaveValue("Visita familiar");
  await expect(editor.getByLabel("Fecha", { exact: true })).toHaveValue(date(future));
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: future.toLocaleDateString("es", { month: "long", year: "numeric" }),
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator('[data-widget="tasks"]')
      .getByRole("button", { name: "Preparar la cena", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .locator('[data-widget="shopping"]')
      .getByRole("button", { name: "Marcar Tomates como comprado", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-widget="notes"]').getByText("En la entrada", { exact: true }),
  ).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});
