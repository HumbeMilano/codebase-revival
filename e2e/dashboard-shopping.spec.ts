import { expect, test } from "@playwright/test";
import { HouseholdBackend, HOME_ID, enterPin, openTabletPin, section, signIn } from "./backend";

const school = "10000000-0000-4000-8000-000000000091";
const homePan = "10000000-0000-4000-8000-000000000092";
const schoolPan = "10000000-0000-4000-8000-000000000093";
function seed(backend: HouseholdBackend) {
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
      id: homePan,
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Pan",
      done: false,
      position: 0,
      revision: 1,
    },
    {
      id: schoolPan,
      household_id: HOME_ID,
      list_id: school,
      name: "Pan",
      done: false,
      position: 0,
      revision: 1,
    },
  ];
  backend.dashboardPreference = {
    user_id: "20000000-0000-4000-8000-000000000001",
    revision: 1,
    layout: {
      version: 3,
      widgets: [{ id: "shopping", key: "shopping", size: "wide", listId: school }],
    },
  };
}

test("Home marks and unmarks the chosen list, stays in sync with Shopping and survives reload", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  const widget = page.locator('[data-widget="shopping"]');
  const product = widget.getByRole("checkbox", { name: "Pan", exact: true });
  await expect(widget).toContainText("School");
  await expect(product).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await widget.locator('[role="checkbox"]').evaluate((node) => (node as HTMLButtonElement).click());
  expect(backend.rows["shopping_items"]!.every((row) => row["done"] === false)).toBe(true);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await product.click();
  await expect(product).toHaveAttribute("aria-checked", "true");
  await expect(widget.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  await expect
    .poll(() => backend.rows["shopping_items"]!.find((row) => row["id"] === schoolPan)?.["done"])
    .toBe(true);
  expect(backend.rows["shopping_items"]!.find((row) => row["id"] === homePan)?.["done"]).toBe(
    false,
  );
  await page.reload();
  await expect(product).toHaveAttribute("aria-checked", "true");
  await section(page, "Compras");
  await page.getByRole("button", { name: "Abrir lista School", exact: true }).click();
  const other = page
    .getByRole("region", { name: "Lista School", exact: true })
    .getByRole("button", { name: "Pan", exact: true });
  await expect(other).toHaveAttribute("aria-pressed", "true");
  await other.click();
  await expect(other).toHaveAttribute("aria-pressed", "false");
  await section(page, "Inicio");
  await expect(product).toHaveAttribute("aria-checked", "false");
  await product.focus();
  await page.keyboard.press("Space");
  await expect(product).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => backend.rows["shopping_items"]!.find((row) => row["id"] === schoolPan)?.["done"])
    .toBe(true);
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("shopping-widget-checked.png") });
});

test("a Home shopping check is durable offline and syncs once after an offline reload", async ({
  page,
  context,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  const product = page
    .locator('[data-widget="shopping"]')
    .getByRole("checkbox", { name: "Pan", exact: true });
  await expect(product).toHaveAttribute("aria-checked", "false");
  const before = backend.writeRequests;
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
  await product.click();
  await expect(product).toHaveAttribute("aria-checked", "true");
  expect(backend.writeRequests).toBe(before);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Compras", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Abrir lista School", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Lista School", exact: true })
      .getByRole("button", { name: "Pan", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // Force the reconnect read to finish after the outbox receipt. A slow GET
  // captured before that receipt must not overwrite the acknowledged check.
  const stale = structuredClone(backend.rows["shopping_items"]);
  let reading!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    reading = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/rest\/v1\/rpc\/sync_shopping$/, async (route) => {
    await started;
    await route.fallback();
  });
  await page.route(/\/rest\/v1\/shopping_items(?:\?|$)/, async (route) => {
    reading();
    await waiting;
    await route.fulfill({ json: stale, headers: { "Content-Range": "0-1/2" } });
  });
  await context.setOffline(false);
  await expect(page.getByRole("button", { name: "Volver a conectar", exact: true })).toHaveCount(0);
  await expect
    .poll(() => backend.rows["shopping_items"]!.find((row) => row["id"] === schoolPan)?.["done"])
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open("homehub-shopping-v1", 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const connection = request.result;
              const read = connection.transaction("lists").objectStore("lists").getAll();
              read.onerror = () => reject(read.error);
              read.onsuccess = () => {
                resolve(read.result.length === 1 && read.result[0].queue.length === 0);
                connection.close();
              };
            };
          }),
      ),
    )
    .toBe(true);
  release();
  await expect(page.getByRole("region", { name: "Lista School", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("record")).toBe(school);
  await section(page, "Inicio");
  await expect(product).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => backend.rows["shopping_items"]!.find((row) => row["id"] === schoolPan)?.["done"])
    .toBe(true);
  expect(backend.rows["shopping_items"]!.find((row) => row["id"] === homePan)?.["done"]).toBe(
    false,
  );
  expect(backend.writeRequests).toBe(before + 1);
  expect(backend.rows["shopping_items"]).toHaveLength(2);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a rejected tablet shopping check rolls back and can be retried from Home", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.rows["shopping_items"] = [
    {
      id: homePan,
      household_id: HOME_ID,
      list_id: HOME_ID,
      name: "Pan",
      done: false,
      position: 0,
      revision: 1,
    },
  ];
  await page.addInitScript(() =>
    localStorage.setItem("homehub-device-token", "fixture-device-token"),
  );
  await backend.install(page);
  await page.goto("/");
  await openTabletPin(page);
  await enterPin(page, "1234");
  const product = page
    .locator('[data-widget="shopping"]')
    .getByRole("checkbox", { name: "Pan", exact: true });
  await expect(product).toHaveAttribute("aria-checked", "false");
  backend.failNextSave = true;
  await product.click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(product).toHaveAttribute("aria-checked", "false");
  expect(backend.rows["shopping_items"]![0]!["done"]).toBe(false);
  await product.click();
  await expect(product).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => backend.rows["shopping_items"]![0]!["done"]).toBe(true);
  expect(backend.unexpectedRequests).toEqual([]);
});
