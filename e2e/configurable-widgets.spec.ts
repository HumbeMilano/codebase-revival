import { expect, test, type Page } from "@playwright/test";
import { HOME_ID, USER_ID, HouseholdBackend, enterPin, openTabletPin, signIn } from "./backend";

const keysNote = "10000000-0000-4000-8000-000000000061";
const schoolNote = "10000000-0000-4000-8000-000000000062";
const spareNote = "10000000-0000-4000-8000-000000000063";
const schoolList = "10000000-0000-4000-8000-000000000064";
type Layout = { version: number; widgets: Record<string, unknown>[] };
const saved = (backend: HouseholdBackend) => backend.dashboardPreference!["layout"] as Layout;
const catalog = (page: Page) => page.getByRole("dialog", { name: "Añadir widgets", exact: true });
const config = (page: Page) => page.getByRole("dialog", { name: "Configurar widget", exact: true });
const card = (page: Page, key: string) => page.locator(`[data-widget-key="${key}"]`);

function seed(backend: HouseholdBackend) {
  backend.rows["notes"] = [
    [keysNote, "Llaves", "En el cajón"],
    [schoolNote, "Colegio", "Traer el uniforme"],
    [spareNote, "Mascota", "Visita al veterinario"],
  ].map(([id, title, body]) => ({
    id,
    title,
    body,
    household_id: HOME_ID,
    member_key: "m_ana",
    pinned: false,
    revision: 1,
  }));
  backend.rows["shopping_lists"]!.push({
    id: schoolList,
    name: "School",
    household_id: HOME_ID,
    position: 1,
    archived: false,
    revision: 1,
  });
  backend.rows["shopping_items"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Milk",
      done: false,
      revision: 1,
      position: 0,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      list_id: schoolList,
      name: "Pencils",
      done: false,
      revision: 1,
      position: 0,
    },
  ];
  backend.dashboardPreference = {
    user_id: USER_ID,
    revision: 3,
    layout: {
      version: 3,
      widgets: [
        { id: "specific-note", key: "placeholder", size: "square" },
        { id: "notes", key: "all-notes", size: "wide" },
      ],
    },
  };
}

async function add(page: Page, name: string, choice?: string) {
  await catalog(page)
    .getByRole("button", { name: `Añadir ${name}`, exact: true })
    .click();
  if (choice)
    await page
      .getByRole("dialog", { name: /^Elegir / })
      .getByRole("button", { name: choice, exact: true })
      .click();
}

test("distinct notes, members and lists persist as independent instances with no repeated selections", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page.getByRole("button", { name: "Widgets", exact: true }).click();
  await add(page, "nota específica", "Llaves");
  await expect(page.locator('[data-widget="specific-note"]')).toHaveCount(1);
  await expect(card(page, "placeholder")).toHaveAttribute("data-size", "square");
  await add(page, "nota específica");
  const chooser = page.getByRole("dialog", { name: "Elegir nota", exact: true });
  await expect(chooser.getByRole("button", { name: "Llaves", exact: true })).toBeDisabled();
  await chooser.getByRole("button", { name: "Colegio", exact: true }).click();
  await add(page, "resumen de miembro", "Ana");
  await add(page, "resumen de miembro"); // The sole unused member is selected automatically.
  await expect(
    catalog(page).getByRole("button", { name: "Añadir resumen de miembro", exact: true }),
  ).toBeDisabled();
  await add(page, "tareas de miembro", "Ana");
  await add(page, "tareas de miembro");
  await add(page, "lista de compras", "Groceries");
  await add(page, "lista de compras");
  await expect(
    catalog(page).getByRole("button", { name: "Añadir lista de compras", exact: true }),
  ).toBeDisabled();
  await expect(
    catalog(page).getByRole("button", { name: "Añadir notas", exact: true }),
  ).toBeDisabled();
  await catalog(page).getByRole("button", { name: "Listo", exact: true }).click();
  await page
    .getByRole("button", { name: "Configurar nota específica · llaves", exact: true })
    .click();
  await expect(config(page).getByRole("option", { name: "Colegio", exact: true })).toHaveAttribute(
    "disabled",
    "",
  );
  await config(page).getByRole("button", { name: "Tamaño 3 por 2", exact: true }).click();
  await config(page).getByRole("button", { name: "Listo", exact: true }).click();
  await page
    .getByRole("button", { name: "Mover nota específica · colegio", exact: true })
    .press("ArrowUp");
  await page
    .getByRole("button", { name: "Mover nota específica · colegio", exact: true })
    .press("ArrowUp");
  await page.getByRole("button", { name: "Ocultar tareas de miembro · nico", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  const layout = structuredClone(saved(backend));
  expect(layout.version).toBe(4);
  expect(layout.widgets.filter((entry) => entry["id"] === "specific-note")).toHaveLength(2);
  expect(layout.widgets.find((entry) => entry["key"] === "placeholder")).toEqual({
    id: "specific-note",
    key: "placeholder",
    size: "panorama",
    noteId: keysNote,
  });
  expect(layout.widgets[0]?.["noteId"]).toBe(schoolNote);
  expect(
    layout.widgets
      .filter((entry) => entry["id"] === "member-summary")
      .map((entry) => entry["memberId"]),
  ).toEqual(["m_ana", "m_nico"]);
  expect(
    layout.widgets
      .filter((entry) => entry["id"] === "member-tasks")
      .map((entry) => entry["memberId"]),
  ).toEqual(["m_ana"]);
  expect(JSON.stringify(layout)).not.toMatch(
    /Llaves|Colegio|En el cajón|Groceries|School|Milk|Pencils|amount/,
  );
  await page.reload();
  await expect(card(page, "placeholder")).toContainText("En el cajón");
  expect(saved(backend)).toEqual(layout);
  expect(
    await page
      .locator("[data-widget-key]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-widget-key"))),
  ).toEqual(layout.widgets.map((entry) => entry["key"]));
  const school = layout.widgets.find((entry) => entry["listId"] === schoolList)!["key"] as string;
  await card(page, school).getByRole("checkbox", { name: "Pencils", exact: true }).click();
  await expect
    .poll(
      () => backend.rows["shopping_items"]!.find((entry) => entry["name"] === "Pencils")!["done"],
    )
    .toBe(true);
  expect(backend.rows["shopping_items"]!.find((entry) => entry["name"] === "Milk")!["done"]).toBe(
    false,
  );
  await page.screenshot({
    path: testInfo.outputPath("configured-widget-instances.png"),
    fullPage: true,
  });
  await card(page, "placeholder").getByText("Llaves", { exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Editar nota", exact: true })
      .getByLabel("Contenido", { exact: true }),
  ).toHaveValue("En el cajón");
  expect(backend.unexpectedRequests).toEqual([]);
});

test("unavailable references keep their slot and can be changed only to an unused note", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  const missing = "10000000-0000-4000-8000-000000000099";
  backend.dashboardPreference = {
    user_id: USER_ID,
    revision: 6,
    layout: {
      version: 4,
      widgets: [
        { id: "specific-note", key: "missing", size: "column", noteId: missing },
        { id: "specific-note", key: "keys", size: "wide", noteId: keysNote },
      ],
    },
  };
  await backend.install(page);
  await signIn(page);
  await expect(card(page, "missing")).not.toContainText("En el cajón");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await card(page, "missing")
    .getByRole("button", { name: /^Configurar / })
    .click();
  await expect(config(page).getByRole("combobox", { name: "Nota del widget" })).toHaveValue(
    missing,
  );
  await expect(config(page).getByRole("option", { name: "Llaves", exact: true })).toHaveAttribute(
    "disabled",
    "",
  );
  // A forged change event must not bypass the disabled option or replace the other instance.
  await config(page)
    .getByRole("combobox", { name: "Nota del widget" })
    .evaluate((node, id) => {
      if (!(node instanceof HTMLSelectElement)) throw new Error("Expected the widget selector");
      node.value = id;
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }, keysNote);
  await expect(config(page).getByRole("combobox", { name: "Nota del widget" })).toHaveValue(
    missing,
  );
  await config(page).getByRole("combobox", { name: "Nota del widget" }).selectOption(spareNote);
  await config(page).getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  expect(saved(backend).widgets[0]).toEqual({
    id: "specific-note",
    key: "missing",
    size: "column",
    noteId: spareNote,
  });
  await page.reload();
  await expect(card(page, "missing")).toContainText("Visita al veterinario");
  await expect(card(page, "keys")).toContainText("En el cajón");
  expect(backend.unexpectedRequests).toEqual([]);
});

test("legacy implicit shopping binds its only list and cannot add it a second time", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  backend.rows["shopping_lists"] = backend.rows["shopping_lists"]!.filter(
    (entry) => entry["id"] === HOME_ID,
  );
  backend.dashboardPreference = {
    user_id: USER_ID,
    revision: 1,
    layout: { version: 3, widgets: [{ id: "shopping", key: "legacy-list", size: "full" }] },
  };
  await backend.install(page);
  await signIn(page);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page.getByRole("button", { name: "Widgets", exact: true }).click();
  await expect(
    catalog(page).getByRole("button", { name: "Añadir lista de compras", exact: true }),
  ).toBeDisabled();
  await catalog(page).getByRole("button", { name: "Listo", exact: true }).click();
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  expect(saved(backend).widgets).toEqual([
    { id: "shopping", key: "legacy-list", size: "full", listId: HOME_ID },
  ]);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("all financial instances stay hidden on child tablets with separate local preferences", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await page.addInitScript(
    ({ household }) => {
      localStorage.setItem("homehub-device-token", "fixture-device-token");
      localStorage.setItem(
        `homehub-dashboard-device:v4:${household}:m_nico`,
        JSON.stringify({
          revision: 2,
          layout: {
            version: 4,
            widgets: [
              { id: "member-summary", key: "adult-finance", size: "wide", memberId: "m_ana" },
              { id: "member-summary", key: "child-finance", size: "wide", memberId: "m_nico" },
              { id: "member-tasks", key: "child-tasks", size: "wide", memberId: "m_nico" },
            ],
          },
        }),
      );
    },
    { household: HOME_ID },
  );
  backend.financeActive = false;
  await backend.install(page);
  await page.goto("/");
  await openTabletPin(page);
  await enterPin(page, "5678");
  await expect(card(page, "child-tasks")).toBeVisible();
  await expect(page.locator('[data-widget="member-summary"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page.getByRole("button", { name: "Widgets", exact: true }).click();
  await expect(
    catalog(page).getByRole("button", { name: "Añadir resumen de miembro", exact: true }),
  ).toHaveCount(0);
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.dashboardDeviceReads).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
