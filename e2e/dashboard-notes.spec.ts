import { expect, test } from "@playwright/test";
import { HouseholdBackend, HOME_ID, section, signIn } from "./backend";

const first = "10000000-0000-4000-8000-000000000081";
const second = "10000000-0000-4000-8000-000000000082";
function seed(backend: HouseholdBackend) {
  backend.rows["notes"] = [
    {
      id: first,
      household_id: HOME_ID,
      title: "Llaves",
      body: "En la cocina",
      pinned: true,
      member_key: "m_ana",
      revision: 1,
    },
    {
      id: second,
      household_id: HOME_ID,
      title: "Escuela",
      body: "Llevar libros",
      pinned: false,
      member_key: "m_ana",
      revision: 1,
    },
  ];
  backend.dashboardPreference = {
    user_id: "20000000-0000-4000-8000-000000000001",
    revision: 1,
    layout: {
      version: 3,
      widgets: [
        { id: "quick-add", key: "create", size: "wide" },
        { id: "notes", key: "notes", size: "wide" },
        { id: "pinned-note", key: "pinned", size: "compact" },
        { id: "specific-note", key: "specific", noteId: second, size: "compact" },
      ],
    },
  };
}

test("dashboard notes open the selected editor, save across widgets and survive reload", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  await page
    .locator('[data-widget="notes"]')
    .getByRole("button", { name: "Abrir nota Llaves", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Editar nota", exact: true });
  await expect(editor.getByLabel("Título", { exact: true })).toHaveValue("Llaves");
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue("En la cocina");
  await editor.getByLabel("Contenido", { exact: true }).fill("En la entrada, junto a la puerta");
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await section(page, "Inicio");
  await expect(page.locator('[data-widget="notes"]')).toContainText(
    "En la entrada, junto a la puerta",
  );
  await expect(page.locator('[data-widget="pinned-note"]')).toContainText(
    "En la entrada, junto a la puerta",
  );
  await page
    .locator('[data-widget="pinned-note"]')
    .getByRole("button", { name: "Abrir nota Llaves", exact: true })
    .click();
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue(
    "En la entrada, junto a la puerta",
  );
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  await section(page, "Inicio");
  await page
    .locator('[data-widget="specific-note"]')
    .getByRole("button", { name: "Abrir nota Escuela", exact: true })
    .click();
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue("Llevar libros");
  await editor.getByLabel("Título", { exact: true }).fill("Escuela de Ana");
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-widget="specific-note"]')).toContainText("Escuela de Ana");
  await expect(page.locator('[data-widget="notes"]')).toContainText("Escuela de Ana");
  await page
    .locator('[data-widget="notes"]')
    .getByRole("button", { name: "Ver todas las notas", exact: true })
    .click();
  await expect(page.getByLabel("Buscar notas", { exact: true })).toBeVisible();
  expect(backend.rows["notes"]).toHaveLength(2);
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("notes-opened-from-dashboard.png") });
});

test("Create something opens a real note form and layout editing does not activate notes", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .locator('[data-widget="notes"] .dw-note-open')
    .first()
    .evaluate((node) => (node as HTMLButtonElement).click());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Personalizar inicio", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .locator('[data-widget="quick-add"]')
    .getByRole("button", { name: "Nota", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Nueva nota", exact: true });
  await expect(editor).toBeVisible();
  expect(backend.rows["notes"]).toHaveLength(2);
  await editor.getByLabel("Título", { exact: true }).fill("Cena familiar");
  await editor.getByLabel("Contenido", { exact: true }).fill("Sábado a las ocho");
  await editor.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await section(page, "Inicio");
  const note = page
    .locator('[data-widget="notes"]')
    .getByRole("button", { name: "Abrir nota Cena familiar", exact: true });
  await expect(note).toBeVisible();
  await note.focus();
  await page.keyboard.press("Enter");
  const existing = page.getByRole("dialog", { name: "Editar nota", exact: true });
  await expect(existing.getByLabel("Contenido", { exact: true })).toHaveValue("Sábado a las ocho");
  await existing.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(backend.rows["notes"]).toHaveLength(3);
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
