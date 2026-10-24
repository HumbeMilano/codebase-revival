import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardLayout } from "@/hooks/use-dashboard-layout";
import { defaultDashboardLayout, type DashboardScope } from "@/lib/dashboard-layout";
import { Dashboard } from "./Dashboard";
import type { HubState } from "./Screens";
import { HOUSEHOLD, MEMBERS, setMembers, type Member, type ShopItem } from "./data";

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
    const prefs = preference();
    prefs.layout.widgets.push(
      { id: "next-bill", key: "next", size: "compact" },
      { id: "bills", key: "bills", size: "compact" },
      { id: "member-summary", key: "person", size: "compact", memberId: "ana" },
    );
    vi.mocked(useDashboardLayout).mockReturnValue(prefs);
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
    for (const name of ["Próximo vencimiento", "Facturas", "Resumen de miembro"])
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
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
    await screen.findByRole("region", { name: "Personalizar inicio" });
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
    prefs.layout = { version: 3, widgets: [] };
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
    await screen.findByRole("dialog", { name: "Añadir widgets" });
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    await screen.findByRole("region", { name: "Personalizar inicio" });
    fireEvent.click(screen.getByRole("button", { name: "Restablecer diseño" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(prefs.save).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Tu inicio, a tu manera" })).toBeInTheDocument();
  });
});

it("removes financial surfaces immediately when the tablet grant expires during editing", async () => {
  const prefs = preference();
  vi.mocked(useDashboardLayout).mockReturnValue(prefs);
  const props = {
    s: state(),
    compact: true,
    scope: { kind: "device", householdId: "home", memberId: "ana" } as const,
    user: adult,
    now: new Date("2026-10-23T12:00:00"),
    go: vi.fn(),
    onCreate: vi.fn(),
  };
  const { rerender } = render(<Dashboard {...props} adultAuthorized />);
  fireEvent.click(screen.getByRole("button", { name: "Personalizar" }));
  await screen.findByRole("region", { name: "Personalizar inicio" });
  rerender(<Dashboard {...props} adultAuthorized={false} />);
  expect(screen.queryByRole("region", { name: "Fondo común" })).not.toBeInTheDocument();
  expect(screen.queryByText("$42.25")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Guardar inicio" }));
  await waitFor(() => expect(prefs.save).toHaveBeenCalledOnce());
  expect(
    prefs.save.mock.calls[0]![0].widgets.some((widget: { id: string }) => widget.id === "finance"),
  ).toBe(true);
});

it("does not substitute an ordinary note when no note is pinned", () => {
  const prefs = preference();
  prefs.layout = { version: 3, widgets: [{ id: "pinned-note", key: "pinned", size: "compact" }] };
  vi.mocked(useDashboardLayout).mockReturnValue(prefs);
  const s = state();
  s.notes = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      title: "Nota sin fijar",
      body: "Contenido privado de la nota",
      pinned: false,
      memberId: "ana",
    },
  ];
  render(
    <Dashboard
      s={s}
      compact
      scope={scope}
      user={adult}
      now={null}
      go={vi.fn()}
      onCreate={vi.fn()}
    />,
  );
  expect(screen.getByRole("region", { name: "Nota fijada" })).toHaveTextContent("Sin nota fijada");
  expect(screen.queryByText("Nota sin fijar")).not.toBeInTheDocument();
});

it.each(["small", "wide", "full"] as const)(
  "opens the correct dashboard notes at %s size and can browse all notes",
  (size) => {
    const prefs = preference();
    const s = state();
    s.notes = [
      { id: "first", title: "Llaves", body: "En la entrada", memberId: "ana", pinned: true },
      { id: "second", title: "Escuela", body: "Llevar libros", memberId: "ana", pinned: false },
    ];
    prefs.layout = {
      version: 3,
      widgets: [
        { id: "notes", key: "notes", size },
        { id: "pinned-note", key: "pinned", size },
        { id: "specific-note", key: "specific", noteId: "second", size },
      ],
    };
    vi.mocked(useDashboardLayout).mockReturnValue(prefs);
    const go = vi.fn(),
      onOpenRecord = vi.fn();
    render(
      <Dashboard
        s={s}
        compact
        scope={scope}
        user={adult}
        now={null}
        go={go}
        onCreate={vi.fn()}
        onOpenRecord={onOpenRecord}
      />,
    );
    const notes = within(screen.getByRole("region", { name: "Notas" }));
    fireEvent.click(notes.getByRole("button", { name: "Ver todas las notas" }));
    expect(go).toHaveBeenLastCalledWith("notes");
    if (size !== "small") {
      fireEvent.click(notes.getByRole("button", { name: "Abrir nota Escuela" }));
      expect(onOpenRecord).toHaveBeenLastCalledWith("notes", "second");
    }
    fireEvent.click(
      within(screen.getByRole("region", { name: "Nota fijada" })).getByRole("button", {
        name: "Abrir nota Llaves",
      }),
    );
    expect(onOpenRecord).toHaveBeenLastCalledWith("notes", "first");
    fireEvent.click(
      within(screen.getByRole("region", { name: "Nota específica" })).getByRole("button", {
        name: "Abrir nota Escuela",
      }),
    );
    expect(onOpenRecord).toHaveBeenLastCalledWith("notes", "second");
    expect(s.setNotes).not.toHaveBeenCalled();
  },
);

it("starts a real new note from empty note widgets without changing layout preferences", () => {
  const prefs = preference();
  prefs.layout = {
    version: 3,
    widgets: [
      { id: "notes", key: "notes", size: "wide" },
      { id: "specific-note", key: "specific", size: "compact" },
      { id: "pinned-note", key: "pinned", size: "compact" },
    ],
  };
  vi.mocked(useDashboardLayout).mockReturnValue(prefs);
  const onCreate = vi.fn();
  render(
    <Dashboard
      s={state()}
      compact
      scope={scope}
      user={adult}
      now={null}
      go={vi.fn()}
      onCreate={onCreate}
    />,
  );
  for (const name of ["Notas", "Nota específica", "Nota fijada"]) {
    fireEvent.click(
      within(screen.getByRole("region", { name })).getByRole("button", {
        name: "Crear nota",
      }),
    );
    expect(onCreate).toHaveBeenLastCalledWith("notes");
  }
  expect(prefs.save).not.toHaveBeenCalled();
});

it("marks only the chosen shopping list and evaluates repeated taps against current items", () => {
  const prefs = preference();
  const listId = "10000000-0000-4000-8000-000000000091";
  prefs.layout = {
    version: 3,
    widgets: [{ id: "shopping", key: "shopping", size: "wide", listId }],
  };
  vi.mocked(useDashboardLayout).mockReturnValue(prefs);
  const s = state();
  s.shoppingLists = [
    { id: HOUSEHOLD.id, name: "Groceries", archived: false },
    { id: listId, name: "School", archived: false },
  ];
  s.items = [
    { id: "home", listId: HOUSEHOLD.id, name: "Pan", done: false },
    { id: "school", listId, name: "Pan", done: false },
  ];
  const save = vi.fn().mockResolvedValue(true);
  s.setItems = save;
  render(
    <Dashboard
      s={s}
      compact
      scope={scope}
      user={adult}
      now={null}
      go={vi.fn()}
      onCreate={vi.fn()}
    />,
  );
  const checkbox = screen.getByRole("checkbox", { name: "Pan" });
  expect(checkbox).toHaveAttribute("aria-checked", "false");
  fireEvent.click(checkbox);
  fireEvent.click(checkbox);
  expect(save).toHaveBeenCalledTimes(2);
  const apply = save.mock.calls[0]![0] as (rows: ShopItem[]) => ShopItem[];
  const again = save.mock.calls[1]![0] as (rows: ShopItem[]) => ShopItem[];
  const once = apply(s.items);
  expect(once.map((item) => item.done)).toEqual([false, true]);
  expect(again(once).map((item) => item.done)).toEqual([false, false]);
  const moved = s.items.map((item) => ({ ...item, listId: HOUSEHOLD.id }));
  expect(apply(moved)).toEqual(moved);
  expect(prefs.save).not.toHaveBeenCalled();
});

it("shows actual shopping sync conflicts with a route to resolve them", () => {
  const prefs = preference();
  prefs.layout = { version: 3, widgets: [{ id: "shopping", key: "shopping", size: "wide" }] };
  vi.mocked(useDashboardLayout).mockReturnValue(prefs);
  const s = state();
  s.shoppingSync = { householdId: HOUSEHOLD.id, error: "", conflict: true } as NonNullable<
    HubState["shoppingSync"]
  >;
  const go = vi.fn();
  render(
    <Dashboard s={s} compact scope={scope} user={adult} now={null} go={go} onCreate={vi.fn()} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("La lista cambió en otro dispositivo.");
  fireEvent.click(screen.getByRole("button", { name: "Revisar compras" }));
  expect(go).toHaveBeenCalledWith("shopping");
});
