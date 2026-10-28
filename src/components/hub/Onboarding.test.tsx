import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupHousehold, Welcome } from "./Onboarding";

const auth = vi.hoisted(() => ({ signIn: vi.fn() }));
const notices = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: auth.signIn } },
}));
vi.mock("sonner", () => ({ toast: notices }));
vi.mock("./Kiosk", () => ({ Avatar: () => null }));
vi.mock("@/lib/tablet-pairing", () => ({
  startTabletPairing: async () => ({
    id: "10000000-0000-4000-8000-000000000001",
    name: "Tablet",
    claimSecret: "a".repeat(64),
    approvalSecret: "b".repeat(64),
    expiresAt: new Date(Date.now() + 300000).toISOString(),
  }),
  pairingClient: () => ({
    rpc: () => ({ abortSignal: async () => ({ data: { status: "pending" }, error: null }) }),
  }),
  pairingLink: () => "https://app.skendal.com/vincular#fixture",
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.clearAllMocks();
});

describe("account entry", () => {
  it("does not assume an unlinked account wants to create a new household", () => {
    render(<SetupHousehold compact email="ana@example.com" onDone={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Acceso a tu cuenta" })).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre del hogar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crear un nuevo hogar" }));
    expect(screen.getByLabelText("Nombre del hogar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a mi cuenta" }));
    expect(screen.queryByLabelText("Nombre del hogar")).not.toBeInTheDocument();
  });
  it("opens a pending invitation directly without showing household creation", () => {
    const code = "ABCDEF0123456789ABCDEF0123456789";
    window.history.replaceState({}, "", `/?invite=${code}`);
    render(<SetupHousehold compact email="ana@example.com" onDone={vi.fn()} />);
    expect(screen.getByLabelText("Código de invitación")).toHaveValue(code);
    expect(screen.queryByLabelText("Nombre del hogar")).not.toBeInTheDocument();
  });
  it("allows retry after a rejected network request and does not remain busy", async () => {
    auth.signIn
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce({ error: null, data: { session: {} } });
    render(<Welcome compact onPaired={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Correo"), { target: { value: "ana@example.com" } });
    expect(screen.getByLabelText("Correo")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Correo")).toHaveAttribute("name", "username");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("autocomplete", "current-password");
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
  it("shows the tablet QR directly without account or passkey setup", async () => {
    render(<Welcome compact onPaired={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tablet" }));
    expect(
      await screen.findByRole("img", { name: "QR para vincular esta tablet" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();
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
