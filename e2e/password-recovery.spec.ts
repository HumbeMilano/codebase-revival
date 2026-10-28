import { expect, test } from "@playwright/test";
import { HouseholdBackend, recoveryPath, section, signIn } from "./backend";

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
  await expect(page.getByLabel("Correo de la cuenta", { exact: true })).toHaveValue(
    "ana@example.invalid",
  );
  await expect(page.getByLabel("Correo de la cuenta", { exact: true })).toHaveAttribute(
    "autocomplete",
    "username",
  );
  await expect(page.getByLabel("Correo de la cuenta", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
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

test("a recovery link opened over an existing home tab still requires the new password", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await page.goto(recoveryPath("/"));
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("heading", { name: "Nueva contraseña", exact: true })).toBeVisible();
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.setupRequests).toEqual([]);
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

test("a fresh link opened in the existing recovery tab reaches the password form", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto("/reset-password");
  await expect(page.getByLabel("Correo", { exact: true })).toBeVisible();
  await page.goto(recoveryPath());
  await expect(page.getByRole("heading", { name: "Nueva contraseña", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Nueva contraseña", exact: true })).toBeVisible();
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

test("an unfinished recovery cannot open household setup by returning to the root", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.hasHousehold = false;
  await backend.install(page);
  await page.goto(recoveryPath());
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Nombre del hogar", { exact: true })).toHaveCount(0);
  expect(backend.setupRequests).toEqual([]);
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("recovery without a household explains the missing link and requires explicit creation", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.hasHousehold = false;
  await backend.install(page);
  await page.goto(recoveryPath("/"));
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("a-new-test-password");
  await page.getByLabel("Repetir contraseña", { exact: true }).fill("a-new-test-password");
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await page.getByRole("link", { name: "Continuar a Skendal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acceso a tu cuenta", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("ana@example.invalid", { exact: true })).toBeVisible();
  await expect(page.getByText(/Esta cuenta no tiene un hogar vinculado/)).toBeVisible();
  await expect(page.getByLabel("Nombre del hogar", { exact: true })).toHaveCount(0);
  expect(backend.setupRequests).toEqual([]);
  expect(backend.leaveRequests).toBe(0);
  expect(backend.passwordUpdates).toBe(1);
  await page.getByRole("button", { name: "Tengo una invitación", exact: true }).click();
  await expect(page.getByLabel("Código de invitación", { exact: true })).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a recovered platform administrator returns to administration without household setup", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.hasHousehold = false;
  backend.platformAdmin = true;
  await backend.install(page);
  await page.goto(recoveryPath());
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("a-new-test-password");
  await page.getByLabel("Repetir contraseña", { exact: true }).fill("a-new-test-password");
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await page.getByRole("link", { name: "Continuar a Skendal", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Administración", exact: true })).toBeVisible();
  await expect(page.getByLabel("Nombre del hogar", { exact: true })).toHaveCount(0);
  expect(backend.passwordUpdates).toBe(1);
  expect(backend.setupRequests).toEqual([]);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("canceling an unfinished recovery returns to login without unlinking the household", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto(recoveryPath());
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Volver al acceso", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  expect(backend.logoutRequests).toBe(1);
  expect(backend.leaveRequests).toBe(0);
  expect(backend.hasHousehold).toBe(true);
  expect(backend.passwordUpdates).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("skendal-password-recovery"))).toBeNull();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a recovery event in an open household routes to the password form instead of setup", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  backend.hasHousehold = false;
  await page.evaluate(async () => {
    const key = Object.keys(localStorage).find((key) => /^sb-.+-auth-token$/.test(key))!;
    const session = JSON.parse(localStorage.getItem(key)!);
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: "PASSWORD_RECOVERY", session });
    await new Promise((resolve) => setTimeout(resolve, 100));
    channel.close();
  });
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Nombre del hogar", { exact: true })).toHaveCount(0);
  expect(backend.setupRequests).toEqual([]);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("profile logout preserves membership while unlinking requires its own confirmation", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await section(page, "Mi perfil");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  expect(backend.logoutRequests).toBe(1);
  expect(backend.leaveRequests).toBe(0);
  expect(backend.hasHousehold).toBe(true);
  await signIn(page);
  await section(page, "Mi perfil");
  await page.getByRole("button", { name: "Desvincular mi cuenta", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText(/Para cerrar sesión y mantener tu acceso/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Desvincular mi cuenta", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(backend.leaveRequests).toBe(0);
  await page.getByRole("button", { name: "Desvincular mi cuenta", exact: true }).click();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Desvincular mi cuenta", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Acceso a tu cuenta", exact: true }),
  ).toBeVisible();
  expect(backend.leaveRequests).toBe(1);
  expect(backend.members.map((member) => member.key)).toEqual(["m_ana", "m_nico"]);
  expect(backend.unexpectedRequests).toEqual([]);
});
