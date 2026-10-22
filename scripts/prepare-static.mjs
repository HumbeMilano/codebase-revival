import { readdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist");
const runtime = JSON.parse(await readFile("node_modules/onnxruntime-web/package.json", "utf8"));
const workerSource = await readFile("src/lib/whisper.worker.ts", "utf8");
const expectedUrl = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${runtime.version}/dist/ort-wasm-simd-threaded.asyncify.wasm`;
if (!workerSource.includes(expectedUrl))
  throw new Error("Whisper CDN runtime must match the installed ONNX version");

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (/^ort-wasm-simd-threaded\.asyncify-.*\.wasm$/.test(entry.name)) {
      // Vite emits this fallback even though wasmPaths uses the pinned CDN.
      await unlink(file);
    } else if ((await stat(file)).size > 25 * 1024 * 1024) {
      throw new Error(`Cloudflare Free asset exceeds 25 MiB: ${file}`);
    }
  }
}

await inspect(root);
console.log("Static deployment checked against Cloudflare Free asset limits.");
