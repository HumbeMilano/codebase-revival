import { expect, test, type Page } from "@playwright/test";
import { HOME_ID, HouseholdBackend, section, signIn } from "./backend";
test.use({ actionTimeout: 15000 });

const recipeId = "10000000-0000-4000-8000-000000000091";
const content = {
  version: 1,
  name: "Picadillo familiar",
  description: "Una receta del hogar.",
  servings: 4,
  prep_minutes: 10,
  cook_minutes: 20,
  ingredients: [
    { name: "Carne", quantity: "1/2", unit: "kg" },
    { name: "Tomate", quantity: "2", unit: "unidades" },
  ],
  steps: ["Dora la carne.", "Añade el tomate y cocina durante 20 minutos."],
  nutrition: { calories_kcal: 450, protein_g: 30 },
  source: "Receta propia",
};
const seed = () => {
  const backend = new HouseholdBackend();
  backend.rows["recipes"] = [
    {
      id: recipeId,
      household_id: HOME_ID,
      content: structuredClone(content),
      archived: false,
      revision: 1,
      created_at: "2026-11-16T10:00:00Z",
      updated_at: "2026-11-16T10:00:00Z",
    },
  ];
  return backend;
};
async function openRecipe(page: Page) {
  await page.getByRole("button", { name: /Picadillo familiar/ }).click();
  await expect(
    page.getByRole("heading", { name: "Picadillo familiar", exact: true }),
  ).toBeVisible();
}

test("quick add creates a manual recipe and preserves unknown nutrition", async ({
  page,
}, info) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await page.getByRole("button", { name: "Añadir", exact: true }).click();
  await page
    .getByRole("dialog", { name: "¿Qué quieres añadir?", exact: true })
    .getByRole("button", { name: "Recetas", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Nueva receta", exact: true });
  await editor.getByLabel("Nombre", { exact: true }).fill("Huevos rápidos");
  await editor.getByLabel("Porciones", { exact: true }).fill("1");
  await editor.getByLabel("Ingrediente 1", { exact: true }).fill("Huevos");
  await editor.getByLabel("Cantidad 1", { exact: true }).fill("2");
  await editor.getByLabel("Unidad 1", { exact: true }).fill("unidades");
  await editor
    .getByLabel("Paso 1", { exact: true })
    .fill("Hierve los huevos durante seis minutos.");
  await editor.getByLabel("Proteínas (g)", { exact: true }).fill("12");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await editor.getByRole("button", { name: "Guardar receta", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Huevos rápidos", exact: true })).toBeVisible();
  const nutrition = page.getByRole("region", { name: "Nutrición por porción", exact: true });
  await expect(nutrition).toContainText("—");
  await expect(nutrition).toContainText("12");
  expect((backend.rows["recipes"]![0]!["content"] as typeof content).nutrition).toEqual({
    calories_kcal: null,
    protein_g: 12,
  });
  await page.screenshot({ path: info.outputPath("manual-phone-recipe.png"), fullPage: true });
  expect(backend.unexpectedRequests).toEqual([]);
});

test("ChatGPT import is reviewed before saving, preserves failed drafts and reuses a lost receipt", async ({
  page,
}, info) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { recipePrompt: string }).recipePrompt = value;
        },
      },
    }),
  );
  await signIn(page);
  await section(page, "Recetas");
  await page.getByRole("button", { name: "Con ChatGPT", exact: true }).click();
  const importer = page.getByRole("dialog", { name: "Crear con ChatGPT", exact: true });
  await importer.getByRole("button", { name: "Copiar instrucciones para ChatGPT" }).click();
  expect(
    await page.evaluate(() => (window as unknown as { recipePrompt: string }).recipePrompt),
  ).toContain("ESTIMACIONES POR UNA PORCIÓN");
  await importer
    .getByLabel("Respuesta de ChatGPT", { exact: true })
    .fill('{"name":"bad","photos":["https://external.invalid/photo.jpg"]}');
  await importer.getByRole("button", { name: "Revisar receta", exact: true }).click();
  await expect(importer.getByRole("alert")).toBeVisible();
  expect(backend.rows["recipes"]).toHaveLength(0);
  await importer
    .getByLabel("Respuesta de ChatGPT", { exact: true })
    .fill("```json\n" + JSON.stringify(content) + "\n```");
  await importer.getByRole("button", { name: "Revisar receta", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Nueva receta", exact: true });
  await expect(editor.getByLabel("Nombre", { exact: true })).toHaveValue(content.name);
  await expect(editor.getByLabel("Cantidad 1", { exact: true })).toHaveValue("1/2");
  expect(backend.rows["recipes"]).toHaveLength(0);
  backend.failNextRecipeSave = true;
  await editor.getByRole("button", { name: "Guardar receta", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("Conservamos tu borrador");
  await expect(editor.getByLabel("Nombre", { exact: true })).toHaveValue(content.name);
  backend.loseNextRecipeReceipt = true;
  await editor.getByRole("button", { name: "Guardar receta", exact: true }).click();
  await expect.poll(() => backend.rows["recipes"]!.length).toBe(1);
  await expect(editor.getByRole("alert")).toBeVisible();
  const id = backend.rows["recipes"]![0]!["id"];
  await editor.getByRole("button", { name: "Guardar receta", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("heading", { name: content.name, exact: true })).toBeVisible();
  expect(backend.rows["recipes"]).toHaveLength(1);
  expect(backend.rows["recipes"]![0]!["revision"]).toBe(1);
  await expect(page).toHaveURL(new RegExp(`section=recipes.*record=${id}`));
  await expect(
    page.getByRole("region", { name: "Nutrición por porción", exact: true }),
  ).toContainText("450");
  await page.reload();
  await expect(page.getByRole("heading", { name: content.name, exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("saved-recipe.png"), fullPage: true });
  await page.goBack();
  await expect(page.getByLabel("Buscar recetas", { exact: true })).toBeVisible();
  await page.getByLabel("Buscar recetas", { exact: true }).fill("PICADI");
  await expect(page.getByRole("button", { name: /Picadillo familiar/ })).toHaveCount(1);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("locked tablet opens the cookbook without a PIN, stays open while cooking and returns to photos", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.clock.install();
  const backend = seed();
  await backend.install(page);
  await page.addInitScript(() =>
    localStorage.setItem("homehub-device-token", "fixture-device-token"),
  );
  await page.goto("/");
  const lock = page.getByTestId("tablet-lock-screen");
  await expect(lock).toHaveAttribute("data-stage", "photos");
  await page.getByRole("button", { name: "Mostrar información", exact: true }).click();
  await page.getByRole("button", { name: "Recetas", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "Recetas", exact: true });
  await expect(reader).toBeVisible();
  await openRecipe(page);
  await expect(reader.getByRole("region", { name: "Ingredientes", exact: true })).toContainText(
    "Carne",
  );
  await expect(reader.getByRole("region", { name: "Preparación", exact: true })).toContainText(
    "Dora la carne",
  );
  for (const label of ["Nueva receta", "Con ChatGPT", "Editar receta", "Archivar receta"]) {
    await expect(reader.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }
  await expect(reader.getByLabel("Añadir fotos a la receta", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "PIN de 4 números" })).toHaveCount(0);
  await page.clock.fastForward(15000);
  await expect(reader).toBeVisible();
  for (const size of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    expect(await reader.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("locked-cookbook.png") });
  await reader.getByRole("button", { name: "Close", exact: true }).click();
  await expect(lock).toHaveAttribute("data-stage", "info");
  await page.clock.fastForward(10001);
  await expect(lock).toHaveAttribute("data-stage", "photos");
  expect(backend.financeActive).toBe(false);
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("recipe photo batches retry the original upload receipts and remain private to this recipe", async ({
  page,
}) => {
  const backend = seed();
  await backend.install(page);
  await signIn(page);
  await section(page, "Recetas");
  await openRecipe(page);
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
    "base64",
  );
  const picker = page.getByLabel("Añadir fotos a la receta", { exact: true });
  await expect(picker).toHaveAttribute("multiple", "");
  await picker.setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("No se pudo abrir la foto");
  await expect(picker).toBeEnabled();
  expect(backend.recipePhotoUploads).toBe(0);
  backend.loseNextRecipePhotoReceipt = true;
  await picker.setInputFiles(
    ["plato.png", "ingredientes.png"].map((name) => ({
      name,
      mimeType: "image/png",
      buffer: image,
    })),
  );
  await expect(page.getByRole("alert")).toContainText("No se pudo completar");
  await expect(picker).toBeDisabled();
  await page.getByRole("button", { name: "Reintentar fotos", exact: true }).click();
  await expect.poll(() => backend.rows["recipe_photos"]!.length).toBe(2);
  await expect(page.getByRole("img", { name: "Foto 1 de la receta", exact: true })).toBeVisible();
  expect(backend.recipePhotoUploads).toBe(2);
  expect(backend.recipePhotoObjects.size).toBe(2);
  expect(
    backend.rows["recipe_photos"]!.every((p) =>
      String(p["path"]).startsWith(`${HOME_ID}/${recipeId}/`),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Foto siguiente", exact: true }).click();
  await expect(page.getByRole("img", { name: "Foto 2 de la receta", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "Foto 1 de la receta", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quitar foto de la receta", exact: true }).click();
  await expect.poll(() => backend.rows["recipe_photos"]!.length).toBe(1);
  expect(backend.recipePhotoObjects.size).toBe(1);
  expect(backend.photos).toEqual([]);
  expect(backend.photoObjects.size).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("conflicting edits keep the draft, archive and restore retain identity, and member access is read only", async ({
  page,
}) => {
  const backend = seed();
  await backend.install(page);
  await signIn(page);
  await section(page, "Recetas");
  await openRecipe(page);
  await page.getByRole("button", { name: "Editar receta", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Editar receta", exact: true });
  await editor.getByLabel("Descripción", { exact: true }).fill("Mi borrador sin perder");
  backend.rows["recipes"]![0]!["revision"] = 2;
  backend.rows["recipes"]![0]!["content"] = { ...content, description: "Cambio de otra persona" };
  await editor.getByRole("button", { name: "Guardar receta", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("otro dispositivo");
  await expect(editor.getByLabel("Descripción", { exact: true })).toHaveValue(
    "Mi borrador sin perder",
  );
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  const discard = page.getByRole("alertdialog");
  await discard.getByRole("button", { name: "Seguir editando", exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  await discard.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Cambio de otra persona", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Archivar receta", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archivar", exact: true })
    .click();
  await expect(page.getByLabel("Buscar recetas", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Picadillo familiar/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Archivadas", exact: true }).click();
  await openRecipe(page);
  await page.getByRole("button", { name: "Restaurar receta", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Restaurar", exact: true })
    .click();
  expect(backend.rows["recipes"]).toHaveLength(1);
  expect(backend.rows["recipes"]![0]!["id"]).toBe(recipeId);
  await expect.poll(() => backend.rows["recipes"]![0]!["archived"]).toBe(false);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  backend.members[0]!.role = "member";
  await page.reload();
  await section(page, "Recetas");
  await expect(page.getByRole("button", { name: "Nueva receta", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Con ChatGPT", exact: true })).toHaveCount(0);
  await openRecipe(page);
  await expect(page.getByRole("button", { name: "Editar receta", exact: true })).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
