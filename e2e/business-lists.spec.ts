import { expect, test } from "@playwright/test";
import { HouseholdBackend, signIn, adminSignIn, section, HOME_ID } from "./backend";

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
  await expect(page.getByRole("button", { name: "Pasaporte", exact: true })).toBeVisible();
  await expect(page.getByLabel("Producto", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Compras", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abrir lista Viajes", exact: true }).click();
  await page.getByRole("button", { name: "Pasaporte", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pasaporte", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await context.setOffline(false);
  await section(page, "Compras");
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

test("a reload during a pending local shopping write can be cancelled without losing the next typed product", async ({
  page,
  context,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await section(page, "Compras");
  await expect(page.getByRole("region", { name: "Lista Groceries", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        });
      });
  });
  await context.setOffline(true);
  // Hold a real competing IndexedDB transaction, as another tab may do. The
  // edit cannot commit until released; no timeout/sleep supplies the outcome.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("homehub-shopping-v1", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const connection = open.result;
          const transaction = connection.transaction("lists", "readwrite");
          const store = transaction.objectStore("lists");
          let held = true;
          (window as unknown as { releaseShoppingWrite: () => void }).releaseShoppingWrite = () => {
            held = false;
          };
          const keepAlive = () => {
            const request = store.get("test-write-barrier");
            request.onsuccess = () => {
              if (held) keepAlive();
            };
          };
          transaction.oncomplete = () => connection.close();
          keepAlive();
          resolve();
        };
      }),
  );
  await page.getByLabel("Producto", { exact: true }).fill("Pasaporte");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect(page.locator('form[aria-busy="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Pasaporte", exact: true })).toHaveCount(0);
  await page.getByLabel("Producto", { exact: true }).fill("Protector solar");
  const prompt = page.waitForEvent("dialog");
  const navigation = page.evaluate(() => window.location.reload()).catch(() => null);
  const dialog = await prompt;
  expect(dialog.type()).toBe("beforeunload");
  await dialog.dismiss();
  await navigation;
  await expect(page.getByLabel("Producto", { exact: true })).toHaveValue("Protector solar");
  await page.evaluate(() =>
    (window as unknown as { releaseShoppingWrite: () => void }).releaseShoppingWrite(),
  );
  await expect(page.getByRole("button", { name: "Pasaporte", exact: true })).toBeVisible();
  await expect(page.locator('form[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByLabel("Producto", { exact: true })).toHaveValue("Protector solar");
  expect(backend.rows["shopping_items"]).toHaveLength(0);
  await page.getByLabel("Producto", { exact: true }).fill("");
  await page.reload();
  await expect(page.getByRole("button", { name: "Pasaporte", exact: true })).toBeVisible();
  await context.setOffline(false);
  await section(page, "Compras");
  await expect.poll(() => backend.rows["shopping_items"]?.length).toBe(1);
  expect(backend.rows["shopping_items"]![0]!["name"]).toBe("Pasaporte");
  expect(backend.unexpectedRequests).toEqual([]);
});

test("the business console edits both subscription prices and records external payments", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  backend.platformAdmin = true;
  await backend.install(page);
  await adminSignIn(page);
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

test("signing out of the business console preserves independent offline household access", async ({
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
  const admin = await context.newPage();
  await backend.install(admin);
  await admin.goto("http://127.0.0.1:8080");
  await adminSignIn(admin);
  await admin.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(admin.getByLabel("Correo", { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Compra privada", exact: true })).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});
