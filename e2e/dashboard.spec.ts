import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, enterPin, section, signIn } from "./backend";

function seedLegacyHome(backend: HouseholdBackend) {
  backend.dashboardPreference = {
    user_id: "20000000-0000-4000-8000-000000000001",
    revision: 1,
    layout: {
      version: 1,
      widgets: [
        { id: "tasks", size: "compact" },
        { id: "shopping", size: "compact" },
        { id: "calendar", size: "compact" },
        { id: "notes", size: "wide" },
        { id: "family", size: "wide" },
        { id: "finance", size: "compact" },
      ],
    },
  };
}

test("widgets can be hidden, resized, reordered and retained after reload", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  seedLegacyHome(backend);
  await backend.install(page);
  await signIn(page);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const editor = page.getByRole("region", { name: "Personalizar inicio", exact: true });
  await editor.screenshot({ path: testInfo.outputPath("widget-customizer.png") });
  await page.getByRole("button", { name: "Ocultar la familia hoy", exact: true }).click();
  await page.getByRole("button", { name: "Ocultar fondo común", exact: true }).click();
  await page.getByRole("button", { name: "Cambiar tamaño de tareas de hoy", exact: true }).click();
  for (let index = 0; index < 3; index++)
    await page.getByRole("button", { name: "Mover notas", exact: true }).press("ArrowUp");
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
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
  await section(page, "Notas");
  await page.getByRole("button", { name: "Nueva nota", exact: true }).click();
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
  const editor = page.getByRole("region", { name: "Personalizar inicio", exact: true });
  await page.getByRole("button", { name: "Ocultar próximos eventos", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Comprueba la conexión");
  expect(backend.dashboardPreference?.["revision"]).toBe(1);
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(backend.dashboardPreference?.["revision"]).toBe(1);
  expect(backend.dashboardSaveRequests).toBe(2);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  backend.dashboardPreference = {
    ...backend.dashboardPreference,
    revision: 2,
    layout: { version: 1, widgets: [{ id: "notes", size: "wide" }] },
  };
  await page.getByRole("button", { name: "Ocultar lista de compras", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("otra ventana o dispositivo");
  expect(backend.dashboardPreference["revision"]).toBe(2);
  await page.getByRole("button", { name: "Cargar versión actual", exact: true }).click();
  await expect(page.locator("[data-widget]")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
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
  const editor = page.getByRole("region", { name: "Personalizar inicio", exact: true });
  await expect(page.getByRole("button", { name: "Añadir fondo común", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Ocultar lista de compras", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('[data-widget="shopping"]')).toHaveCount(0);
  const key = `homehub-dashboard-device:v3:${HOME_ID}:m_nico`;
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

test("informational widgets leave household records unchanged", async ({ page }) => {
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
    .getByText("Preparar la cena", { exact: false })
    .click();
  await page.locator('[data-widget="shopping"]').getByText("Tomates", { exact: true }).click();
  await page.locator('[data-widget="notes"]').getByText("Llaves", { exact: true }).click();
  await page
    .locator('[data-widget="calendar"]')
    .getByText("Visita familiar", { exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(backend.rows["chores"]?.[0]?.["done"]).toBe(false);
  expect(backend.rows["shopping_items"]?.[0]?.["done"]).toBe(false);
  await page.reload();
  await expect(page.locator('[data-widget="shopping"]')).toContainText("Tomates");
  await expect(page.locator('[data-widget="notes"]')).toContainText("En el cajón");
  expect(backend.unexpectedRequests).toEqual([]);
});

test("only the grip moves a widget and the corner resizes it", async ({ page }, testInfo) => {
  const backend = new HouseholdBackend();
  seedLegacyHome(backend);
  await backend.install(page);
  await signIn(page);
  await expect(page.locator('[data-widget="tasks"]')).toBeVisible();
  const touch =
    testInfo.project.name === "mobile" ? await page.context().newCDPSession(page) : null;
  // Holding the body must not open editing or initiate a drag.
  const body = (await page.locator('[data-widget="tasks"]').boundingBox())!;
  const bodyPoint = { x: body.x + body.width / 2, y: body.y + 85 };
  if (touch)
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [bodyPoint] });
  else {
    await page.mouse.move(bodyPoint.x, bodyPoint.y);
    await page.mouse.down();
  }
  await page.waitForTimeout(600);
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".widget-lifted")).toHaveCount(0);
  if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  else await page.mouse.up();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const move = page.getByRole("button", { name: "Mover tareas de hoy", exact: true });
  await move.scrollIntoViewIfNeeded();
  const grip = (await move.boundingBox())!,
    start = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  if (touch)
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
  }
  await expect(page.locator('[data-widget="tasks"]')).toHaveClass(/widget-lifted/);
  const lifted = (await page.locator('[data-widget="tasks"] .widget-card').boundingBox())!;
  const slot = (await page.locator('[data-widget="tasks"]').boundingBox())!;
  // Lifting must keep the card under the grip, even inside a container query.
  expect(Math.abs(lifted.x - slot.x)).toBeLessThan(8);
  expect(Math.abs(lifted.y - slot.y)).toBeLessThan(8);
  const target = (await page.locator('[data-widget="shopping"]').boundingBox())!;
  const end = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [end] });
    await expect(page.locator("[data-widget]").first()).toHaveAttribute("data-widget", "shopping");
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(end.x, end.y, { steps: 12 });
    await expect(page.locator("[data-widget]").first()).toHaveAttribute("data-widget", "shopping");
    await page.mouse.up();
  }
  const resize = page.getByRole("button", { name: "Cambiar tamaño de tareas de hoy", exact: true });
  await resize.scrollIntoViewIfNeeded();
  const handle = (await resize.boundingBox())!;
  const point = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: point.x, y: point.y + 90 }],
    });
    await expect(page.locator('[data-widget="tasks"]')).toHaveAttribute("data-size", "tall");
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x, point.y + 90, { steps: 8 });
    await expect(page.locator('[data-widget="tasks"]')).toHaveAttribute("data-size", "tall");
    await page.mouse.up();
  }
  await page.getByRole("button", { name: "Widgets", exact: true }).click();
  const catalogue = page.getByRole("dialog", { name: "Añadir widgets", exact: true });
  await catalogue.getByRole("button", { name: "Añadir reloj y fecha", exact: true }).click();
  await catalogue.getByRole("button", { name: "Añadir progreso del hogar", exact: true }).click();
  await catalogue.getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator('[data-widget="tasks"]')).toHaveAttribute("data-size", "tall");
  await expect(page.locator('[data-widget="clock"]')).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("handle-move-dashboard.png"),
    fullPage: true,
  });
});
