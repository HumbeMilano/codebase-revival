import { expect, test, type Page } from "@playwright/test";
import { HouseholdBackend, pairTablet, section, signIn, USER_ID } from "./backend";

async function enterAccount(page: Page) {
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.invalid");
  await page.getByLabel("Contraseña", { exact: true }).fill("test-password");
  await page.locator("form").getByRole("button", { name: "Entrar", exact: true }).click();
}
async function choosePin(page: Page) {
  await page.getByRole("button", { name: "PIN de tablet", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "PIN de tablet", exact: true });
  await expect(dialog.locator("input, textarea, [contenteditable=true]")).toHaveCount(0);
  await dialog
    .getByRole("group", { name: "PIN de 4 números", exact: true })
    .pressSequentially("1357");
  await dialog.getByRole("button", { name: "Usar PIN", exact: true }).click();
}

test("a new phone account creates a real task without configuring a tablet PIN", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.hasHousehold = false;
  await backend.install(page);
  await page.goto("/");
  await enterAccount(page);
  await page.getByRole("button", { name: "Crear hogar", exact: true }).click();
  await page.getByLabel("Nombre del hogar", { exact: true }).fill("Nuestra casa");
  await page.getByLabel("Tu nombre", { exact: true }).fill("Ana");
  await expect(page.getByRole("button", { name: "Tu PIN (4 números)", exact: true })).toBeHidden();
  await page.locator("form").getByRole("button", { name: "Crear hogar", exact: true }).click();
  await page
    .locator('[data-widget="tasks"]')
    .getByRole("button", { name: "Añadir tarea", exact: true })
    .click();
  await page.getByLabel("Título de la tarea", { exact: true }).fill("Sacar reciclaje");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Sacar reciclaje", { exact: true }).first()).toBeVisible();
  expect(backend.setupRequests).toEqual([
    { method: "create_household", args: { _name: "Nuestra casa", _member_name: "Ana", _pin: "" } },
  ]);
  expect(backend.pinConfigured).toBe(false);
  expect(backend.rows["chores"]).toHaveLength(1);
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("an invited phone account keeps the code and joins without a mandatory PIN", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.hasHousehold = false;
  await backend.install(page);
  const code = "ABCDEF0123456789ABCDEF0123456789";
  await page.goto(`/?invite=${code}`);
  await page.getByRole("button", { name: "Entrar", exact: true }).first().click();
  await enterAccount(page);
  await expect(page.getByLabel("Código de invitación", { exact: true })).toHaveValue(code);
  await expect(page.getByLabel("Nombre del hogar", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Unirme", exact: true }).click();
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
  expect(backend.setupRequests).toEqual([
    { method: "redeem_invite", args: { _code: code, _pin: "" } },
  ]);
  expect(backend.pinConfigured).toBe(false);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("the first tablet requests button-only PIN setup before its passkey approval", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.pinConfigured = false;
  await backend.install(page);
  await pairTablet(page, backend, async (phone) => {
    await expect(phone.getByRole("button", { name: "Vincular tablet", exact: true })).toHaveCount(
      0,
    );
    await expect(
      phone.getByText("Elige tu PIN para entrar en esta tablet.", { exact: true }),
    ).toBeVisible();
    await choosePin(phone);
    await expect(
      phone.locator("input[type=password], input[autocomplete=new-password]"),
    ).toHaveCount(0);
    await phone.getByRole("button", { name: "Guardar PIN", exact: true }).click();
    await expect(phone.getByRole("button", { name: "Vincular tablet", exact: true })).toBeVisible();
  });
  expect(backend.pinSetRequests).toEqual([{ _pin: "1357", _account: USER_ID }]);
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a failed own PIN save can be retried without editing the account password or another member", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.pinConfigured = false;
  await backend.install(page);
  await signIn(page);
  await section(page, "Mi perfil");
  await page.getByRole("button", { name: "Crear mi PIN", exact: true }).click();
  await choosePin(page);
  let fail = true;
  await page.route("**/rest/v1/rpc/set_my_pin", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { message: "Upstream unavailable" } })
      : route.fallback(),
  );
  await page.getByRole("button", { name: "Guardar PIN", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No se pudo guardar el PIN" }),
  ).toBeVisible();
  expect(backend.pinConfigured).toBe(false);
  fail = false;
  await page.getByRole("button", { name: "Guardar PIN", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cambiar mi PIN", exact: true })).toBeVisible();
  expect(backend.pinSetRequests).toEqual([{ _pin: "1357", _account: USER_ID }]);
  expect(backend.memberChanges).toEqual([]);
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
