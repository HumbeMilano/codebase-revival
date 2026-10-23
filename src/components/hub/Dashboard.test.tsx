import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { defaultDashboardLayout, type DashboardScope } from "@/lib/dashboard-layout";
import { Dashboard } from "./Dashboard";
import type { HubState } from "./Screens";
import { MEMBERS, setMembers, type Member } from "./data";

vi.mock("@/hooks/use-dashboard-layout");
vi.mock("@/lib/db", () => ({ db: () => ({}) }));
vi.mock("./Screens", () => ({
  Ring: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("./Kiosk", () => ({ Avatar: () => <span /> }));
const adult: Member = { id: "ana", name: "Ana", role: "admin", color: "member-1" };
const scope: DashboardScope = { kind: "account", accountId: "account-a" };
const preference = () => ({
  layout: defaultDashboardLayout(),
  revision: 0,
  loading: false,
  saving: false,
  error: "",
  reload: vi.fn().mockResolvedValue({ layout: defaultDashboardLayout(), revision: 0 }),
  save: vi.fn().mockResolvedValue({ layout: defaultDashboardLayout(), revision: 1 }),
});
const state = (): HubState => ({
  loading: false,
  error: null,
  saving: false,
  lastSavedAt: null,
  refresh: vi.fn(),
  chores: [],
  setChores: vi.fn(),
  items: [],
  setItems: vi.fn(),
  events: [],
  setEvents: vi.fn(),
  notes: [],
  setNotes: vi.fn(),
  bills: [],
  setBills: vi.fn(),
  contributions: [
    { id: "secret", personId: "ana", amount: 42.25, month: "2026-10", date: "2026-10-23" },
  ],
  setContributions: vi.fn(),
});
const originalMembers = [...MEMBERS];
beforeEach(() => {
  setMembers([{ key: "ana", name: "Ana", role: "admin" }]);
  vi.mocked(useDashboardLayout).mockReturnValue(preference());
});
afterEach(() => {
  cleanup();
  MEMBERS.splice(0, MEMBERS.length, ...originalMembers);
  vi.clearAllMocks();
});

describe("dashboard permissions and editing", () => {
  it("hides financial widgets from children and from tablet adult PINs without an adult grant", () => {
    const props = {
      s: state(),
      compact: true,
      now: new Date("2026-10-23T12:00:00"),
      go: vi.fn(),
      onCreate: vi.fn(),
    };
    const { rerender } = render(
      <Dashboard {...props} scope={scope} user={{ ...adult, role: "member" }} />,
    );
    expect(screen.queryByRole("region", { name: "Fondo común" })).not.toBeInTheDocument();
    expect(screen.queryByText("$42.25")).not.toBeInTheDocument();
    const tablet: DashboardScope = { kind: "device", householdId: "home", memberId: "ana" };
    rerender(<Dashboard {...props} scope={tablet} user={adult} />);
    expect(screen.queryByRole("region", { name: "Fondo común" })).not.toBeInTheDocument();
    rerender(<Dashboard {...props} scope={tablet} user={adult} adultAuthorized />);
    expect(screen.getByRole("region", { name: "Fondo común" })).toBeInTheDocument();
    expect(screen.getAllByText("$42.25").length).toBeGreaterThan(0);
  });

  it("does not overwrite a hidden financial preference when a child edits another widget", async () => {
    const prefs = preference();
    vi.mocked(useDashboardLayout).mockReturnValue(prefs);
    render(
      <Dashboard
        s={state()}
        compact
        scope={scope}
        user={{ ...adult, role: "member" }}
        now={null}
        go={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Personalizar" }));
    await screen.findByRole("dialog", { name: "Personalizar inicio" });
    expect(screen.queryByRole("button", { name: "Añadir fondo común" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ocultar fondo común" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar notas" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar inicio" }));
    await waitFor(() => expect(prefs.save).toHaveBeenCalledOnce());
    const saved = prefs.save.mock.calls[0]![0];
    expect(saved.widgets.some((widget: { id: string }) => widget.id === "finance")).toBe(true);
    expect(saved.widgets.some((widget: { id: string }) => widget.id === "notes")).toBe(false);
  });

  it("keeps an empty layout usable and cancelling a reset makes no write", async () => {
    const prefs = preference();
    prefs.layout = { version: 1, widgets: [] };
    prefs.reload.mockResolvedValue({ layout: prefs.layout, revision: 0 });
    vi.mocked(useDashboardLayout).mockReturnValue(prefs);
    render(
      <Dashboard
        s={state()}
        compact
        scope={scope}
        user={adult}
        now={null}
        go={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Añadir widgets" }));
    await screen.findByRole("dialog", { name: "Personalizar inicio" });
    fireEvent.click(screen.getByRole("button", { name: "Restablecer diseño" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(prefs.save).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Tu inicio, a tu manera" })).toBeInTheDocument();
  });
});
