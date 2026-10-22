import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Welcome } from "./Onboarding";

const auth = vi.hoisted(() => ({ signIn: vi.fn() }));
const notices = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: auth.signIn } },
}));
vi.mock("sonner", () => ({ toast: notices }));
vi.mock("./Kiosk", () => ({ Avatar: () => null }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.clearAllMocks();
});

describe("account entry", () => {
  it("allows retry after a rejected network request and does not remain busy", async () => {
    auth.signIn
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({ error: null, data: { session: {} } });
    render(<Welcome compact onPaired={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "ana@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "password123" } });
    const submit = screen
      .getAllByRole("button", { name: "Entrar" })
      .find((button) => button.getAttribute("type") === "submit")!;
    fireEvent.click(submit);
    await waitFor(() => expect(notices.error).toHaveBeenCalled());
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(2));
  });
  it("shows real pairing instructions without demo credentials", () => {
    render(<Welcome compact onPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tablet" }));
    expect(screen.getByRole("button", { name: "Vincular con passkey" })).toBeInTheDocument();
    expect(screen.getByText(/QR.*Bluetooth/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Código de emparejamiento")).not.toBeInTheDocument();
    expect(screen.queryByText(/PEREZ1/)).not.toBeInTheDocument();
  });
  it("opens invitation links at signup and preserves the recipient and long code", () => {
    const code = "ABCDEF0123456789ABCDEF0123456789";
    window.history.replaceState({}, "", `/?invite=${code}&email=ana%40example.com`);
    render(<Welcome compact onPaired={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Crea tu cuenta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toHaveValue("ana@example.com");
    expect(screen.getByLabelText("Invitación (opcional)")).toHaveValue(code);
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("autocomplete", "new-password");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(screen.getByRole("heading", { name: "Bienvenido" })).toBeInTheDocument();
  });
});
