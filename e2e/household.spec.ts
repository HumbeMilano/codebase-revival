import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, openTabletPin, enterPin, section, signIn } from "./backend";

test("a real viewport can create household records and reload confirmed data", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await backend.install(page);
  await signIn(page);

  await section(page, "Tareas");
  await page.getByRole("button", { name: "Nueva tarea", exact: true }).click();
  await page.getByLabel("Título de la tarea", { exact: true }).fill("Preparar mochilas");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.rows["chores"]?.length).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await section(page, "Compras");
  await page.getByLabel("Producto", { exact: true }).fill("Pan integral");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect.poll(() => backend.rows["shopping_items"]?.length).toBe(1);
  await page.getByRole("button", { name: "Pan integral", exact: true }).click();
  await expect.poll(() => backend.rows["shopping_items"]?.[0]?.["done"]).toBe(true);

  await section(page, "Notas");
  await page.getByRole("button", { name: "Nueva nota", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Nueva nota", exact: true });
  await dialog.getByLabel("Título", { exact: true }).fill("Lista de la excursión");
  await dialog.getByLabel("Contenido", { exact: true }).fill("Agua y protector solar");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.rows["notes"]?.length).toBe(1);
  await expect(dialog).toHaveCount(0);

  await section(page, "Calendario");
  await page.getByRole("button", { name: "Añadir al calendario", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Nuevo evento", exact: true });
  await dialog.getByLabel("Título", { exact: true }).fill("Excursión familiar");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.rows["events"]?.length).toBe(1);
  await expect(dialog).toHaveCount(0);

  await section(page, "Finanzas");
  await page.getByRole("button", { name: "Nueva factura", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Nueva factura", exact: true });
  await dialog.getByLabel("Nombre", { exact: true }).fill("Internet familiar");
  await dialog.getByLabel("Monto mensual", { exact: true }).fill("60.30");
  await dialog.getByLabel("Día de vencimiento", { exact: true }).fill("15");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await dialog.getByRole("button", { name: "Guardar factura", exact: true }).click();
  await expect.poll(() => backend.rows["bills"]?.length).toBe(1);
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Aporte", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Nuevo aporte", exact: true });
  await dialog.getByLabel("Monto del aporte", { exact: true }).fill("50.25");
  await dialog.getByRole("button", { name: "Guardar aporte", exact: true }).click();
  await expect.poll(() => backend.rows["contributions"]?.length).toBe(1);
  expect(backend.rows["contributions"]?.[0]?.["person_key"]).toBe("m_ana");
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible({
    timeout: 30000,
  });
  await section(page, "Tareas");
  await expect(page.getByRole("button", { name: "Preparar mochilas", exact: true })).toBeVisible();
  await section(page, "Compras");
  await expect(page.getByRole("button", { name: "Pan integral", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await section(page, "Notas");
  await expect(page.getByText("Agua y protector solar", { exact: true })).toBeVisible();
  await section(page, "Calendario");
  await expect(
    page.getByRole("heading", { name: "Excursión familiar", exact: true }),
  ).toBeVisible();
  await section(page, "Finanzas");
  await expect(page.getByText("$50.25", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Internet familiar", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(browserErrors).toEqual([]);
  expect(backend.unexpectedRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("functional-finance.png"), fullPage: true });
});

test("an interrupted shopping sync keeps local changes and safely retries", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await section(page, "Compras");
  backend.failNextSave = true;
  await page.getByLabel("Producto", { exact: true }).fill("Producto fallido");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect.poll(() => backend.writeRequests).toBe(1);
  await expect(page.getByRole("button", { name: "Producto fallido", exact: true })).toBeVisible();
  expect(backend.rows["shopping_items"]).toHaveLength(0);
  await page.getByLabel("Producto", { exact: true }).fill("Producto confirmado");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect.poll(() => backend.rows["shopping_items"]?.length).toBe(2);
  await page.reload();
  await section(page, "Compras");
  await expect(
    page.getByRole("button", { name: "Producto confirmado", exact: true }),
  ).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("ordinary accounts cannot claim platform administration", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Sin acceso", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ser administrador" })).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("platform action failure remains visible", async ({ page }) => {
  const backend = new HouseholdBackend();
  backend.platformAdmin = true;
  backend.failAdminAction = true;
  await backend.install(page);
  await signIn(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Pasar a Pro", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("La acción no se pudo completar");
  expect(backend.unexpectedRequests).toEqual([]);
});

test("paired tablet requires an adult grant and revokes it when locked", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("homehub-device-token", "fixture-device-token"),
  );
  const backend = new HouseholdBackend();
  backend.rows["bills"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      name: "Cuenta privada",
      category: "Vivienda",
      base: 90,
      due_day: 15,
      auto_pay: false,
      position: 0,
      revision: 1,
    },
  ];
  await backend.install(page);
  await page.goto("/");
  await openTabletPin(page);
  await enterPin(page, "5678");
  await expect(page.getByRole("heading", { name: "Hola, Nico", exact: true })).toBeVisible();
  expect(backend.financialReadsWithoutGrant).toBe(0);
  await section(page, "Finanzas");
  await enterPin(page, "0000");
  await expect(page.getByRole("alert")).toContainText("PIN incorrecto");
  await enterPin(page, "1234");
  await expect(page.getByText("Cuenta privada", { exact: true })).toBeVisible();
  expect(backend.financeActive).toBe(true);
  expect(backend.financialReadsWithoutGrant).toBe(0);
  await page.getByRole("button", { name: "Bloquear tablet", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mostrar información", exact: true }),
  ).toBeVisible();
  expect(backend.financeActive).toBe(false);
  await openTabletPin(page);
  await enterPin(page, "5678");
  await expect(page.getByRole("heading", { name: "Hola, Nico", exact: true })).toBeVisible();
  await expect(page.getByText("Cuenta privada", { exact: true })).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("confirmed tasks can be edited and removed without returning after reload", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.rows["chores"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Tarea inicial",
      member_key: "m_ana",
      done: false,
      when_label: "Hoy",
      due_date: new Date().toISOString().slice(0, 10),
      position: 0,
      revision: 1,
    },
  ];
  await backend.install(page);
  await signIn(page);
  await section(page, "Tareas");
  await page.getByRole("button", { name: "Editar Tarea inicial", exact: true }).click();
  await page.getByLabel("Título de la tarea", { exact: true }).fill("Tarea actualizada");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(backend.rows["chores"]?.[0]?.["revision"]).toBe(2);
  await page.getByRole("button", { name: "Editar Tarea actualizada", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(backend.rows["chores"]).toHaveLength(0);
  await page.reload();
  await section(page, "Tareas");
  await expect(page.getByText("Tarea actualizada", { exact: true })).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
