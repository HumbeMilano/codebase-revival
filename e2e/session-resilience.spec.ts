import { expect, test, type Page } from "@playwright/test";
import { HOME_ID, HouseholdBackend, section, signIn } from "./backend";
import { ACTIVE_SHOPPING_ACCOUNT } from "../src/lib/offline-shopping";

async function openDraft(page: Page, backend: HouseholdBackend) {
  await backend.install(page);
  await page.clock.install();
  await signIn(page);
  await section(page, "Tareas");
  await page.getByRole("button", { name: "Nueva tarea", exact: true }).click();
  await page.getByLabel("Título de la tarea", { exact: true }).fill("Borrador conservado");
}

for (const status of [500, 522, 525]) {
  test(`a temporary ${status} preserves the task draft and recovers without duplicate writes`, async ({
    page,
  }) => {
    const backend = new HouseholdBackend();
    await openDraft(page, backend);
    let failing = true;
    let verified = 0;
    await page.route("**/rest/v1/rpc/my_context", async (route) => {
      if (failing)
        return route.fulfill({ status, json: { message: "Temporary upstream failure" } });
      verified++;
      return route.fallback();
    });
    await page.clock.fastForward(61000);
    await expect(
      page.getByText("No se pudo verificar el hogar. Reintentando…", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Título de la tarea", { exact: true })).toHaveValue(
      "Borrador conservado",
    );
    await expect(
      page.getByRole("heading", { name: "No pudimos abrir tu hogar", exact: true }),
    ).toHaveCount(0);
    failing = false;
    await page.clock.fastForward(61000);
    await expect.poll(() => verified).toBeGreaterThan(0);
    await expect(page.getByLabel("Título de la tarea", { exact: true })).toHaveValue(
      "Borrador conservado",
    );
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect.poll(() => backend.rows["chores"]?.length).toBe(1);
    expect(backend.rows["chores"]?.[0]?.["title"]).toBe("Borrador conservado");
    expect(backend.unexpectedRequests).toEqual([]);
  });
}

test("a transport timeout preserves the currently verified household", async ({ page }) => {
  const backend = new HouseholdBackend();
  await openDraft(page, backend);
  await page.route("**/rest/v1/rpc/my_context", (route) => route.abort("timedout"));
  await page.clock.fastForward(61000);
  await expect(
    page.getByText("No se pudo verificar el hogar. Reintentando…", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Título de la tarea", { exact: true })).toHaveValue(
    "Borrador conservado",
  );
  expect(backend.writeRequests).toBe(0);
});

test("a temporary Auth verification error preserves the current draft until reconnection", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await openDraft(page, backend);
  let fail = true;
  await page.route("**/auth/v1/user", (route) =>
    fail
      ? route.fulfill({ status: 503, json: { message: "Temporary Auth failure" } })
      : route.fallback(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByText("No se pudo verificar el hogar. Reintentando…", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Título de la tarea", { exact: true })).toHaveValue(
    "Borrador conservado",
  );
  fail = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByText("No se pudo verificar el hogar. Reintentando…", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Título de la tarea", { exact: true })).toHaveValue(
    "Borrador conservado",
  );
});

for (const denial of [
  { status: 401, message: "JWT expired", code: "PGRST301" },
  { status: 403, message: "Household suspended", code: "42501" },
  { status: 503, message: "Device revoked", code: "42501" },
]) {
  test(`explicit denial ${denial.message} removes the private view even with a draft`, async ({
    page,
  }) => {
    const backend = new HouseholdBackend();
    await openDraft(page, backend);
    await page.route("**/rest/v1/rpc/my_context", (route) =>
      route.fulfill({
        status: denial.status,
        json: { message: denial.message, code: denial.code },
      }),
    );
    await page.clock.fastForward(61000);
    await expect(
      page.getByRole("heading", { name: "No pudimos abrir tu hogar", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Título de la tarea", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Borrador conservado", { exact: true })).toHaveCount(0);
    expect(backend.writeRequests).toBe(0);
  });
}

test("a denied member read takes priority over a simultaneous temporary context error", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await openDraft(page, backend);
  await page.route("**/rest/v1/rpc/my_context", (route) =>
    route.fulfill({ status: 503, json: { message: "Temporary context failure" } }),
  );
  await page.route("**/rest/v1/rpc/household_members", (route) =>
    route.fulfill({ status: 403, json: { code: "42501", message: "Permission denied" } }),
  );
  await page.clock.fastForward(61000);
  await expect(
    page.getByRole("heading", { name: "No pudimos abrir tu hogar", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Título de la tarea", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), ACTIVE_SHOPPING_ACCOUNT),
  ).toBeNull();
});

test("an old revalidation response cannot reopen the household after logout", async ({ page }) => {
  const backend = new HouseholdBackend();
  await openDraft(page, backend);
  let held: import("@playwright/test").Route | undefined;
  await page.route("**/rest/v1/rpc/my_context", async (route) => {
    held = route;
  });
  await page.clock.fastForward(61000);
  await expect.poll(() => Boolean(held)).toBe(true);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).first().click();
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await held!.fulfill({
    json: [
      {
        household_id: HOME_ID,
        household_name: "Hogar de prueba",
        member_key: "m_ana",
        mode: "account",
      },
    ],
  });
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await expect(page.getByText("Hola, Ana", { exact: true })).toHaveCount(0);
});

test("a different synthetic Auth session cannot retain the previous private view on network failure", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await openDraft(page, backend);
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({ status: 503, json: { message: "Temporary upstream failure" } }),
  );
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => /^sb-.+-auth-token$/.test(key))!;
    const session = JSON.parse(localStorage.getItem(key)!);
    session.user = {
      ...session.user,
      id: "20000000-0000-4000-8000-000000000099",
      email: "other@example.invalid",
    };
    localStorage.setItem(key, JSON.stringify(session));
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: "SIGNED_IN", session });
    setTimeout(() => channel.close(), 1000);
  });
  await expect(
    page.getByRole("heading", { name: "No pudimos abrir tu hogar", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Título de la tarea", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Hola, Ana", { exact: true })).toHaveCount(0);
});

test("first mount requests each shared collection only once", async ({ page }) => {
  const backend = new HouseholdBackend();
  const reads: Record<string, number> = {};
  page.on("request", (request) => {
    const table = new URL(request.url()).pathname.match(/\/rest\/v1\/(notes|events|chores)$/)?.[1];
    if (table && request.method() === "GET") reads[table] = (reads[table] ?? 0) + 1;
  });
  await backend.install(page);
  await signIn(page);
  await section(page, "Tareas");
  await page.getByRole("button", { name: "Nueva tarea", exact: true }).click();
  await expect(page.getByLabel("Título de la tarea", { exact: true })).toBeVisible();
  expect(reads).toEqual({ notes: 1, events: 1, chores: 1 });
});
