import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve("dist");
const files = [];
const digest = createHash("sha256");
// Legacy framework builds emitted a redirect to an obsolete SSR deployment.
// This project now publishes the SPA and the explicit Worker in wrangler.jsonc.
await rm(path.resolve(".wrangler/deploy/config.json"), { force: true });

// Each origin starts with its own install metadata before any JavaScript runs.
const familyHtml = await readFile(path.join(root, "index.html"), "utf8");
const adminHtml = familyHtml
  .replaceAll('content="Skendal"', 'content="Skendal Admin"')
  .replace("<title>Skendal</title>", "<title>Skendal Admin</title>")
  .replaceAll("/icons/skendal-v1-", "/icons/skendal-admin-v1-")
  .replace(
    "Skendal: tareas, compras, calendario y gastos para organizar tu hogar.",
    "Skendal Admin: administración de hogares, cuentas y operaciones del servicio.",
  );
await writeFile(path.join(root, "admin-shell.html"), adminHtml);

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if ((await stat(file)).size > 25 * 1024 * 1024) {
      throw new Error(`Cloudflare Free asset exceeds 25 MiB: ${file}`);
    }
    if (
      entry.isFile() &&
      !["_headers", "_redirects", "sw.js", "admin-sw.js"].includes(entry.name)
    ) {
      files.push("/" + path.relative(root, file).split(path.sep).join("/"));
      digest.update(await readFile(file));
    }
  }
}

await inspect(root);
// Public immutable assets can be requested with different Origin headers by
// module loaders. A server's Vary: Origin must not hide the precached copy.
const version = digest.digest("hex").slice(0, 16);
const adminAsset = (file) =>
  file.startsWith("/icons/skendal-admin-") ||
  ["/admin-shell.html", "/admin.webmanifest", "/admin-favicon.ico"].includes(file);
for (const admin of [false, true]) {
  const selected = admin
    ? [
        ...files.filter(
          (file) => file.startsWith("/assets/") || file.startsWith("/icons/skendal-admin-"),
        ),
        "/admin-shell.html",
        "/manifest.webmanifest",
        "/favicon.ico",
      ]
    : files.filter((file) => !adminAsset(file));
  const prefix = admin ? "skendal-admin-shell-" : "homehub-shell-";
  const cache = prefix + version;
  // Cloudflare canonicalizes /index.html to /. Browsers reject a redirected
  // cached Response for a navigation, so restore it through a fresh Response.
  await writeFile(
    path.join(root, admin ? "admin-sw.js" : "sw.js"),
    `
const CACHE=${JSON.stringify(cache)}, ASSETS=${JSON.stringify(selected)}, PREFIX=${JSON.stringify(prefix)}, SHELL=${JSON.stringify(admin ? "/admin-shell.html" : "/index.html")};
self.addEventListener("install",event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting();})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{const names=(await caches.keys()).filter(name=>name.startsWith(PREFIX)).reverse();const keep=new Set([CACHE,...names.filter(name=>name!==CACHE).slice(0,2)]);await Promise.all(names.filter(name=>!keep.has(name)).map(name=>caches.delete(name)));await self.clients.claim();})()));
async function offlineShell(){const response=await(await caches.open(CACHE)).match(SHELL,{ignoreVary:true});if(!response)return Response.error();return response.redirected?new Response(response.body,{status:response.status,statusText:response.statusText,headers:response.headers}):response;}
self.addEventListener("fetch",event=>{const request=event.request,url=new URL(request.url);if(request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;if(request.mode==="navigate"){event.respondWith(fetch(request).catch(offlineShell));return;}if(url.pathname.startsWith("/assets/")||ASSETS.includes(url.pathname))event.respondWith((async()=>{const cache=await caches.open(CACHE);const current=await cache.match(request,{ignoreVary:true});if(current)return current;/* Old hashed chunks may still belong to an open form; mutable metadata must use this version. */if(url.pathname.startsWith("/assets/")){const previous=await caches.match(request,{ignoreVary:true});if(previous)return previous;}const response=await fetch(request);if(response.ok&&url.pathname.startsWith("/assets/"))await cache.put(request,response.clone());return response;})());});
`,
  );
}
console.log("Static deployment checked against Cloudflare Free asset limits.");
