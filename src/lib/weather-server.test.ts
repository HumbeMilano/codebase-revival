// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { weatherResponse } from "../../workers/weather";
import type { WorkerEnv } from "../../workers/app";
const env = {
  WEATHER_RATE: { limit: vi.fn().mockResolvedValue({ success: true }) },
} as unknown as WorkerEnv;
const request = () => {
  const r = new Request("https://app.skendal.com/api/weather", {
    headers: { "CF-Connecting-IP": "198.51.100.2", Authorization: "Bearer private-test-session" },
  });
  Object.defineProperty(r, "cf", {
    value: { latitude: "18.4862", longitude: "-69.9312", city: "Ciudad" },
  });
  return r;
};
const forecast = () => ({
  properties: {
    timeseries: [
      {
        time: new Date().toISOString(),
        data: {
          instant: { details: { air_temperature: 26.3 } },
          next_1_hours: { summary: { symbol_code: "partlycloudy_day" } },
        },
      },
    ],
  },
});
afterEach(() => {
  vi.unstubAllGlobals();
  env.WEATHER_RATE.limit = vi.fn().mockResolvedValue({ success: true });
});
describe("coarse local weather gateway", () => {
  it("forwards only a coarse grid and honours the provider expiry and conditional updates", async () => {
    let saved: Response | null = null;
    const cache = {
      match: vi.fn(async () => saved?.clone()),
      put: vi.fn(async (_key: Request, value: Response) => {
        saved = value.clone();
      }),
    };
    vi.stubGlobal("caches", { open: async () => cache });
    const provider = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(forecast()), {
        headers: {
          Expires: new Date(Date.now() + 60000).toUTCString(),
          "Last-Modified": new Date().toUTCString(),
        },
      }),
    );
    vi.stubGlobal("fetch", provider);
    let result = await weatherResponse(request(), env);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ temperature: 26.3, location: "Ciudad" });
    expect(String(provider.mock.calls[0]![0])).toContain("lat=18.5&lon=-69.9");
    const headers = provider.mock.calls[0]![1]!.headers as Headers;
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("CF-Connecting-IP")).toBe(false);
    result = await weatherResponse(request(), env);
    expect(result.status).toBe(200);
    expect(provider).toHaveBeenCalledTimes(1);
    const stored = (await saved!.json()) as Record<string, unknown>;
    stored["expires"] = Date.now() - 1;
    saved = Response.json(stored);
    provider.mockResolvedValueOnce(
      new Response(null, {
        status: 304,
        headers: { Expires: new Date(Date.now() + 60000).toUTCString() },
      }),
    );
    result = await weatherResponse(request(), env);
    expect(result.status).toBe(200);
    expect((provider.mock.calls[1]![1]!.headers as Headers).has("If-Modified-Since")).toBe(true);
  });
  it("returns an actual unavailable state rather than fake temperatures on missing location or provider failure", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetcher);
    expect(
      (await weatherResponse(new Request("https://app.skendal.com/api/weather"), env)).status,
    ).toBe(503);
    const result = await weatherResponse(request(), env);
    expect(result.status).toBe(503);
    expect(await result.json()).not.toHaveProperty("temperature");
    env.WEATHER_RATE.limit = vi.fn().mockResolvedValue({ success: false });
    expect((await weatherResponse(request(), env)).status).toBe(429);
  });
});
