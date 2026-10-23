import { expect, test } from "@playwright/test";
import { HouseholdBackend, signIn, section, HOME_ID } from "./backend";

test("independent lists persist and remain editable after an offline reload", async ({
  page,
  context,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await section(page, "Compras");
  await page.getByLabel("Producto", { exact: true }).fill("Botella");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await page.getByRole("button", { name: "Nueva lista", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nueva lista", exact: true });
  await dialog.getByLabel("Nombre de la lista").fill("School");
  await dialog.getByRole("button", { name: "Guardar lista", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toBeVisible();
  await page.getByLabel("Producto", { exact: true }).fill("Botella");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect.poll(() => backend.rows["shopping_items"]?.length).toBe(2);
  const school = backend.rows["shopping_lists"]!.find((row) => row["name"] === "School")!;
  expect(school["id"]).not.toBe(HOME_ID);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Nueva lista", exact: true }).click();
  await dialog.getByLabel("Nombre de la lista").fill("Viajes");
  await dialog.getByRole("button", { name: "Guardar lista", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Producto", { exact: true }).fill("Pasaporte");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Compras sin conexión", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir lista Viajes", exact: true }).click();
  await page.getByRole("button", { name: "Pasaporte", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pasaporte", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await context.setOffline(false);
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
  await expect
    .poll(
      () => backend.rows["shopping_items"]?.find((row) => row["name"] === "Pasaporte")?.["done"],
    )
    .toBe(true);
  expect(backend.rows["shopping_lists"]).toHaveLength(3);
  expect(backend.rows["shopping_items"]).toHaveLength(3);
  await section(page, "Compras");
  await page.getByRole("button", { name: "Abrir lista School", exact: true }).click();
  await page.getByRole("button", { name: "Archivar lista", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abrir lista School", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /Archivadas/ }).click();
  await page.getByRole("button", { name: "Restaurar School", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Lista School", exact: true })
      .getByRole("button", { name: "Botella", exact: true }),
  ).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("the business console edits both subscription prices and records external payments", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  backend.platformAdmin = true;
  await backend.install(page);
  await signIn(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "planes", exact: true }).click();
  const pro = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Family Pro", exact: true }) });
  await pro.getByRole("button", { name: "Configurar plan", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Configurar plan", exact: true });
  await form.getByLabel("Precio mensual", { exact: true }).fill("3.49");
  await form.getByLabel("Precio anual", { exact: true }).fill("6.99");
  await form.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(backend.businessPlans.find((row) => row["id"] === "pro")?.["amount_cents"]).toBe(349);
  expect(backend.businessPlans.find((row) => row["id"] === "pro")?.["annual_amount_cents"]).toBe(
    699,
  );
  await page.getByRole("button", { name: "pagos", exact: true }).click();
  await page.getByRole("button", { name: "Anotar pago", exact: true }).click();
  const payment = page.getByRole("dialog", { name: "Anotar pago externo", exact: true });
  await payment.getByLabel("Importe", { exact: true }).fill("2.99");
  await payment.getByLabel("Referencia", { exact: true }).fill("EXTERNAL-TEST");
  await payment.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(payment).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar recibido", exact: true }).click();
  const received = page.getByRole("dialog", { name: "Registrar cobro recibido", exact: true });
  await received.getByRole("checkbox").check();
  await received.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(received).toHaveCount(0);
  expect(backend.businessPayments[0]?.["status"]).toBe("received");
  expect(backend.rows["contributions"]).toHaveLength(0);
  expect(backend.unexpectedRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("business-console.png"), fullPage: true });
});

test("signing out of the business console closes offline household access", async ({
  page,
  context,
}) => {
  const backend = new HouseholdBackend();
  backend.platformAdmin = true;
  await backend.install(page);
  await signIn(page);
  await section(page, "Compras");
  await page.getByLabel("Producto", { exact: true }).fill("Compra privada");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect.poll(() => backend.rows["shopping_items"]?.length).toBe(1);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.goto("/");
  await expect(
    page.getByText(
      "Abre las compras con conexión al menos una vez en este dispositivo antes de utilizarlas sin internet.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Compra privada", exact: true })).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
