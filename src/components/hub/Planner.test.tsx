import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FamilyCalendar, FamilyNotes } from "./Planner";
import { MEMBERS, setMembers } from "./data";

vi.mock("./Kiosk", () => ({ Avatar: () => <span>avatar</span> }));
const user = { id: "ana", name: "Ana", role: "admin" as const, color: "member-1" };
beforeEach(() => {
  setMembers([{ key: "ana", name: "Ana", role: "admin" }]);
});
afterEach(() => {
  cleanup();
  MEMBERS.splice(0);
  vi.useRealTimers();
});

describe("functional planner", () => {
  it("does not close the next note when an earlier save finishes after navigation", async () => {
    const notes = [
      { id: "a", title: "First", body: "First body", memberId: "ana", pinned: false },
      { id: "b", title: "Second", body: "Second body", memberId: "ana", pinned: false },
    ];
    let finish!: (value: boolean) => void;
    const save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const onNoteChange = vi.fn();
    const { rerender } = render(
      <FamilyNotes
        compact
        notes={notes}
        setNotes={save}
        user={user}
        initialNoteId="a"
        onNoteChange={onNoteChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    rerender(
      <FamilyNotes
        compact
        notes={notes}
        setNotes={save}
        user={user}
        initialNoteId="b"
        onNoteChange={onNoteChange}
      />,
    );
    expect(screen.getByLabelText("Contenido")).toHaveValue("Second body");
    finish(true);
    await waitFor(() => expect(screen.getByLabelText("Contenido")).toHaveValue("Second body"));
    expect(onNoteChange).not.toHaveBeenCalled();
  });
  it("preserves an open note draft during a data refresh and closes it when its route clears", () => {
    const note = { id: "a", title: "First", body: "Original", memberId: "ana", pinned: false };
    const save = vi.fn();
    const change = vi.fn();
    const { rerender } = render(
      <FamilyNotes
        compact
        notes={[note]}
        setNotes={save}
        user={user}
        initialNoteId="a"
        onNoteChange={change}
      />,
    );
    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "Unsaved" } });
    rerender(
      <FamilyNotes
        compact
        notes={[{ ...note }]}
        setNotes={save}
        user={user}
        initialNoteId="a"
        onNoteChange={change}
      />,
    );
    expect(screen.getByLabelText("Contenido")).toHaveValue("Unsaved");
    rerender(
      <FamilyNotes compact notes={[note]} setNotes={save} user={user} onNoteChange={change} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("a late event save cannot close a different event opened by browser navigation", async () => {
    const events = [
      { id: "a", title: "First", date: "2028-06-09", time: "10:00", note: "", memberId: "ana" },
      { id: "b", title: "Second", date: "2028-07-10", time: "11:00", note: "", memberId: "ana" },
    ];
    let finish!: (value: boolean) => void;
    const save = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const change = vi.fn();
    const { rerender } = render(
      <FamilyCalendar
        compact
        events={events}
        setEvents={save}
        user={user}
        initialEventId="a"
        onEventChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    rerender(
      <FamilyCalendar
        compact
        events={events}
        setEvents={save}
        user={user}
        initialEventId="b"
        onEventChange={change}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveValue("Second"));
    finish(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled());
    expect(screen.getByLabelText("Título")).toHaveValue("Second");
    expect(change).not.toHaveBeenCalled();
  });
  it("opens a selected future event in its own month without changing the original", () => {
    const event = {
      id: "future",
      title: "Reunión",
      date: "2028-06-09",
      time: "10:00",
      note: "Llevar fotos",
      memberId: "ana",
      revision: 4,
    };
    render(
      <FamilyCalendar
        compact
        events={[event]}
        setEvents={vi.fn()}
        user={user}
        initialEventId="future"
      />,
    );
    expect(screen.getByLabelText("Título")).toHaveValue("Reunión");
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Edición sin guardar" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("heading", { name: "junio de 2028" })).toBeInTheDocument();
    expect(event.title).toBe("Reunión");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("opens the selected existing note and preserves its revision on save", async () => {
    const note = {
      id: "note",
      title: "Llaves",
      body: "En el cajón",
      memberId: "ana",
      pinned: true,
      revision: 5,
    };
    const save = vi.fn().mockResolvedValue(true);
    render(<FamilyNotes compact notes={[note]} setNotes={save} user={user} initialNoteId="note" />);
    expect(screen.getByLabelText("Contenido")).toHaveValue("En el cajón");
    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "En la entrada" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const apply = save.mock.calls[0]![0] as (notes: (typeof note)[]) => (typeof note)[];
    expect(apply([note])[0]).toMatchObject({ id: "note", body: "En la entrada", revision: 5 });
  });
  it("opens the current local month instead of a fixed demo date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 5, 9, 12));
    render(<FamilyCalendar compact events={[]} setEvents={vi.fn()} user={user} />);
    expect(screen.getByRole("heading", { name: "junio de 2027" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Día 9" })).toHaveAttribute("aria-pressed", "true");
  }, 20000);
  it("keeps a failed note draft open so the user can retry without losing content", async () => {
    const save = vi.fn().mockResolvedValue(false);
    render(<FamilyNotes compact notes={[]} setNotes={save} user={user} createRequest={1} />);
    const title = await screen.findByLabelText("Título");
    fireEvent.change(title, { target: { value: "Important note" } });
    fireEvent.change(screen.getByLabelText("Contenido"), {
      target: { value: "Do not lose this text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(screen.getByRole("dialog", { name: "Nueva nota" })).toBeInTheDocument();
    expect(screen.getByLabelText("Contenido")).toHaveValue("Do not lose this text");
  }, 20000);
  it("quick create opens a real calendar editor and closes after confirmed persistence", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<FamilyCalendar compact events={[]} setEvents={save} user={user} createRequest={1} />);
    fireEvent.change(await screen.findByLabelText("Título"), { target: { value: "Dentist" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledOnce();
  }, 20000);
});
