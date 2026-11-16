import { expect, test, type Page } from "@playwright/test";
import {
  HOME_ID,
  USER_ID,
  HouseholdBackend,
  enterPin,
  openTabletPin,
  section,
  signIn,
} from "./backend";

const school = "10000000-0000-4000-8000-000000000081";
const picadillo = "10000000-0000-4000-8000-000000000082";
const pan = "10000000-0000-4000-8000-000000000083";
const eggs = "10000000-0000-4000-8000-000000000084";
const otherPicadillo = "10000000-0000-4000-8000-000000000085";
function seed() {
  const backend = new HouseholdBackend();
  backend.rows["shopping_lists"]!.push({
    id: school,
    household_id: HOME_ID,
    name: "School",
    archived: false,
    position: 1,
    revision: 1,
  });
  backend.rows["shopping_items"] = [
    {
      id: pan,
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Pan",
      done: false,
      position: 1,
      revision: 1,
    },
    {
      id: picadillo,
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Picadillo",
      done: true,
      position: 0,
      revision: 1,
    },
    {
      id: eggs,
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Huevos",
      done: false,
      position: 2,
      revision: 1,
    },
    {
      id: otherPicadillo,
      household_id: HOME_ID,
      list_id: school,
      name: "Picadillo",
      done: true,
      position: 0,
      revision: 1,
    },
  ];
  backend.dashboardPreference = {
    user_id: USER_ID,
    revision: 1,
    layout: {
      version: 4,
      widgets: [
        { id: "shopping", key: "groceries", size: "wide", listId: HOME_ID },
        { id: "shopping", key: "school", size: "compact", listId: school },
      ],
    },
  };
  return backend;
}
const homeWidget = (page: Page) => page.locator('[data-widget-key="groceries"]');
const schoolWidget = (page: Page) => page.locator('[data-widget-key="school"]');
const names = async (page: Page) =>
  homeWidget(page)
    .getByRole("checkbox")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
async function addFromWidget(page: Page) {
  await homeWidget(page)
    .getByRole("button", { name: "Añadir producto a Groceries", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Añadir a Groceries", exact: true });
}

test("lists and widgets share pending-oldest order, progressively suggest and reuse products without duplication", async ({
  page,
}, info) => {
  const backend = seed();
  await backend.install(page);
  await signIn(page);
  expect(await names(page)).toEqual(["Pan", "Huevos", "Picadillo"]);
  await section(page, "Compras");
  const list = page.getByRole("region", { name: "Lista Groceries", exact: true });
  const input = list.getByRole("combobox", { name: "Producto", exact: true });
  await input.fill("p");
  await expect(list.getByRole("option")).toHaveText([/Pan/, /Picadillo/]);
  await input.fill("pi");
  await expect(list.getByRole("option")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("matching-products.png") });
  await list.getByRole("option", { name: "Picadillo", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect
    .poll(() => backend.rows["shopping_items"]!.find((row) => row["id"] === picadillo)?.["done"])
    .toBe(false);
  expect(
    backend.rows["shopping_items"]!.find((row) => row["id"] === otherPicadillo)?.["done"],
  ).toBe(true);
  expect(backend.rows["shopping_items"]).toHaveLength(4);
  const writes = backend.writeRequests;
  await input.fill(" PAN ");
  await list.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect(input).toHaveValue("");
  expect(backend.writeRequests).toBe(writes);
  await input.fill("Cebolla");
  await list.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect.poll(() => backend.rows["shopping_items"]?.length).toBe(5);
  await section(page, "Inicio");
  expect(await names(page)).toEqual(["Picadillo", "Pan", "Huevos", "Cebolla"]);
  await homeWidget(page).getByRole("checkbox", { name: "Picadillo", exact: true }).click();
  await expect(
    homeWidget(page).getByRole("checkbox", { name: "Picadillo", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  expect(await names(page)).toEqual(["Pan", "Huevos", "Cebolla", "Picadillo"]);
  const dialog = await addFromWidget(page);
  const field = dialog.getByRole("combobox", { name: "Producto", exact: true });
  await field.fill("pi");
  await field.press("ArrowDown");
  await field.press("Escape");
  await expect(dialog.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await field.press("ArrowDown");
  await field.press("Enter");
  await expect(field).toHaveValue("");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await names(page)).toEqual(["Picadillo", "Pan", "Huevos", "Cebolla"]);
  await expect(
    schoolWidget(page).getByRole("checkbox", { name: "Picadillo", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(homeWidget(page).getByRole("checkbox")).toHaveCount(4);
  expect(await names(page)).toEqual(["Picadillo", "Pan", "Huevos", "Cebolla"]);
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.rows["shopping_items"]).toHaveLength(5);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("reusing and adding from the widget remain durable offline and sync once after reopening", async ({
  page,
  context,
}) => {
  const backend = seed();
  await backend.install(page);
  await signIn(page);
  await expect(homeWidget(page).getByRole("checkbox")).toHaveCount(3);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
  });
  const before = backend.writeRequests;
  await context.setOffline(true);
  const dialog = await addFromWidget(page);
  const input = dialog.getByRole("combobox", { name: "Producto", exact: true });
  await input.fill("pi");
  await dialog.getByRole("option", { name: "Picadillo", exact: true }).click();
  await expect(input).toHaveValue("");
  await input.fill("Cebolla");
  await dialog.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect(input).toHaveValue("");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await names(page)).toEqual(["Picadillo", "Pan", "Huevos", "Cebolla"]);
  expect(backend.writeRequests).toBe(before);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Compras", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abrir lista Groceries", exact: true }).click();
  const list = page.getByRole("region", { name: "Lista Groceries", exact: true });
  await expect(list.getByRole("button", { name: "Picadillo", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(list.getByRole("button", { name: "Cebolla", exact: true })).toBeVisible();
  await list.getByRole("combobox", { name: "Producto", exact: true }).fill("pa");
  await list.getByRole("option", { name: "Pan", exact: true }).click();
  await expect(list.getByRole("combobox", { name: "Producto", exact: true })).toHaveValue("");
  await context.setOffline(false);
  await expect(page.getByRole("button", { name: "Volver a conectar", exact: true })).toHaveCount(0);
  await expect.poll(() => backend.rows["shopping_items"]?.length).toBe(5);
  await expect
    .poll(() => backend.rows["shopping_items"]!.find((row) => row["id"] === picadillo)?.["done"])
    .toBe(false);
  await section(page, "Inicio");
  await expect(homeWidget(page).getByRole("checkbox")).toHaveCount(4);
  expect(await names(page)).toEqual(["Picadillo", "Pan", "Huevos", "Cebolla"]);
  expect(backend.writeRequests).toBe(before + 2);
  expect(
    backend.rows["shopping_items"]!.find((row) => row["id"] === otherPicadillo)?.["done"],
  ).toBe(true);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("tablet suggestions retain a failed draft and reuse the original product on retry", async ({
  page,
}) => {
  const backend = seed();
  await page.addInitScript(
    ({ home }) => {
      localStorage.setItem("homehub-device-token", "fixture-device-token");
      localStorage.setItem(
        `homehub-dashboard-device:v4:${home}:m_ana`,
        JSON.stringify({
          revision: 1,
          layout: {
            version: 4,
            widgets: [{ id: "shopping", key: "groceries", size: "wide", listId: home }],
          },
        }),
      );
    },
    { home: HOME_ID },
  );
  await backend.install(page);
  await page.goto("/");
  await openTabletPin(page);
  await enterPin(page, "1234");
  const dialog = await addFromWidget(page);
  const input = dialog.getByRole("combobox", { name: "Producto", exact: true });
  await input.fill("pi");
  backend.failNextSave = true;
  await dialog.getByRole("option", { name: "Picadillo", exact: true }).click();
  await expect(input).toHaveValue("pi");
  await expect(dialog.getByRole("option", { name: "Picadillo", exact: true })).toBeEnabled();
  expect(backend.rows["shopping_items"]!.find((row) => row["id"] === picadillo)?.["done"]).toBe(
    true,
  );
  await dialog.getByRole("option", { name: "Picadillo", exact: true }).click();
  await expect(input).toHaveValue("");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    homeWidget(page).getByRole("checkbox", { name: "Picadillo", exact: true }),
  ).toHaveAttribute("aria-checked", "false");
  expect(backend.rows["shopping_items"]).toHaveLength(4);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  for (const columns of [1, 2, 3])
    for (const rows of [1, 2, 3, 4]) {
      await homeWidget(page)
        .getByRole("button", { name: "Configurar lista de compras", exact: true })
        .click();
      const configuration = page.getByRole("dialog", { name: "Configurar widget", exact: true });
      await configuration
        .getByRole("button", { name: `Tamaño ${columns} por ${rows}`, exact: true })
        .click();
      await configuration.getByRole("button", { name: "Listo", exact: true }).click();
      const add = homeWidget(page).getByRole("button", {
        name: "Añadir producto a Groceries",
        exact: true,
      });
      expect(
        await add.evaluate((node) => {
          const button = node.getBoundingClientRect(),
            card = node.closest(".widget-card")!.getBoundingClientRect();
          return (
            Math.round(button.width) >= 24 &&
            Math.round(button.height) >= 24 &&
            button.top >= card.top &&
            button.bottom <= card.bottom &&
            button.left >= card.left &&
            button.right <= card.right
          );
        }),
      ).toBe(true);
      await add.evaluate((node) => (node as HTMLButtonElement).click());
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
