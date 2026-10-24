import { expect, test, type Page } from "@playwright/test";
import { HouseholdBackend, HOME_ID, openTabletPin, enterPin } from "./backend";
async function png(page: Page, width: number, height: number) {
  const data = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#236950";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ecbf58";
      ctx.fillRect(0, 0, width, height / 6);
      ctx.fillStyle = "#d27565";
      ctx.fillRect(0, (height * 5) / 6, width, height / 6);
      return canvas.toDataURL("image/png").split(",")[1]!;
    },
    { width, height },
  );
  return Buffer.from(data, "base64");
}
async function device(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("homehub-device-token", "fixture-device-token"),
  );
}

test("private photos load first, fit both orientations and reveal information then the PIN", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.clock.install();
  await device(page);
  const portrait = await png(page, 600, 1000),
    landscape = await png(page, 1200, 600);
  const backend = new HouseholdBackend();
  backend.photos = [
    {
      id: "portrait",
      path: `${HOME_ID}/portrait.png`,
      position: 0,
      url: "https://photos.fixture.invalid/portrait.png",
    },
    {
      id: "landscape",
      path: `${HOME_ID}/landscape.png`,
      position: 1,
      url: "https://photos.fixture.invalid/landscape.png",
    },
  ];
  const tomorrow = new Date(Date.now() + 86400000);
  backend.rows["events"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Paseo familiar",
      date: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`,
      time: "10:00",
      kind: "event",
      completed: false,
      member_key: "m_ana",
      revision: 1,
    },
  ];
  await backend.install(page);
  let release!: () => void;
  const later = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  await page.route("https://photos.fixture.invalid/portrait.png", (route) =>
    route.fulfill({ contentType: "image/png", body: portrait }),
  );
  await page.route("https://photos.fixture.invalid/landscape.png", async (route) => {
    requested = true;
    await later;
    await route.fulfill({ contentType: "image/png", body: landscape });
  });
  try {
    await page.goto("/");
    const screen = page.getByTestId("tablet-lock-screen"),
      photo = page.getByTestId("lock-photo");
    await expect(screen).toHaveAttribute("data-stage", "photos");
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((node) => (node as HTMLImageElement).naturalHeight))
      .toBe(1000);
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('img[src*="kiosk-photo"]')).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Próximos eventos" })).toHaveCount(0);
    expect(await photo.evaluate((node) => getComputedStyle(node).objectFit)).toBe("contain");
    expect(
      await page
        .getByTestId("lock-photo-backdrop")
        .evaluate((node) => getComputedStyle(node).filter),
    ).toContain("blur");
    expect(
      await screen.evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight })),
    ).toEqual({ width: 1024, height: 768 });
    await page.screenshot({ path: testInfo.outputPath("portrait-photo-landscape-screen.png") });
    await page.getByRole("button", { name: "Mostrar información", exact: true }).click();
    await expect(screen).toHaveAttribute("data-stage", "info");
    await expect(page.getByText("Paseo familiar", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Clima cerca de Ciudad de prueba" }),
    ).toContainText("24°C");
    await page.screenshot({ path: testInfo.outputPath("photo-information-landscape.png") });
    await page.clock.fastForward(10001);
    await expect(screen).toHaveAttribute("data-stage", "photos");
    await page.getByRole("button", { name: "Mostrar información", exact: true }).click();
    await page.getByRole("button", { name: "Entrar con PIN", exact: true }).click();
    await expect(page.getByRole("group", { name: "PIN de 4 números" })).toBeFocused();
    await expect(page.locator('input,textarea,[contenteditable="true"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(screen).toHaveAttribute("data-stage", "photos");
    release();
    await page.getByRole("button", { name: "Mostrar información", exact: true }).click();
    await page.getByRole("button", { name: "Mostrar foto 2", exact: true }).click();
    await expect
      .poll(() => photo.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBe(1200);
    await page.getByRole("button", { name: "Pausar fotos", exact: true }).click();
    await page.clock.fastForward(10001);
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(screen).toHaveAttribute("data-stage", "photos");
    expect(await photo.evaluate((node) => getComputedStyle(node).objectFit)).toBe("contain");
    expect(
      await screen.evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight })),
    ).toEqual({ width: 768, height: 1024 });
    await page.screenshot({ path: testInfo.outputPath("landscape-photo-portrait-screen.png") });
    expect(backend.unexpectedRequests).toEqual([]);
  } finally {
    release();
  }
});

test("locking again reuses the already decoded household photo without a stock flash", async ({
  page,
}) => {
  await device(page);
  const image = await png(page, 1200, 600),
    backend = new HouseholdBackend();
  backend.photos = [
    {
      id: "warm",
      path: `${HOME_ID}/warm.png`,
      position: 0,
      url: "https://photos.fixture.invalid/warm.png",
    },
  ];
  await backend.install(page);
  let downloads = 0;
  await page.route("https://photos.fixture.invalid/warm.png", (route) => {
    downloads++;
    return route.fulfill({ contentType: "image/png", body: image });
  });
  await page.goto("/");
  await expect(page.getByTestId("lock-photo")).toBeVisible();
  const source = await page.getByTestId("lock-photo").getAttribute("src");
  await openTabletPin(page);
  await enterPin(page, "1234");
  await expect(page.getByRole("button", { name: "Personalizar", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Bloquear tablet", exact: true }).click();
  await expect(page.getByTestId("tablet-lock-screen")).toHaveAttribute("data-stage", "photos");
  await expect(page.getByTestId("lock-photo")).toHaveAttribute("src", source!);
  expect(downloads).toBe(1);
  await expect(page.locator('img[src*="kiosk-photo"]')).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
