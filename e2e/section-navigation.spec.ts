import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, section, signIn } from "./backend";

test("section navigation survives refresh, Back and Forward", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await section(page, "Notas");
  await expect(page).toHaveURL(/section=notes/);
  await expect(page.getByRole("textbox", { name: "Buscar notas", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Buscar notas", exact: true })).toBeVisible();
  await section(page, "Tareas");
  await expect(page).toHaveURL(/section=chores/);
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "Buscar notas", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("button", { name: "Nueva tarea", exact: true })).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a private note reference reopens its authorized editor after refresh", async ({ page }) => {
  const backend = new HouseholdBackend();
  const id = crypto.randomUUID();
  backend.rows["notes"] = [
    {
      id,
      household_id: HOME_ID,
      title: "Llaves",
      body: "Junto a la puerta",
      member_key: "m_ana",
      pinned: false,
      revision: 1,
    },
  ];
  await backend.install(page);
  await signIn(page);
  await page.goto(`/?section=notes&record=${id}`);
  const editor = page.getByRole("dialog", { name: "Editar nota", exact: true });
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue("Junto a la puerta");
  await page.reload();
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue("Junto a la puerta");
  expect(page.url()).not.toContain("Llaves");
  expect(page.url()).not.toContain("puerta");
  expect(backend.writeRequests).toBe(0);
});

test("a direct protected section never grants a household member financial or management access", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.members[0]!.role = "member";
  await backend.install(page);
  await signIn(page);
  for (const section of ["finance", "household", "photos"]) {
    await page.goto(`/?section=${section}`);
    await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("section")).toBeNull();
  }
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.memberChanges).toEqual([]);
});

test("the empty dashboard opens the real first-task and first-event forms", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await page
    .locator('[data-widget="tasks"]')
    .getByRole("button", { name: "Añadir tarea", exact: true })
    .click();
  await expect(page.getByLabel("Título de la tarea", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await section(page, "Inicio");
  await page
    .locator('[data-widget="calendar"]')
    .getByRole("button", { name: "Añadir evento", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Nuevo evento", exact: true })).toBeVisible();
  expect(backend.writeRequests).toBe(0);
});
