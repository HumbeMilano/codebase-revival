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
    expect(screen.getByPlaceholderText("ABCD1234EF56")).toHaveAttribute("maxlength", "12");
    expect(screen.queryByText(/PEREZ1/)).not.toBeInTheDocument();
  });
});
