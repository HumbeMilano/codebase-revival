import { expect, test, type Page } from "@playwright/test";
import { HOME_ID, HouseholdBackend, enterPin, openTabletPin } from "./backend";

const adultKey = `homehub-dashboard-device:v4:${HOME_ID}:m_ana`;
const childKey = `homehub-dashboard-device:v4:${HOME_ID}:m_nico`;
const expiry = 15 * 60 * 1000 + 100;
const layout = {
  version: 4,
  widgets: [
    { id: "finance", key: "fund", size: "wide" },
    { id: "bills", key: "bills", size: "square" },
    { id: "member-summary", key: "member", size: "compact", memberId: "m_ana" },
    { id: "next-bill", key: "next", size: "compact" },
    { id: "notes", key: "notes", size: "wide" },
    { id: "clock", key: "clock", size: "short" },
  ],
};

async function tablet(page: Page, pin = "1234") {
  await page.clock.install({ time: new Date() });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ home, document }) => {
      localStorage.setItem("homehub-device-token", "fixture-device-token");
      for (const member of ["m_ana", "m_nico"])
        localStorage.setItem(
          `homehub-dashboard-device:v4:${home}:${member}`,
          JSON.stringify({ revision: 8, layout: document }),
        );
    },
    { home: HOME_ID, document: layout },
  );
  const backend = new HouseholdBackend();
  const bill = crypto.randomUUID();
  backend.rows["bills"] = [
    {
      id: bill,
      household_id: HOME_ID,
      name: "Factura privada",
      category: "Casa",
      base: 90.12,
      due_day: new Date().getDate(),
      auto_pay: false,
      revision: 1,
      position: 0,
    },
  ];
  backend.rows["bill_splits"] = [{ bill_id: bill, person_key: "m_ana", type: "equal", value: 0 }];
  backend.rows["contributions"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      person_key: "m_ana",
      amount: 45.06,
      month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
      occurred_on: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`,
      note: "",
      revision: 1,
    },
  ];
  await backend.install(page);
  await page.goto("/");
  await openTabletPin(page);
  await enterPin(page, pin);
  await expect(page.getByRole("button", { name: "Personalizar", exact: true })).toBeEnabled();
  return backend;
}

const cells = (page: Page) =>
  page.locator("[data-grid-widget]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect(),
        origin = node.parentElement!.getBoundingClientRect();
      return {
        key: node.getAttribute("data-widget-key"),
        size: node.getAttribute("data-size"),
        x: Math.round(rect.x - origin.x),
        y: Math.round(rect.y - origin.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }),
  );
const masked = (page: Page) => page.locator('[data-finance-masked="true"]');
const fund = (page: Page) => page.locator('[data-widget-key="fund"]');

test("expiry masks every financial card in its original cell and an adult PIN reveals it on Home", async ({
  page,
}, info) => {
  const backend = await tablet(page);
  await expect(fund(page)).toContainText("$45.06");
  await expect(page.locator('[data-widget-key="bills"]')).toContainText("Factura privada");
  const before = await cells(page);
  const saved = await page.evaluate((key) => localStorage.getItem(key), adultKey);
  backend.financeActive = false;
  await page.clock.fastForward(expiry);
  await expect(masked(page)).toHaveCount(4);
  expect(await cells(page)).toEqual(before);
  await expect(page.getByRole("main")).not.toContainText(/90\.12|45\.06|Factura privada/);
  await page.screenshot({ path: info.outputPath("tablet-finances-masked.png"), fullPage: true });
  await fund(page)
    .getByRole("button", { name: "Mostrar importes de fondo común", exact: true })
    .click();
  const pin = page.getByRole("dialog", { name: "Finanzas: PIN de un adulto", exact: true });
  await expect(pin.locator("input, textarea")).toHaveCount(0);
  await enterPin(page, "0000");
  await expect(pin.getByRole("alert")).toContainText("PIN incorrecto");
  await expect(masked(page)).toHaveCount(4);
  await enterPin(page, "5678");
  await expect(pin.getByRole("alert")).toContainText("PIN incorrecto");
  await enterPin(page, "1234");
  await expect(pin).toHaveCount(0);
  await expect(fund(page)).toContainText("$45.06");
  await expect(masked(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hola, Ana", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("section")).toBeNull();
  expect(await cells(page)).toEqual(before);
  expect(await page.evaluate((key) => localStorage.getItem(key), adultKey)).toBe(saved);
  expect(backend.dashboardDeviceReads).toBe(0);
  expect(backend.dashboardSaveRequests).toBe(0);
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("a shared child profile retains masked cards, cancel and child PIN reveal nothing, and locking revokes access", async ({
  page,
}) => {
  const backend = await tablet(page, "5678");
  await expect(masked(page)).toHaveCount(4);
  const saved = await page.evaluate((key) => localStorage.getItem(key), childKey);
  await fund(page)
    .getByRole("button", { name: "Mostrar importes de fondo común", exact: true })
    .click();
  const pin = page.getByRole("dialog", { name: "Finanzas: PIN de un adulto", exact: true });
  await enterPin(page, "5678");
  await expect(pin.getByRole("alert")).toContainText("PIN incorrecto");
  await pin.getByRole("button", { name: "Close", exact: true }).click();
  await expect(masked(page)).toHaveCount(4);
  await expect(page.getByRole("main")).not.toContainText(/90\.12|45\.06|Factura privada/);
  await fund(page)
    .getByRole("button", { name: "Mostrar importes de fondo común", exact: true })
    .click();
  await enterPin(page, "1234");
  await expect(fund(page)).toContainText("$45.06");
  await expect(page.getByRole("heading", { name: "Hola, Nico", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bloquear tablet", exact: true }).click();
  await openTabletPin(page);
  await enterPin(page, "5678");
  await expect(masked(page)).toHaveCount(4);
  expect(await page.evaluate((key) => localStorage.getItem(key), childKey)).toBe(saved);
  expect(backend.financeActive).toBe(false);
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("expiry during editing preserves the layout and does not make masked content interactive", async ({
  page,
}) => {
  const backend = await tablet(page);
  await expect(fund(page)).toContainText("$45.06");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page.getByRole("button", { name: "Cambiar tamaño de notas", exact: true }).click();
  const before = await cells(page);
  backend.financeActive = false;
  await page.clock.fastForward(expiry);
  await expect(masked(page)).toHaveCount(4);
  expect(await cells(page)).toEqual(before);
  await fund(page)
    .locator(".dw-finance-reveal")
    .evaluate((node) => (node as HTMLButtonElement).click());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Guardar inicio", exact: true }).click();
  await expect(page.getByRole("region", { name: "Personalizar inicio", exact: true })).toHaveCount(
    0,
  );
  // Leaving the editor releases its side rail; saved spans/order stay identical.
  expect((await cells(page)).map(({ key, size }) => ({ key, size }))).toEqual(
    before.map(({ key, size }) => ({ key, size })),
  );
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), adultKey);
  expect(
    saved.layout.widgets.filter((entry: { id: string }) =>
      ["finance", "bills", "member-summary", "next-bill"].includes(entry.id),
    ),
  ).toEqual(layout.widgets.slice(0, 4));
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("revealing waits for fresh financial data rather than displaying an empty balance", async ({
  page,
}) => {
  const backend = await tablet(page, "5678");
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/rest\/v1\/(?:bills|contributions)(?:\?|$)/, async (route) => {
    await waiting;
    await route.fallback();
  });
  await fund(page)
    .getByRole("button", { name: "Mostrar importes de fondo común", exact: true })
    .click();
  await enterPin(page, "1234");
  await expect(
    fund(page).getByRole("button", { name: "Actualizando importes de fondo común", exact: true }),
  ).toBeDisabled();
  await expect(masked(page)).toHaveCount(4);
  await expect(fund(page)).not.toContainText("$0.00");
  release();
  await expect(fund(page)).toContainText("$45.06");
  await expect(masked(page)).toHaveCount(0);
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("the masked reveal control fits all twelve saved widget sizes", async ({ page }) => {
  const backend = await tablet(page, "5678");
  await expect(masked(page)).toHaveCount(4);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  for (const columns of [1, 2, 3])
    for (const rows of [1, 2, 3, 4]) {
      await page.getByRole("button", { name: "Configurar fondo común", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Configurar widget", exact: true });
      await dialog
        .getByRole("button", { name: `Tamaño ${columns} por ${rows}`, exact: true })
        .click();
      await dialog.getByRole("button", { name: "Listo", exact: true }).click();
      const fits = await fund(page)
        .locator(".dw-finance-reveal")
        .evaluate((node) => {
          const button = node.getBoundingClientRect(),
            card = node.closest(".widget-card")!.getBoundingClientRect();
          return (
            button.top >= card.top &&
            button.bottom <= card.bottom &&
            button.left >= card.left &&
            button.right <= card.right &&
            button.width >= 24 &&
            button.height >= 24
          );
        });
      expect(fits).toBe(true);
    }
  expect(backend.financialReadsWithoutGrant).toBe(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
