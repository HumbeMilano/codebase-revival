import type { WorkerEnv } from "./app";
import type { KioskWeather } from "../src/lib/weather";
type Entry = {
  temperature: number;
  symbol: string;
  updatedAt: string;
  expires: number;
  modified: string | null;
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty forecast");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw new Error("Forecast too large");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function extract(value: unknown): Pick<Entry, "temperature" | "symbol" | "updatedAt"> {
  const times = record(record(value)?.["properties"])?.["timeseries"];
  if (!Array.isArray(times) || times.length > 400) throw new Error("Invalid forecast");
  const candidates = times
    .map(record)
    .filter(
      (point): point is Record<string, unknown> =>
        !!point &&
        typeof point["time"] === "string" &&
        Math.abs(Date.parse(point["time"]) - Date.now()) <= 90 * 60 * 1000,
    )
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a["time"] as string) - Date.now()) -
        Math.abs(Date.parse(b["time"] as string) - Date.now()),
    );
  const point = candidates[0],
    data = record(point?.["data"]),
    instant = record(record(data?.["instant"])?.["details"]);
  const temperature = instant?.["air_temperature"];
  const period = record(data?.["next_1_hours"]) ?? record(data?.["next_6_hours"]);
  const symbol = record(period?.["summary"])?.["symbol_code"];
  if (
    typeof temperature !== "number" ||
    !Number.isFinite(temperature) ||
    temperature < -100 ||
    temperature > 70 ||
    typeof symbol !== "string" ||
    !/^[a-z_]{1,80}$/.test(symbol) ||
    !point
  )
    throw new Error("Invalid weather values");
  return { temperature, symbol, updatedAt: point["time"] as string };
}
export async function weatherResponse(
  request: Request,
  env: WorkerEnv,
  context?: ExecutionContext,
): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Método no permitido." }, 405);
  const url = new URL(request.url),
    origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site")
    return json({ error: "Origen no permitido." }, 403);
  const cf = request.cf;
  const lat = Number(cf?.latitude),
    lon = Number(cf?.longitude),
    ip = request.headers.get("CF-Connecting-IP");
  if (
    !cf?.latitude ||
    !cf.longitude ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    !ip ||
    !env.WEATHER_RATE
  )
    return json({ error: "Clima no disponible." }, 503);
  try {
    const allowed = await env.WEATHER_RATE.limit({ key: `weather:${ip}` });
    if (!allowed.success)
      return json({ error: "Espera un momento antes de actualizar el clima." }, 429);
    // The application payload contains only a coarse grid and fresh service headers.
    // Never copy incoming authorization, photos or household identifiers to this request.
    const latitude = lat.toFixed(1),
      longitude = lon.toFixed(1);
    const cache = typeof caches !== "undefined" ? await caches.open("homehub-weather-v1") : null;
    const key = new Request(`${url.origin}/__weather-grid/${latitude}/${longitude}`);
    const stored = await cache?.match(key);
    let entry: Entry | null = stored ? ((await stored.json()) as Entry) : null;
    if (!entry || entry.expires <= Date.now()) {
      const headers = new Headers({
        "User-Agent": "SkendalHomeHub/1.0 (https://github.com/HumbeMilano/codebase-revival)",
        Accept: "application/json",
      });
      if (entry?.modified) headers.set("If-Modified-Since", entry.modified);
      const forecast = await fetch(
        `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      const expiry = Date.parse(forecast.headers.get("expires") ?? "");
      const expires =
        Number.isFinite(expiry) && expiry > Date.now() ? expiry : Date.now() + 15 * 60 * 1000;
      if (forecast.status === 304 && entry) entry = { ...entry, expires };
      else if (forecast.ok)
        entry = {
          ...extract(await boundedJson(forecast)),
          expires,
          modified: forecast.headers.get("last-modified"),
        };
      else throw new Error("Forecast unavailable");
      if (cache) {
        const put = cache.put(
          key,
          Response.json(entry, { headers: { "Cache-Control": "public,max-age=86400" } }),
        );
        if (context) context.waitUntil(put);
        else await put;
      }
    }
    if (Math.abs(Date.now() - Date.parse(entry.updatedAt)) > 2 * 60 * 60 * 1000)
      throw new Error("Forecast expired");
    const location = typeof cf.city === "string" ? cf.city.slice(0, 120) : "";
    const value: KioskWeather = {
      temperature: entry.temperature,
      symbol: entry.symbol,
      location,
      updatedAt: entry.updatedAt,
    };
    return json(value);
  } catch {
    return json({ error: "Clima no disponible." }, 503);
  }
}
