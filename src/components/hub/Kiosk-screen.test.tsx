import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Kiosk } from "./Kiosk";
const photos = vi.hoisted(() => ({
  photos: [] as { id: string; path: string; position: number; url: string }[],
  loading: false,
  error: "",
  refresh: vi.fn(),
}));
vi.mock("@/lib/household-photos", () => ({ useHouseholdPhotos: () => photos }));
vi.mock("@/hooks/use-kiosk-weather", () => ({
  useKioskWeather: () => ({
    weather: {
      temperature: 23.2,
      symbol: "clearsky_day",
      location: "Ciudad de prueba",
      updatedAt: new Date().toISOString(),
    },
    error: false,
  }),
}));
beforeEach(() => {
  vi.useFakeTimers();
  photos.photos = [{ id: "one", path: "home/one.jpg", position: 0, url: "blob:private-photo" }];
  photos.loading = false;
  photos.error = "";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("tablet photo lock stages", () => {
  it("starts with photos only, reveals data for ten seconds and opens only the PIN on a second tap", () => {
    render(<Kiosk compact={false} onUnlock={vi.fn()} />);
    const root = screen.getByTestId("tablet-lock-screen");
    expect(root).toHaveAttribute("data-stage", "photos");
    expect(screen.queryByRole("region", { name: "Próximos eventos" })).not.toBeInTheDocument();
    expect(screen.getByTestId("lock-photo")).toHaveAttribute("src", "blob:private-photo");
    expect(root.querySelector('img[src*="kiosk-photo"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar información" }));
    expect(root).toHaveAttribute("data-stage", "info");
    expect(screen.getByRole("region", { name: "Próximos eventos" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Clima cerca de Ciudad de prueba" }),
    ).toHaveTextContent("23°C");
    act(() => vi.advanceTimersByTime(9999));
    expect(root).toHaveAttribute("data-stage", "info");
    act(() => vi.advanceTimersByTime(1));
    expect(root).toHaveAttribute("data-stage", "photos");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar información" }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar con PIN" }));
    expect(root).toHaveAttribute("data-stage", "pin");
    expect(screen.getByRole("group", { name: "PIN de 4 números" })).toBeVisible();
    expect(document.querySelector('input,textarea,[contenteditable="true"]')).toBeNull();
    act(() => vi.advanceTimersByTime(15000));
    expect(root).toHaveAttribute("data-stage", "pin");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(root).toHaveAttribute("data-stage", "photos");
  });
  it("keeps entry usable while private photos are loading without showing a stock image", () => {
    photos.photos = [];
    photos.loading = true;
    render(<Kiosk compact onUnlock={vi.fn()} />);
    expect(screen.queryByTestId("lock-photo")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Cargando fotos" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar información" }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar con PIN" }));
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
