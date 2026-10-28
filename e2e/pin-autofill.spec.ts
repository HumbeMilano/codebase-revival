import { expect, test, type Page } from "@playwright/test";
import { HouseholdBackend, section, signIn } from "./backend";

async function choosePin(page: Page, label: string, pin: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: label, exact: true });
  await expect(dialog.locator("input, textarea, [contenteditable='true']")).toHaveCount(0);
  const group = dialog.getByRole("group", { name: "PIN de 4 números", exact: true });
  await expect(group).toBeFocused();
  await group.pressSequentially(pin);
  await dialog.getByRole("button", { name: "Usar PIN", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test("household setup keeps its PIN out of the account password form and submits the chosen code", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.hasHousehold = false;
  await backend.install(page);
  await page.goto("/");
  await expect(page.getByLabel("Correo", { exact: true })).toHaveAttribute("name", "username");
  await expect(page.getByLabel("Correo", { exact: true })).toHaveAttribute(
    "autocomplete",
    "username",
  );
  await expect(page.getByLabel("Contraseña", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await page.getByLabel("Correo", { exact: true }).fill("ana@example.invalid");
  await page.getByLabel("Contraseña", { exact: true }).fill("real-account-password");
  const signedIn = page.waitForRequest(
    (request) => request.url().includes("/auth/v1/token") && request.method() === "POST",
  );
  await page.locator("form").getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await signedIn).postDataJSON()).toMatchObject({
    email: "ana@example.invalid",
    password: "real-account-password",
  });
  await expect(page.getByRole("heading", { name: "Tu hogar", exact: true })).toBeVisible();
  await expect(page.locator("input[type=password], input[autocomplete=new-password]")).toHaveCount(
    0,
  );
  await page.getByLabel("Nombre del hogar", { exact: true }).fill("Familia de prueba");
  await page.getByLabel("Tu nombre", { exact: true }).fill("Ana");
  await choosePin(page, "Tu PIN (4 números)", "2468");
  expect(backend.setupRequests).toHaveLength(0);
  await expect(page.locator("input[type=password], input[autocomplete=new-password]")).toHaveCount(
    0,
  );
  await page.locator("form").getByRole("button", { name: "Crear hogar", exact: true }).click();
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
  expect(backend.setupRequests).toEqual([
    {
      method: "create_household",
      args: { _name: "Familia de prueba", _member_name: "Ana", _pin: "2468" },
    },
  ]);
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("creating and changing member PINs uses only the keypad and preserves explicit member saves", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await section(page, "Hogar");
  await page.getByRole("button", { name: "Añadir persona", exact: true }).click();
  await page.getByLabel("Nombre de nueva persona", { exact: true }).fill("Luz");
  await choosePin(page, "PIN de 4 números", "2468");
  expect(backend.memberChanges).toHaveLength(0);
  await expect(page.locator("input[type=password], input[autocomplete=new-password]")).toHaveCount(
    0,
  );
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Nombre de nueva persona", { exact: true }) });
  await form.getByRole("button", { name: "Añadir", exact: true }).click();
  await page.getByRole("button", { name: "Editar a Luz", exact: true }).click();
  await choosePin(page, "PIN nuevo (opcional)", "1357");
  expect(backend.memberChanges).toHaveLength(1);
  const edit = page
    .locator("form")
    .filter({ has: page.getByLabel("Nombre de Luz", { exact: true }) });
  await edit.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect.poll(() => backend.memberChanges.length).toBe(2);
  const key = backend.members.find((member) => member.name === "Luz")!.key;
  expect(backend.memberChanges[0]).toEqual({
    method: "create_member",
    args: { _name: "Luz", _role: "member", _pin: "2468" },
  });
  expect(backend.memberChanges[1]).toEqual({
    method: "update_member",
    args: { _key: key, _name: "Luz", _role: "member", _pin: "1357" },
  });
  expect(backend.passwordUpdates).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
