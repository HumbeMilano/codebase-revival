import { expect, test } from "@playwright/test";
import { HouseholdBackend, section, signIn } from "./backend";

test("the main sidebar frees the tablet dashboard and adapts to phones and short screens", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  await page.setViewportSize({ width: 1024, height: 768 });
  await backend.install(page);
  // A compact personal view must not restore the top menu on a tablet.
  await page.route("**/rest/v1/profiles?**", (route) =>
    route.fulfill({
      json: {
        id: "20000000-0000-4000-8000-000000000001",
        avatar_path: null,
        preferred_view: "mobile",
        time_format: "12",
      },
    }),
  );
  await signIn(page);
  const sidebar = page.getByRole("complementary", { name: "Menú principal", exact: true });
  const navigation = sidebar.getByRole("navigation", { name: "Secciones del hogar", exact: true });
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 768 });
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Navegación principal", exact: true }),
    ).toHaveCount(0);
    const rail = (await sidebar.boundingBox())!,
      main = (await page.locator("#main-content").boundingBox())!;
    expect(rail.width).toBeLessThanOrEqual(80);
    expect(main.y).toBeLessThan(4);
    expect(main.x).toBeGreaterThanOrEqual(rail.x + rail.width);
    expect((await page.locator("[data-widget]").first().boundingBox())!.y).toBeLessThan(160);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: testInfo.outputPath("tablet-sidebar.png"), fullPage: true });
  await navigation.getByRole("button", { name: "Calendario", exact: true }).click();
  await expect(navigation.getByRole("button", { name: "Calendario", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "Calendario", exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: "Añadir", exact: true }).click();
  await page
    .getByRole("dialog", { name: "¿Qué quieres añadir?", exact: true })
    .getByRole("button", { name: "Notas", exact: true })
    .click();
  const note = page.getByRole("dialog", { name: "Nueva nota", exact: true });
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "Cancelar", exact: true }).click();
  await navigation.getByRole("button", { name: "Inicio", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  const editor = page.getByRole("region", { name: "Personalizar inicio", exact: true });
  const editorBounds = (await editor.boundingBox())!,
    sidebarBounds = (await sidebar.boundingBox())!,
    gridBounds = (await page.locator(".dashboard-grid").boundingBox())!;
  expect(editorBounds.x).toBeGreaterThanOrEqual(sidebarBounds.x + sidebarBounds.width + 4);
  expect(gridBounds.x).toBeGreaterThanOrEqual(editorBounds.x + editorBounds.width);
  await page.screenshot({
    path: testInfo.outputPath("tablet-sidebar-editing.png"),
    fullPage: true,
  });
  await editor.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.setViewportSize({ width: 393, height: 851 });
  await expect(sidebar).toHaveCount(0);
  const dock = page.getByRole("navigation", { name: "Navegación principal", exact: true });
  await expect(dock).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
  await section(page, "Notas");
  await expect(dock.getByRole("button", { name: "Más", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1024, height: 480 });
  await expect(sidebar).toBeVisible();
  await navigation.getByRole("button", { name: "Mi perfil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mi perfil", exact: true }).first()).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Cerrar sesión", exact: true })).toBeVisible();
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
