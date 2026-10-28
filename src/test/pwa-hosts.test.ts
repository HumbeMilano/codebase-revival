import { describe, it, expect, vi } from "vitest";
import worker, { type WorkerEnv } from "../../workers/app";

describe("PWA host routing", () => {
  function assets() {
    const fetch = vi.fn(async (request: Request) => new Response(new URL(request.url).pathname));
    return { fetch, env: { ASSETS: { fetch } } as unknown as WorkerEnv };
  }
  it("serves separate shells, manifests and workers from each origin", async () => {
    const { env } = assets();
    const cases = [
      ["https://app.skendal.com/", "/"],
      ["https://app.skendal.com/manifest.webmanifest", "/manifest.webmanifest"],
      ["https://app.skendal.com/sw.js", "/sw.js"],
      ["https://admin.skendal.com/", "/admin-shell.html"],
      ["https://admin.skendal.com/reset-password", "/admin-shell.html"],
      ["https://admin.skendal.com/manifest.webmanifest", "/admin.webmanifest"],
      ["https://admin.skendal.com/sw.js", "/admin-sw.js"],
    ];
    for (const [url, path] of cases)
      expect(await (await worker.fetch(new Request(url!), env)).text()).toBe(path);
  });
  it("redirects the old admin address without query or fragment credentials", async () => {
    const { env, fetch } = assets();
    const response = await worker.fetch(
      new Request("https://app.skendal.com/admin?code=temporary#access_token=temporary"),
      env,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://admin.skendal.com/#");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not serve the other application's shell or household screens", async () => {
    const { env, fetch } = assets();
    expect(
      (await worker.fetch(new Request("https://app.skendal.com/admin-shell.html"), env)).status,
    ).toBe(404);
    expect(
      (await worker.fetch(new Request("https://admin.skendal.com/vincular"), env)).headers.get(
        "location",
      ),
    ).toBe("/#");
    expect(
      (
        await worker.fetch(
          new Request("https://admin.skendal.com/household", { headers: { accept: "text/html" } }),
          env,
        )
      ).headers.get("location"),
    ).toBe("/#");
    expect(fetch).not.toHaveBeenCalled();
  });
});
