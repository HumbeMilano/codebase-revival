import { expect, test, type Page } from "@playwright/test";
import { HouseholdBackend, recoveryPath } from "./backend";

const generated = "Generated_test_password_92!";

// Password providers can update native controls without React's change event.
// These values belong only to the synthetic backend, never a real account.
async function nativeFill(page: Page, fields: Record<string, string>) {
  await page.evaluate((fields) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    for (const [name, value] of Object.entries(fields)) {
      const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      setter.call(input, value);
    }
  }, fields);
}

test("generated recovery passwords survive a form rerender and submit the filled value", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto(recoveryPath());
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
  await nativeFill(page, { "new-password": generated, "confirm-password": generated });
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveValue(generated);
  await page.getByRole("button", { name: "Mostrar contraseñas", exact: true }).click();
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveValue(generated);
  await expect(page.getByLabel("Repetir contraseña", { exact: true })).toHaveValue(generated);
  const sent = page.waitForRequest(
    (request) => request.url().includes("/auth/v1/user") && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({ password: generated });
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada", exact: true }),
  ).toBeVisible();
  expect(backend.passwordUpdates).toBe(1);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("household login submits password-manager values without typing events", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto("/");
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await nativeFill(page, { username: "ana@example.invalid", password: generated });
  const sent = page.waitForRequest(
    (request) => request.url().includes("/auth/v1/token") && request.method() === "POST",
  );
  await page.locator("form").getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    email: "ana@example.invalid",
    password: generated,
  });
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a rejected generated password remains available and accepts a provider-filled retry", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.failNextPasswordUpdate = true;
  await backend.install(page);
  await page.goto(recoveryPath());
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
  await nativeFill(page, { "new-password": generated, "confirm-password": generated });
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("diferente a la anterior");
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveValue(generated);
  const replacement = generated + "_retry";
  await nativeFill(page, { "new-password": replacement, "confirm-password": replacement });
  const sent = page.waitForRequest(
    (request) => request.url().includes("/auth/v1/user") && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({ password: replacement });
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada", exact: true }),
  ).toBeVisible();
  expect(backend.passwordUpdates).toBe(2);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("signup accepts a generated password and identifies the filled recipient correctly", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.route("**/auth/v1/signup*", (route) =>
    route.fulfill({
      json: {
        user: { id: "20000000-0000-4000-8000-000000000002", email: "new-account@example.invalid" },
        session: null,
      },
    }),
  );
  await page.goto("/?registro=1");
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await nativeFill(page, { username: "new-account@example.invalid", password: generated });
  const sent = page.waitForRequest(
    (request) => request.url().includes("/auth/v1/signup") && request.method() === "POST",
  );
  await page.locator("form").getByRole("button", { name: "Crear cuenta", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    email: "new-account@example.invalid",
    password: generated,
  });
  await expect(page.getByRole("heading", { name: "Revisa tu correo", exact: true })).toBeVisible();
  await expect(page.getByText(/enviado a new-account@example.invalid/)).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("administrative login accepts native autofill", async ({ page }) => {
  const backend = new HouseholdBackend();
  backend.platformAdmin = true;
  await backend.install(page);
  await page.goto("/admin");
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await nativeFill(page, { username: "ana@example.invalid", password: generated });
  const sent = page.waitForRequest(
    (request) => request.url().includes("/auth/v1/token") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    email: "ana@example.invalid",
    password: generated,
  });
  await expect(page.getByText("Skendal · Consola del negocio", { exact: true })).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("tablet approval login accepts native autofill", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.route("**/rest/v1/rpc/tablet_pairing_preview", (route) =>
    route.fulfill({
      json: {
        name: "Tablet de prueba",
        household_name: "Hogar de prueba",
        expires_at: new Date(Date.now() + 300000).toISOString(),
        status: "pending",
      },
    }),
  );
  await page.goto("/vincular#10000000-0000-4000-8000-000000000001." + "a".repeat(64));
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await nativeFill(page, { username: "ana@example.invalid", password: generated });
  const sent = page.waitForRequest(
    (request) => request.url().includes("/auth/v1/token") && request.method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar para continuar", exact: true }).click();
  expect((await sent).postDataJSON()).toMatchObject({
    email: "ana@example.invalid",
    password: generated,
  });
  await expect(
    page.getByRole("heading", { name: "¿Vincular esta tablet a Hogar de prueba?", exact: true }),
  ).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("the recovery request uses an email filled without input events", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto("/reset-password");
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  await nativeFill(page, { email: "ana@example.invalid" });
  await page.getByRole("button", { name: "Enviar enlace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo", exact: true })).toBeVisible();
  expect(backend.recoveryRequests[0]?.email).toBe("ana@example.invalid");
  expect(backend.unexpectedRequests).toEqual([]);
});

test("canceling recovery clears provider-filled passwords before opening another link", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto(recoveryPath());
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
  await nativeFill(page, { "new-password": generated, "confirm-password": generated });
  await page.getByRole("button", { name: "Solicitar otro enlace", exact: true }).click();
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  await page.goto(recoveryPath());
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Repetir contraseña", { exact: true })).toHaveValue("");
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
