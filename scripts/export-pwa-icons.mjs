import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";

// Reuse the approved original artwork; keep app icons opaque for Apple launchers.
const source = (await readFile("site/assets/skendal-symbol.png")).toString("base64");
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
try {
  const page = await browser.newPage();
  await mkdir("public/icons", { recursive: true });
  for (const variant of ["family", "admin"]) {
    for (const [name, size, scale] of [
      ["192", 192, 1],
      ["512", 512, 1],
      ["apple-180", 180, 1],
      ["32", 32, 1],
      ["maskable-512", 512, 0.72],
    ]) {
      const encoded = await page.evaluate(
        async ({ source, size, scale, variant }) => {
          const image = new Image();
          image.src = "data:image/png;base64," + source;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext("2d");
          const inset = (size * (1 - scale)) / 2;
          // A maskable logo must stay entirely inside the central 80% safe circle.
          ctx.drawImage(image, inset, inset, size * scale, size * scale);
          if (variant === "admin") {
            const center = size * (scale < 1 ? 0.67 : 0.72);
            ctx.fillStyle = "#344ED8";
            ctx.beginPath();
            ctx.arc(center, center, size * (scale < 1 ? 0.1 : 0.15), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "white";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `800 ${size * (scale < 1 ? 0.14 : 0.21)}px system-ui,sans-serif`;
            ctx.fillText("A", center, center + size * 0.008);
          }
          const pixels = ctx.getImageData(0, 0, size, size).data;
          if (scale < 1) {
            for (let y = 0; y < size; y++)
              for (let x = 0; x < size; x++) {
                if (
                  pixels[(y * size + x) * 4 + 3] > 16 &&
                  Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4
                )
                  throw new Error("Approved artwork exceeds the maskable safe circle");
              }
          }
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#FAF7F2";
          ctx.fillRect(0, 0, size, size);
          return canvas.toDataURL("image/png").split(",")[1];
        },
        { source, size, scale, variant },
      );
      const png = Buffer.from(encoded, "base64");
      await writeFile(
        `public/icons/${variant === "admin" ? "skendal-admin" : "skendal"}-v1-${name}.png`,
        png,
      );
      if (name === "512" && variant === "family") {
        // Preserve the old URL for installed clients without redrawing the logo.
        await writeFile(
          "public/icon.svg",
          `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><title>Skendal</title><image width="512" height="512" href="data:image/png;base64,${encoded}"/></svg>\n`,
        );
      }
      if (name === "32") {
        const header = Buffer.alloc(22);
        header.writeUInt16LE(1, 2);
        header.writeUInt16LE(1, 4);
        header[6] = header[7] = 32;
        header.writeUInt16LE(1, 10);
        header.writeUInt16LE(32, 12);
        header.writeUInt32LE(png.length, 14);
        header.writeUInt32LE(22, 18);
        await writeFile(
          variant === "admin" ? "public/admin-favicon.ico" : "public/favicon.ico",
          Buffer.concat([header, png]),
        );
      }
    }
  }
  console.log("Exported approved Skendal icons for Android, iOS and browsers.");
} finally {
  await browser.close();
}
