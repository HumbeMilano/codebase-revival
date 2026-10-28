import { expect, test } from "@playwright/test";
import { HOME_ID, HouseholdBackend, section, signIn } from "./backend";

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
  "base64",
);
const files = ["familia.png", "vacaciones.png", "casa.png"].map((name) => ({
  name,
  mimeType: "image/png",
  buffer: image,
}));

test("one native selection saves several photos and survives reopening the gallery", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  await backend.install(page);
  await signIn(page);
  await section(page, "Fotos");
  const picker = page.getByLabel("Añadir fotos", { exact: true });
  await expect(picker).toHaveAttribute("multiple", "");
  await picker.setInputFiles(files);
  await expect(page.getByRole("status", { name: "Estado de la subida", exact: true })).toHaveText(
    "3 fotos guardadas",
  );
  await expect(page.getByRole("img", { name: /Foto \d+ del hogar/ })).toHaveCount(3);
  expect(backend.photoUploadRequests).toBe(3);
  expect(backend.photoObjects.size).toBe(3);
  expect(backend.photos).toHaveLength(3);
  expect(
    backend.photos.every((photo) =>
      new RegExp(`^${HOME_ID}/[a-f0-9-]+\\.jpg$`).test(String(photo["path"])),
    ),
  ).toBe(true);
  await page.reload();
  await section(page, "Fotos");
  await expect(page.getByRole("img", { name: /Foto \d+ del hogar/ })).toHaveCount(3);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("retry confirms a lost response at full capacity without uploading the batch again", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.photoCapacity = 3;
  backend.losePhotoRegistrationAt = 2;
  await backend.install(page);
  await signIn(page);
  await section(page, "Fotos");
  const picker = page.getByLabel("Añadir fotos", { exact: true });
  await picker.setInputFiles(files);
  await expect(page.getByRole("status", { name: "Estado de la subida", exact: true })).toHaveText(
    "2 de 3 fotos confirmadas",
  );
  await expect(page.getByRole("alert")).toContainText("vacaciones.png");
  await expect(picker).toBeDisabled();
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByRole("status", { name: "Estado de la subida", exact: true })).toHaveText(
    "3 fotos guardadas",
  );
  expect(backend.photoUploadRequests).toBe(3);
  expect(backend.photoRegistrationRequests).toBe(4);
  expect(backend.photos).toHaveLength(3);
  expect(backend.photoObjects.size).toBe(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(backend.unexpectedRequests).toEqual([]);
});

test("an oversized selection uploads nothing and can be replaced by a fitting selection", async ({
  page,
}) => {
  const backend = new HouseholdBackend();
  backend.photoCapacity = 2;
  await backend.install(page);
  await signIn(page);
  await section(page, "Fotos");
  const picker = page.getByLabel("Añadir fotos", { exact: true });
  await picker.setInputFiles(files);
  await expect(page.getByRole("alert")).toContainText("Quedan 2 espacios disponibles");
  expect(backend.photoUploadRequests).toBe(0);
  await picker.setInputFiles(files.slice(0, 2));
  await expect(page.getByRole("status", { name: "Estado de la subida", exact: true })).toHaveText(
    "2 fotos guardadas",
  );
  await expect(picker).toBeDisabled();
  expect(backend.photos).toHaveLength(2);
  expect(backend.unexpectedRequests).toEqual([]);
});
