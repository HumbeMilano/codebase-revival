import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, section, signIn } from "./backend";
import {
  eventOneId,
  localDay,
  missingRecordId,
  noteOneId,
  noteTwoId,
  schoolListId,
  seedPolishHome,
} from "./polish-fixtures";

test("the daily header is visible for saved phone layouts and keeps their cells and permissions", async ({
  page,
}, info) => {
  const backend = new HouseholdBackend();
  seedPolishHome(backend);
  backend.members[0]!.role = "member";
  const original = structuredClone(backend.dashboardPreference);
  await page.setViewportSize({ width: 390, height: 844 });
  await backend.install(page);
  await signIn(page);
  const day = page.getByRole("region", { name: "Tu día", exact: true });
  for (const width of [320, 390, 412, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    if (width < 768) {
      await expect(day).toBeVisible();
      await expect(day.getByRole("button", { name: "Abrir tareas del día" })).toContainText(
        "2 pendientes",
      );
      await expect(day.getByRole("button", { name: "Abrir compras del día" })).toContainText(
        "2 por comprar",
      );
      await expect(day.getByRole("button", { name: "Ver agenda de hoy" })).toContainText(
        "1 para hoy",
      );
      await expect(day).not.toContainText("Factura privada");
      await expect(
        day.getByRole("button", { name: "Abrir Cita de familia", exact: true }),
      ).toBeVisible();
      const before = await page
        .locator("[data-widget-key]")
        .evaluateAll((nodes) =>
          nodes.map((node) => [
            node.getAttribute("data-widget-key"),
            node.getAttribute("data-size"),
          ]),
        );
      await page.getByRole("button", { name: "Personalizar", exact: true }).click();
      await expect(day).toHaveCount(0);
      expect(
        await page
          .locator("[data-widget-key]")
          .evaluateAll((nodes) =>
            nodes.map((node) => [
              node.getAttribute("data-widget-key"),
              node.getAttribute("data-size"),
            ]),
          ),
      ).toEqual(before);
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    } else await expect(day).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("phone-home-after-viewport.png") });
  await page.screenshot({ path: info.outputPath("phone-home-after.png"), fullPage: true });
  expect(backend.dashboardPreference).toEqual(original);
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("daily actions open the exact agenda and real creation forms for an empty phone household", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await page.setViewportSize({ width: 390, height: 844 });
  await backend.install(page);
  await signIn(page);
  const day = page.getByRole("region", { name: "Tu día", exact: true });
  await day.getByRole("button", { name: "Añadir tarea al día", exact: true }).click();
  await expect(page.getByLabel("Título de la tarea", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await section(page, "Inicio");
  await day.getByRole("button", { name: "Abrir compras del día", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("record")).toBe(HOME_ID);
  await expect(page.getByRole("textbox", { name: "Producto", exact: true })).toBeVisible();
  await section(page, "Inicio");
  await day.getByRole("button", { name: "Añadir fecha al calendario", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Nuevo evento", exact: true })).toBeVisible();
  expect(backend.writeRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("selecting lists updates their URL, Back, Forward, reload and archival destination", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seedPolishHome(backend);
  await backend.install(page);
  await signIn(page);
  await section(page, "Compras");
  await page.getByRole("button", { name: "Abrir lista School", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("record")).toBe(schoolListId);
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toContainText(
    "Pencils",
  );
  await page.goBack();
  await expect(page.getByRole("region", { name: "Lista Groceries", exact: true })).toContainText(
    "Milk",
  );
  await page.goForward();
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toContainText(
    "Pencils",
  );
  await page.getByRole("button", { name: "Archivar lista", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lista Groceries", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("record")).toBeNull();
  expect(backend.unexpectedRequests).toEqual([]);
});

test("opening and closing notes inside their section retains the right record through browser history", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seedPolishHome(backend);
  await backend.install(page);
  await signIn(page);
  await section(page, "Notas");
  await page.getByRole("button", { name: "Editar Llaves", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Editar nota", exact: true });
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue("Junto a la puerta");
  expect(new URL(page.url()).searchParams.get("record")).toBe(noteOneId);
  await editor.getByLabel("Contenido", { exact: true }).fill("Borrador sin guardar");
  await page.goBack();
  await expect(editor).toHaveCount(0);
  await page.goForward();
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue("Junto a la puerta");
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("record")).toBeNull();
  await page.reload();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "Editar Colegio", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("record")).toBe(noteTwoId);
  await page.reload();
  await expect(editor.getByLabel("Contenido", { exact: true })).toHaveValue("Llevar uniforme");
  expect(page.url()).not.toMatch(/Llaves|Colegio|uniforme|Borrador/);
  expect(backend.writeRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("calendar day selection, event close and refresh preserve the chosen date", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seedPolishHome(backend);
  await backend.install(page);
  await signIn(page);
  await section(page, "Calendario");
  const month = localDay().slice(0, 7);
  await page.getByRole("button", { name: "Día 17", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("record")).toBe(`date:${month}-17`);
  await page.getByRole("button", { name: "Día 18", exact: true }).click();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Día 17", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goForward();
  await expect(page.getByRole("button", { name: "Día 18", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Día 18", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.goto(`/?section=calendar&record=${eventOneId}`);
  await page
    .getByRole("dialog", { name: "Editar evento", exact: true })
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("record"))
    .toBe(`date:${localDay()}`);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(backend.writeRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("missing records never fall back to editing another record or an implicit list", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seedPolishHome(backend);
  await backend.install(page);
  await signIn(page);
  await page.goto(`/?section=shopping&record=${missingRecordId}`);
  await expect(
    page.getByRole("region", { name: "Lista no disponible", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Producto", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver listas", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lista Groceries", exact: true })).toBeVisible();
  await page.goto(`/?section=notes&record=${missingRecordId}`);
  await expect(page.getByRole("region", { name: "Nota no disponible", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`/?section=calendar&record=${missingRecordId}`);
  await expect(
    page.getByRole("region", { name: "Fecha no disponible", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/?section=calendar&record=date:2026-02-31");
  await expect(
    page.getByRole("button", { name: "Añadir al calendario", exact: true }),
  ).toBeVisible();
  expect(backend.writeRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("the chosen list reopens from durable cache after a real offline reload and accepts local edits", async ({
  page,
  context,
}) => {
  const backend = new HouseholdBackend();
  seedPolishHome(backend);
  await backend.install(page);
  await signIn(page);
  await section(page, "Compras");
  await page.getByRole("button", { name: "Abrir lista School", exact: true }).click();
  await page.getByRole("textbox", { name: "Producto", exact: true }).fill("Backpack");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect(page.getByRole("button", { name: "Backpack", exact: true })).toBeVisible();
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
  await page.reload();
  await expect(page.getByRole("button", { name: "Volver a conectar", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toContainText(
    "Backpack",
  );
  await page.getByRole("button", { name: "Abrir lista Groceries", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lista Groceries", exact: true })).toContainText(
    "Milk",
  );
  await page.goBack();
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toContainText(
    "Pencils",
  );
  await page.getByRole("textbox", { name: "Producto", exact: true }).fill("Eraser");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect(page.getByRole("button", { name: "Eraser", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toContainText(
    "Eraser",
  );
  await context.setOffline(false);
  expect(backend.unexpectedRequests).toEqual([]);
});
