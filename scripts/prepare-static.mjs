import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve("dist");
const files = [];
const digest = createHash("sha256");
// Legacy framework builds emitted a redirect to an obsolete SSR deployment.
// This project now publishes the SPA and the explicit Worker in wrangler.jsonc.
await rm(path.resolve(".wrangler/deploy/config.json"), { force: true });

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if ((await stat(file)).size > 25 * 1024 * 1024) {
      throw new Error(`Cloudflare Free asset exceeds 25 MiB: ${file}`);
    }
    if (entry.isFile() && !["_headers", "_redirects", "sw.js"].includes(entry.name)) {
      files.push("/" + path.relative(root, file).split(path.sep).join("/"));
      digest.update(await readFile(file));
    }
  }
}

await inspect(root);
// Public immutable assets can be requested with different Origin headers by
// module loaders. A server's Vary: Origin must not hide the precached copy.
const cache = "homehub-shell-" + digest.digest("hex").slice(0, 16);
await writeFile(
  path.join(root, "sw.js"),
  `
const CACHE=${JSON.stringify(cache)}, ASSETS=${JSON.stringify(files)};
self.addEventListener("install",event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting();})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{const names=(await caches.keys()).filter(name=>name.startsWith("homehub-shell-")).reverse();const keep=new Set([CACHE,...names.filter(name=>name!==CACHE).slice(0,2)]);await Promise.all(names.filter(name=>!keep.has(name)).map(name=>caches.delete(name)));await self.clients.claim();})()));
self.addEventListener("fetch",event=>{const request=event.request,url=new URL(request.url);if(request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;if(request.mode==="navigate"){event.respondWith(fetch(request).catch(()=>caches.open(CACHE).then(cache=>cache.match("/index.html"))));return;}if(url.pathname.startsWith("/assets/")||ASSETS.includes(url.pathname))event.respondWith(caches.match(request,{ignoreVary:true}).then(async cached=>{if(cached)return cached;const response=await fetch(request);if(response.ok&&url.pathname.startsWith("/assets/")){const cache=await caches.open(CACHE);await cache.put(request,response.clone());}return response;}));});
`,
);
console.log("Static deployment checked against Cloudflare Free asset limits.");
