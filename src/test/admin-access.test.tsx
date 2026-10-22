import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPage } from "../components/admin/AdminPage";

const backend = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  listener: null as ((event: string) => void) | null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: backend.getUser,
      onAuthStateChange: (callback: (event: string) => void) => {
        backend.listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    rpc: backend.rpc,
  },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
  };
});

beforeEach(() => {
  backend.getUser.mockReset().mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  backend.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === "am_platform_admin") return { data: true, error: null };
    if (name === "admin_stats")
      return {
        data: [
          {
            households: 1,
            pro: 0,
            suspended: 0,
            accounts: 1,
            devices: 0,
            new_households_30d: 1,
            new_accounts_30d: 1,
          },
        ],
        error: null,
      };
    if (name === "admin_list_households")
      return {
        data: [
          {
            id: "home",
            name: "Test household",
            plan: "free",
            suspended: false,
            created_at: "2026-01-01",
            members: 1,
            accounts: 1,
            devices: 0,
          },
        ],
        error: null,
      };
    return { data: [], error: null };
  });
});
afterEach(cleanup);

describe("platform administration access", () => {
  it("never offers an ordinary account a bootstrap administrator button", async () => {
    backend.rpc.mockResolvedValue({ data: false, error: null });
    render(<AdminPage />);
    await screen.findByText("Sin acceso");
    expect(screen.queryByRole("button", { name: "Ser administrador" })).not.toBeInTheDocument();
    expect(backend.rpc).toHaveBeenCalledTimes(1);
    expect(backend.rpc).toHaveBeenCalledWith("am_platform_admin");
  });

  it("keeps a failed action visible instead of erasing it by reloading", async () => {
    render(<AdminPage />);
    await screen.findByText("Test household");
    const loadsBefore = backend.rpc.mock.calls.filter(([name]) => name === "admin_stats").length;
    backend.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: "offline" } }));
    fireEvent.click(screen.getByRole("button", { name: "Pasar a Pro" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("La acción no se pudo completar"),
    );
    expect(backend.rpc.mock.calls.filter(([name]) => name === "admin_stats")).toHaveLength(
      loadsBefore,
    );
  });

  it("discards an in-flight authorization result after signing out", async () => {
    let resolveRole: ((value: { data: boolean; error: null }) => void) | undefined;
    backend.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRole = resolve;
        }),
    );
    render(<AdminPage />);
    await waitFor(() => expect(backend.rpc).toHaveBeenCalledWith("am_platform_admin"));
    backend.getUser.mockResolvedValue({ data: { user: null }, error: null });
    act(() => backend.listener?.("SIGNED_OUT"));
    await screen.findByRole("heading", { name: "Administración" });
    await act(async () => {
      resolveRole?.({ data: true, error: null });
    });
    expect(screen.queryByText("Test household")).not.toBeInTheDocument();
    expect(backend.rpc.mock.calls.filter(([name]) => name === "admin_stats")).toHaveLength(0);
  });
});
