export type WeatherKind = "clear" | "partly-cloudy" | "cloudy" | "rain" | "snow" | "storm" | "fog";
export type KioskWeather = {
  temperature: number;
  symbol: string;
  location: string;
  updatedAt: string;
};
export function weatherDescription(symbol: string): {
  label: string;
  kind: WeatherKind;
  night: boolean;
} {
  const code = symbol.replace(/_(day|night|polartwilight)$/, ""),
    night = symbol.endsWith("_night");
  if (code.includes("thunder")) return { label: "Tormenta", kind: "storm", night };
  if (code.includes("sleet")) return { label: "Aguanieve", kind: "snow", night };
  if (code.includes("snow")) return { label: "Nieve", kind: "snow", night };
  if (code.includes("rain"))
    return { label: code.includes("showers") ? "Chubascos" : "Lluvia", kind: "rain", night };
  if (code === "fog") return { label: "Niebla", kind: "fog", night };
  if (code === "cloudy") return { label: "Nublado", kind: "cloudy", night };
  if (code === "partlycloudy" || code === "fair")
    return { label: "Parcialmente nublado", kind: "partly-cloudy", night };
  if (code === "clearsky") return { label: "Despejado", kind: "clear", night };
  return { label: "Pronóstico local", kind: "cloudy", night };
}
