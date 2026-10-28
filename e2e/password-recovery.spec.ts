import { expect, test } from "@playwright/test";
import { HouseholdBackend, recoveryPath, signIn } from "./backend";

test("forgot password opens a dedicated flow and sends the correct return address", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Olvidé mi contraseña", exact: true }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.invalid");
  await page.getByRole("button", { name: "Enviar enlace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo", exact: true })).toBeVisible();
  expect(backend.recoveryRequests).toEqual([
    { email: "ana@example.invalid", redirect: `${new URL(page.url()).origin}/reset-password` },
  ]);
  await expect(page.getByRole("button", { name: /Reenviar en/ })).toBeDisabled();
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a recovery link survives reload, validates confirmation, saves and returns to the household", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto(recoveryPath());
  await expect(page.getByRole("heading", { name: "Nueva contraseña", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Nueva contraseña", exact: true })).toBeVisible();
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("a-new-test-password");
  await page.getByLabel("Repetir contraseña", { exact: true }).fill("different-test-password");
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Las contraseñas no coinciden.");
  expect(backend.passwordUpdates).toBe(0);
  await page.getByRole("button", { name: "Mostrar contraseñas", exact: true }).click();
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByLabel("Repetir contraseña", { exact: true }).fill("a-new-test-password");
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada", exact: true }),
  ).toBeVisible();
  expect(backend.passwordUpdates).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("skendal-password-recovery"))).toBeNull();
  await page.getByRole("link", { name: "Continuar a Skendal", exact: true }).click();
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("an expired email link offers a new request and never uses an unrelated existing login", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await page.goto(
    "/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  );
  await expect(page.getByRole("alert")).toContainText("Solicita uno nuevo aquí");
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("server password validation leaves the form usable for a corrected retry", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.failNextPasswordUpdate = true;
  await backend.install(page);
  await page.goto(recoveryPath());
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("old-test-password");
  await page.getByLabel("Repetir contraseña", { exact: true }).fill("old-test-password");
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("diferente a la anterior");
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("different-test-password");
  await page.getByLabel("Repetir contraseña", { exact: true }).fill("different-test-password");
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Contraseña actualizada", exact: true }),
  ).toBeVisible();
  expect(backend.passwordUpdates).toBe(2);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a legacy recovery redirect to the home page opens the password form", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto(recoveryPath("/"));
  await expect(page.getByRole("heading", { name: "Nueva contraseña", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("an invalid recovery token cannot reuse a valid existing login as recovery proof", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await page.route("**/auth/v1/user", (route) => {
    if (route.request().headers()["authorization"] === "Bearer invalid_recovery_token")
      return route.fulfill({ status: 401, json: { code: "bad_jwt", message: "Invalid JWT" } });
    return route.fallback();
  });
  await page.goto(
    "/reset-password#type=recovery&access_token=invalid_recovery_token&refresh_token=invalid_refresh&expires_in=3600&token_type=bearer",
  );
  await expect(page.getByRole("alert")).toContainText("Solicita uno nuevo aquí");
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toHaveCount(0);
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a failed recovery email request leaves a working retry", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  let failed = false;
  await page.route("**/auth/v1/recover*", (route) => {
    if (!failed) {
      failed = true;
      return route.fulfill({
        status: 429,
        json: { code: "over_email_send_rate_limit", message: "Email rate limit exceeded" },
      });
    }
    return route.fallback();
  });
  await page.goto("/reset-password");
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.invalid");
  await page.getByRole("button", { name: "Enviar enlace", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Espera un minuto");
  await expect(page.getByRole("button", { name: "Enviar enlace", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Enviar enlace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo", exact: true })).toBeVisible();
  expect(backend.recoveryRequests).toHaveLength(1);
  expect(backend.unexpectedRequests).toEqual([]);
});
