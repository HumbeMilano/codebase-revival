import { expect, test, type Page } from "@playwright/test";
import { HouseholdBackend, signIn, adminSignIn, adminUrl, recoveryPath } from "../e2e/backend";

async function both(page: Page) {
  const household = new HouseholdBackend();
  await household.install(page);
  await signIn(page);
  const admin = await page.context().newPage();
  const administration = new HouseholdBackend();
  administration.platformAdmin = true;
  administration.hasHousehold = false;
  await administration.install(admin);
  await admin.goto(adminUrl(page));
  await expect(admin.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await adminSignIn(admin);
  return { admin, household, administration };
}

test("the two installable PWAs have distinct metadata, icons, workers and offline shells", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await page.goto("/");
  const admin = await page.context().newPage();
  await backend.install(admin);
  await admin.goto(adminUrl(page));
  async function metadata(tab: Page) {
    return tab.evaluate(async () => {
      const manifest = (await (
        await fetch(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href)
      ).json()) as { name: string; id: string; icons: { src: string }[] };
      const registration = await navigator.serviceWorker.ready;
      const worker = await (await fetch("/sw.js")).text();
      const icons = await Promise.all(
        manifest.icons.map(async (icon: { src: string }) => {
          const image = new Image();
          image.src = icon.src;
          await image.decode();
          return image.naturalWidth;
        }),
      );
      return {
        manifest,
        scope: registration.scope,
        worker,
        icons,
        apple: document
          .querySelector('meta[name="apple-mobile-web-app-title"]')
          ?.getAttribute("content"),
      };
    });
  }
  const family = await metadata(page),
    management = await metadata(admin);
  expect(family.manifest.name).toBe("Skendal");
  expect(management.manifest.name).toBe("Skendal Admin");
  expect(family.apple).toBe("Skendal");
  expect(management.apple).toBe("Skendal Admin");
  expect(family.manifest.id).toBe("/");
  expect(management.manifest.id).toBe("/skendal-admin");
  expect(family.scope).not.toBe(management.scope);
  expect(family.worker).toContain("homehub-shell-");
  expect(family.worker).not.toContain("/admin-shell.html");
  expect(management.worker).toContain("skendal-admin-shell-");
  expect(management.worker).not.toContain("/index.html");
  expect(management.icons).toEqual([192, 512, 512]);
  expect(management.manifest.icons[0]!.src).not.toBe(family.manifest.icons[0]!.src);
  for (const tab of [page, admin]) {
    const chrome = await tab.context().newCDPSession(tab);
    await expect
      .poll(async () =>
        (await chrome.send("Page.getInstallabilityErrors")).installabilityErrors.filter(
          (error) => error.errorId !== "in-incognito",
        ),
      )
      .toEqual([]);
  }
});

test("administrator sign-out leaves the household PWA signed in", async ({ page }) => {
  const { admin, administration } = await both(page);
  const sent = admin.waitForRequest((request) => request.url().includes("/auth/v1/logout"));
  await admin.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  expect(new URL((await sent).url()).searchParams.get("scope")).toBe("local");
  await expect(admin.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
  expect(administration.logoutRequests).toBe(1);
});

test("household sign-out leaves the administrator PWA signed in", async ({ page }) => {
  const { admin } = await both(page);
  const sent = page.waitForRequest((request) => request.url().includes("/auth/v1/logout"));
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).first().click();
  expect(new URL((await sent).url()).searchParams.get("scope")).toBe("local");
  await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible();
  await admin.reload();
  await expect(admin.getByText("Skendal · Consola del negocio", { exact: true })).toBeVisible();
});

test("the legacy admin link opens a separate login without copying tokens", async ({ page }) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  const familyOrigin = new URL(page.url()).origin;
  const tab = await page.context().newPage();
  await backend.install(tab);
  await tab.goto(
    familyOrigin + "/admin?code=temporary#access_token=temporary&refresh_token=temporary",
  );
  await expect(tab.getByLabel("Contraseña", { exact: true })).toBeVisible();
  expect(new URL(tab.url()).hostname).toBe("admin.localhost");
  expect(new URL(tab.url()).search).toBe("");
  expect(new URL(tab.url()).hash).toBe("");
  await page.reload();
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
});

test("a household account cannot open administration or household setup from the admin PWA", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await adminSignIn(page, false);
  await expect(page.getByRole("heading", { name: "Sin acceso", exact: true })).toBeVisible();
  await expect(page.getByLabel("Nombre del hogar", { exact: true })).toHaveCount(0);
  await page.goto(new URL("/vincular", page.url()).href);
  await expect(page.getByRole("heading", { name: "Sin acceso", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR para vincular esta tablet" })).toHaveCount(0);
});

test("administrator recovery stays in administration and leaves the household session intact", async ({
  page,
}) => {
  const { admin, administration } = await both(page);
  await admin.goto(adminUrl(admin, recoveryPath()));
  await admin.getByLabel("Nueva contraseña", { exact: true }).fill("changed-synthetic-password");
  await admin.getByLabel("Repetir contraseña", { exact: true }).fill("changed-synthetic-password");
  await admin.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await admin.getByRole("link", { name: "Continuar a Skendal", exact: true }).click();
  await expect(admin.getByText("Skendal · Consola del negocio", { exact: true })).toBeVisible();
  expect(new URL(admin.url()).hostname).toBe("admin.localhost");
  expect(administration.setupRequests).toEqual([]);
  await page.reload();
  await expect(page.getByText("Hola, Ana", { exact: true }).first()).toBeVisible();
});
