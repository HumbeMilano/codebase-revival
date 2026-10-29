import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, section, signIn } from "./backend";

const billId = "10000000-0000-4000-8000-000000000056";
function seed(backend: HouseholdBackend) {
  const now = new Date();
  backend.rows["bills"] = [
    {
      id: billId,
      household_id: HOME_ID,
      name: "Alquiler estimado",
      category: "Vivienda",
      base: 100,
      due_day: 1,
      auto_pay: true,
      position: 0,
      revision: 1,
    },
  ];
  backend.rows["bill_splits"] = [{ bill_id: billId, person_key: "m_ana", type: "equal", value: 0 }];
  backend.rows["contributions"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      person_key: "m_ana",
      amount: 100,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      note: "",
      position: 0,
      revision: 1,
    },
  ];
}

test("a scheduled estimate does not reduce the registered fund until explicitly confirmed", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  await section(page, "Finanzas");
  const fund = page
    .locator("section")
    .filter({ has: page.getByText("En el fondo común", { exact: true }) });
  await expect(fund.getByText("Pagado", { exact: true }).locator("..")).toContainText("$0.00");
  await expect(fund.getByText("Pagos estimados", { exact: true }).locator("..")).toContainText(
    "$100.00",
  );
  const bill = page.getByRole("button", { name: /Alquiler estimado/ });
  await expect(bill).toContainText("Pago estimado");
  expect(backend.writeRequests).toBe(0);
  await bill.click();
  await page.getByRole("button", { name: "Confirmar pago real", exact: true }).click();
  await expect(fund.getByText("Pagado", { exact: true }).locator("..")).toContainText("$100.00");
  await expect(fund.getByText("Pagos estimados", { exact: true })).toHaveCount(0);
  await expect(bill).toContainText("Pagado");
  await page.reload();
  await expect(fund.getByText("Pagado", { exact: true }).locator("..")).toContainText("$100.00");
  expect(backend.rows["bill_overrides"]?.[0]?.["status"]).toBe("paid");
});

test("calendar details show an estimate as unconfirmed and permit a deliberate confirmation", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  await page.goto(`/?section=calendar&record=bill:${billId}:${month}`);
  await expect(page.getByText("Factura · Pago estimado", { exact: true })).toBeVisible();
  expect(backend.writeRequests).toBe(0);
  await page.getByRole("button", { name: "Marcar pagada", exact: true }).click();
  await expect(page.getByText("Factura · Pagada", { exact: true })).toBeVisible();
  expect(backend.rows["bill_overrides"]?.[0]?.["status"]).toBe("paid");
});
