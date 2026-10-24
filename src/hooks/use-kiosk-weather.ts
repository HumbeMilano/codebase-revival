import { useEffect, useState } from "react";
import type { KioskWeather } from "@/lib/weather";
let cached: { value: KioskWeather; expires: number } | null = null;
export function useKioskWeather() {
  const [weather, setWeather] = useState<KioskWeather | null>(() =>
    cached && cached.expires > Date.now() ? cached.value : null,
  );
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    const load = async () => {
      if (pending || document.visibilityState === "hidden") return;
      if (cached && cached.expires > Date.now()) {
        setWeather(cached.value);
        return;
      }
      pending = true;
      try {
        const response = await fetch("/api/weather", {
          signal: controller.signal,
          credentials: "omit",
        });
        if (!response.ok) throw new Error("Weather unavailable");
        const value = (await response.json()) as KioskWeather;
        if (
          typeof value.temperature !== "number" ||
          !Number.isFinite(value.temperature) ||
          value.temperature < -100 ||
          value.temperature > 70 ||
          typeof value.symbol !== "string" ||
          !/^[a-z_]{1,80}$/.test(value.symbol) ||
          typeof value.location !== "string" ||
          value.location.length > 120 ||
          !Number.isFinite(Date.parse(value.updatedAt)) ||
          Math.abs(Date.now() - Date.parse(value.updatedAt)) > 2 * 60 * 60 * 1000
        )
          throw new Error("Invalid weather");
        if (!active) return;
        cached = { value, expires: Date.now() + 15 * 60 * 1000 };
        setWeather(value);
        setError(false);
      } catch {
        if (active) {
          setWeather(null);
          setError(true);
        }
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15 * 60 * 1000);
    const refresh = () => void load();
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return { weather, error };
}
