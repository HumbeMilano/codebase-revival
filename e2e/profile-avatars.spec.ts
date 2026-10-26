import { expect, test, type Page } from "@playwright/test";
import { HouseholdBackend, HOME_ID, section, signIn, openTabletPin, enterPin } from "./backend";
const uid = "20000000-0000-4000-8000-000000000001";
async function png(page: Page, color: string, width = 32, height = 32) {
  return Buffer.from(
    await page.evaluate(
      ({ fill, width, height }) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const x = c.getContext("2d")!;
        x.fillStyle = fill;
        x.fillRect(0, 0, width, height);
        if (height > width) {
          x.fillStyle = "#13375b";
          x.fillRect(0, 0, width, height / 4);
          x.fillStyle = "#7a4170";
          x.fillRect(0, (height * 3) / 4, width, height / 4);
        } else if (width > height) {
          x.fillStyle = "#13375b";
          x.fillRect(0, 0, width / 4, height);
          x.fillStyle = "#7a4170";
          x.fillRect((width * 3) / 4, 0, width / 4, height);
        }
        return c.toDataURL("image/png").split(",")[1]!;
      },
      { fill: color, width, height },
    ),
    "base64",
  );
}
function seed(backend: HouseholdBackend) {
  backend.dashboardPreference = {
    user_id: uid,
    revision: 1,
    layout: {
      version: 3,
      widgets: [
        { id: "family", key: "family", size: "full" },
        { id: "member-summary", key: "summary", size: "wide", memberId: "m_ana" },
      ],
    },
  };
  backend.rows["chores"] = [
    {
      id: crypto.randomUUID(),
      household_id: HOME_ID,
      title: "Tarea de Ana",
      member_key: "m_ana",
      done: false,
      when_label: "Hoy",
      due_date: new Date().toISOString().slice(0, 10),
      position: 0,
      revision: 1,
    },
  ];
}
async function assertImages(page: Page, minimum: number, expected?: string) {
  const icons = page.locator('[data-member-avatar="m_ana"]');
  await expect.poll(() => icons.count()).toBeGreaterThanOrEqual(minimum);
  await expect.poll(() => icons.locator("img").count()).toBe(await icons.count());
  // A portrait must crop inside the circle, rather than grow the implicit grid row
  // and leave the face at the bottom. Landscape images must use the same crop.
  await expect
    .poll(() =>
      icons.evaluateAll((nodes) =>
        nodes.every((node) => {
          const image = node.querySelector("img");
          if (!image) return false;
          const frame = node.getBoundingClientRect(),
            photo = image.getBoundingClientRect();
          const style = getComputedStyle(image);
          return (
            ["x", "y", "width", "height"].every(
              (key) =>
                Math.abs(
                  (frame[key as keyof DOMRect] as number) - (photo[key as keyof DOMRect] as number),
                ) < 0.5,
            ) &&
            style.objectFit === "cover" &&
            style.objectPosition === "50% 50%"
          );
        }),
      ),
    )
    .toBe(true);
  const srcs = await icons
    .locator("img")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLImageElement).src));
  expect(new Set(srcs).size).toBe(1);
  if (expected) expect(srcs[0]).toBe(expected);
  expect(srcs[0]).toMatch(/^blob:/);
  return srcs[0]!;
}
test("changing and removing the personal photo updates every visible profile icon", async ({
  page,
}, testInfo) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await backend.install(page);
  await signIn(page);
  await section(page, "Mi perfil");
  await expect(page.getByLabel("Foto personal", { exact: true })).toBeEnabled();
  await page.getByLabel("Foto personal", { exact: true }).setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: await png(page, "#3c8a75", 96, 288),
  });
  await expect(page.getByAltText("Tu foto", { exact: true })).toBeVisible();
  const first = await assertImages(page, 1);
  await section(page, "Inicio");
  await assertImages(page, 3, first);
  await expect(page.locator('[data-member-avatar="m_nico"] img')).toHaveCount(0);
  await section(page, "Tareas");
  await assertImages(page, 2, first);
  expect(backend.avatarDownloads).toBe(1);
  await section(page, "Mi perfil");
  await expect(page.getByLabel("Foto personal", { exact: true })).toBeEnabled();
  await page.getByLabel("Foto personal", { exact: true }).setInputFiles({
    name: "new.png",
    mimeType: "image/png",
    buffer: await png(page, "#bd7070", 288, 96),
  });
  await expect
    .poll(() => page.locator('[data-member-avatar="m_ana"] img').first().getAttribute("src"))
    .not.toBe(first);
  const next = await assertImages(page, 1);
  await section(page, "Inicio");
  await assertImages(page, 3, next);
  expect(backend.avatarDownloads).toBe(2);
  await page.screenshot({ path: testInfo.outputPath("shared-member-photos.png"), fullPage: true });
  await section(page, "Mi perfil");
  await page.getByRole("button", { name: "Quitar foto", exact: true }).click();
  await expect(page.locator('[data-member-avatar="m_ana"] img')).toHaveCount(0);
  await section(page, "Inicio");
  await expect(page.locator('[data-member-avatar="m_ana"] img')).toHaveCount(0);
  expect(backend.avatarObjects.size).toBe(0);
  expect(backend.profile["avatar_path"]).toBeNull();
  expect(backend.unexpectedRequests).toEqual([]);
});
test("a paired tablet uses the same household photo and clears it on the next profile refresh", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  seed(backend);
  await page.addInitScript(() =>
    localStorage.setItem("homehub-device-token", "fixture-device-token"),
  );
  const path = `${uid}/tablet.png`;
  backend.profile["avatar_path"] = path;
  backend.avatarObjects.set(path, await png(page, "#3c8a75", 96, 288));
  await backend.install(page);
  await page.goto("/");
  await openTabletPin(page);
  await enterPin(page, "1234");
  const first = await assertImages(page, 1);
  await section(page, "Tareas");
  await assertImages(page, 2, first);
  backend.profile["avatar_path"] = null;
  await page.evaluate(() => window.dispatchEvent(new Event("homehub-avatars-changed")));
  await expect(page.locator('[data-member-avatar="m_ana"] img')).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});
