import { test, expect } from "@playwright/test";
import { HouseholdBackend, signIn, section } from "./backend";
const free = { members: 4, lists: 3, devices: 1, photos: 10, widgets: 6 };
const pro = { members: 12, lists: 20, devices: 3, photos: 30, widgets: 64 };
const catalog = {
  plans: [
    {
      id: "free",
      name: "Skendal Free",
      amount_cents: 0,
      annual_amount_cents: 0,
      currency: "USD",
      limits: free,
    },
    {
      id: "pro",
      name: "Skendal Pro",
      amount_cents: 299,
      annual_amount_cents: 599,
      currency: "USD",
      limits: pro,
    },
  ],
};
const base = {
  plan: "free",
  limits: free,
  usage: { members: 2, lists: 1, devices: 0, photos: 0 },
  commercial_launch: false,
  limits_enabled: false,
  can_test: false,
  can_manage_subscription: false,
  refreshing: false,
  mode: "sandbox",
  sandbox: null,
  pending_checkout: null,
  catalog,
};
test("plan comparison remains preparation-only and a URL cannot activate Pro", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.route("**/api/subscriptions/status", (route) => route.fulfill({ json: base }));
  await signIn(page);
  await page.goto("/subscription?checkout=success&plan=pro");
  await expect(page.getByRole("heading", { name: "Mi plan · Skendal" })).toBeVisible();
  await expect(page.getByText("Plan del hogar:")).toHaveText("Plan del hogar: Free");
  await expect(page.getByRole("heading", { name: "Skendal Free", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Skendal Pro", exact: true })).toBeVisible();
  await expect(page.getByText("2,99", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Probar mensual" })).toHaveCount(0);
  await expect(page.getByText(/cobros reales y los límites están desactivados/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(backend.unexpectedRequests).toEqual([]);
});
test("approved sandbox checkout requires acknowledgment and preserves an uncertain attempt", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.route("**/api/subscriptions/status", (route) =>
    route.fulfill({ json: { ...base, can_test: true } }),
  );
  const attempts: Record<string, unknown>[] = [];
  await page.route("**/api/subscriptions/checkout", (route) => {
    attempts.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Prueba interrumpida; reintenta." } });
  });
  await signIn(page);
  await page.goto("/subscription");
  const monthly = page.getByRole("button", { name: "Probar mensual", exact: true });
  await expect(monthly).toBeDisabled();
  await page.getByRole("checkbox").check();
  await monthly.click();
  await expect(page.getByRole("alert")).toContainText("Prueba interrumpida");
  await monthly.click();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(Object.keys(attempts[0]!).sort()).toEqual([
    "acknowledge_sandbox",
    "interval",
    "request_id",
  ]);
  await expect(page.getByRole("button", { name: "Probar anual" })).toBeDisabled();
  expect(backend.unexpectedRequests).toEqual([]);
});
test("legal drafts and privacy requests are reviewable in the separate administration", async ({
  page,
}, info) => {
  const backend = new HouseholdBackend();
  backend.platformAdmin = true;
  await backend.install(page);
  let profile: Record<string, unknown> = {
    company_formed: false,
    operator_name: "",
    operator_state: "",
    operator_address: "",
    support_email: "",
    privacy_email: "",
    copyright_name: "",
    copyright_address: "",
    copyright_phone: "",
    copyright_email: "",
    dmca_registered: false,
    reviewed: false,
    revision: 1,
    status: "draft",
    minimum_age: 13,
    administrator_age: 18,
    updated_at: new Date().toISOString(),
  };
  const requests: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/*privacy_request*", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    const body = route.request().postDataJSON();
    if (name === "my_privacy_requests") return route.fulfill({ json: requests });
    if (name === "create_privacy_request") {
      const id = crypto.randomUUID();
      requests.push({
        id,
        kind: body._kind,
        detail: body._detail,
        status: "received",
        resolution: "",
        user_id: "20000000-0000-4000-8000-000000000001",
        created_at: new Date().toISOString(),
      });
      return route.fulfill({ json: id });
    }
    if (name === "admin_update_privacy_request") {
      const row = requests.find((r) => r["id"] === body._id)!;
      row["status"] = body._status;
      row["resolution"] = body._resolution;
      return route.fulfill({ json: null });
    }
    return route.fallback();
  });
  await page.route("**/rest/v1/rpc/*business_legal", (route) => {
    if (route.request().url().endsWith("admin_save_business_legal")) {
      const body = route.request().postDataJSON();
      profile = { ...profile, ...body._profile, revision: Number(profile["revision"]) + 1 };
    }
    return route.fulfill({
      json: {
        profile,
        commercial_launch: false,
        limits_enabled: false,
        privacy_requests: requests,
      },
    });
  });
  await signIn(page);
  await section(page, "Mi perfil");
  await page.getByRole("button", { name: "Gestionar mis datos" }).click();
  await page.getByRole("combobox", { name: "Solicitud", exact: true }).selectOption("access");
  await page.getByLabel("Detalles", { exact: true }).fill("Solicito copia de mis datos de prueba.");
  await page.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(page.getByText("Acceso y copia · Recibida")).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.goto("/admin");
  await page.getByRole("button", { name: "legal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preparación legal", exact: true })).toBeVisible();
  await expect(page.getByLabel("Nombre legal de la empresa")).toHaveValue("");
  await page.getByLabel("Correo de privacidad", { exact: true }).fill("privacy@example.invalid");
  await page.getByRole("button", { name: "Guardar preparación", exact: true }).click();
  await expect.poll(() => profile["revision"]).toBe(2);
  await expect(page.getByText("BORRADOR NO VIGENTE.", { exact: false })).toBeVisible();
  await page.getByLabel("Documento legal").selectOption("copyright");
  await page.getByLabel("Idioma del borrador").selectOption("en");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar borrador" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("skendal-copyright-en-BORRADOR.md");
  await page.getByRole("button", { name: "Gestionar solicitud" }).click();
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("reviewing");
  await page.getByLabel("Respuesta", { exact: true }).fill("Preparando exportación de prueba.");
  await page.getByRole("button", { name: "Guardar respuesta", exact: true }).click();
  await expect(page.getByText("Acceso y copia · En revisión")).toBeVisible();
  expect(backend.unexpectedRequests).toEqual([]);
  await page.screenshot({ path: info.outputPath("legal-preparation.png"), fullPage: true });
});
