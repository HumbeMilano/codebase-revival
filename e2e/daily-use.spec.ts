import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, mockTabletPasskey, section, signIn } from "./backend";

test("an invitation opens signup with its recipient and full code", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  const code = "ABCDEF0123456789ABCDEF0123456789";
  await page.goto(`/?invite=${code}&email=ana%40example.invalid`);
  await expect(page.getByRole("heading", { name: "Crea tu cuenta", exact: true })).toBeVisible();
  await expect(page.getByLabel("Correo", { exact: true })).toHaveValue("ana@example.invalid");
  await expect(page.getByLabel("Invitación (opcional)")).toHaveValue(code);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bienvenido", exact: true })).toBeVisible();
});

test("completed tasks stay current for three days and can be restored from the archive", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.rows["chores"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Terminada ayer",
      member_key: "m_ana",
      done: true,
      completed_at: new Date(Date.now() - 86400000).toISOString(),
      position: 0,
      revision: 1,
    },
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Terminada hace cuatro días",
      member_key: "m_ana",
      done: true,
      completed_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      position: 1,
      revision: 1,
    },
  ];
  await backend.install(page);
  await signIn(page);
  await section(page, "Tareas");
  await expect(page.getByRole("button", { name: "Terminada ayer", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Terminada hace cuatro días", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Archivadas", exact: true }).click();
  await page.getByRole("button", { name: "Terminada hace cuatro días", exact: true }).click();
  await page.getByRole("button", { name: "Actuales", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Completar Terminada hace cuatro días", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("shopping survives an offline reload and synchronizes each change once on reconnection", async ({
  page,
  context,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await section(page, "Compras");
  await expect(page.getByRole("status").filter({ hasText: "Lista guardada" })).toBeVisible();
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
  await page.getByLabel("Producto", { exact: true }).fill("Comprado en el mercado");
  await page.getByRole("button", { name: "Añadir producto", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Comprado en el mercado", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Compras sin conexión", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Comprado en el mercado", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Comprado en el mercado", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(backend.writeRequests).toBe(before);
  await context.setOffline(false);
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
  await expect.poll(() => backend.rows["shopping_items"]?.[0]?.["done"]).toBe(true);
  expect(backend.rows["shopping_items"]).toHaveLength(1);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("tablet pairing leaves no adult session and its photo lock screen fills the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockTabletPasskey(page);
  const backend = new HouseholdBackend();
  backend.photos = [0, 1].map((n) => ({
    id: `photo-${n}`,
    path: `${HOME_ID}/photo-${n}.png`,
    position: n,
    url: `https://photos.fixture.invalid/${n}.png`,
  }));
  await backend.install(page);
  await page.route("https://photos.fixture.invalid/*", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Tablet", exact: true }).click();
  await page.getByRole("button", { name: "Vincular con passkey", exact: true }).click();
  const screen = page.getByTestId("tablet-lock-screen");
  await expect(screen).toBeVisible();
  const size = await screen.evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
    x: node.getBoundingClientRect().x,
    y: node.getBoundingClientRect().y,
    innerWidth,
    innerHeight,
  }));
  expect(size).toEqual({
    width: 1024,
    height: 768,
    x: 0,
    y: 0,
    innerWidth: 1024,
    innerHeight: 768,
  });
  await page.getByRole("button", { name: "Mostrar foto 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mostrar foto 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Pausar fotos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reanudar fotos", exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.includes("auth-token")),
    ),
  ).toEqual([]);
  expect(backend.unexpectedRequests).toEqual([]);
});
