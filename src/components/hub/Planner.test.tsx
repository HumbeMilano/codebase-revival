import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FamilyCalendar, FamilyNotes } from "./Planner";
import { MEMBERS, setMembers } from "./data";

vi.mock("./VoiceInput", () => ({ VoiceInput: () => null }));
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
