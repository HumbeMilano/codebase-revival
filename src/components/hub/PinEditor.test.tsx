import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PinEditor } from "./PinEditor";

afterEach(cleanup);
describe("PIN creation without account credential fields", () => {
  it("accepts taps and keyboard edits, masks digits and commits only on confirmation", () => {
    const changed = vi.fn(),
      submitted = vi.fn();
    render(
      <form onSubmit={submitted}>
        <PinEditor label="Tu PIN" value="" onChange={changed} />
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tu PIN" }));
    const group = screen.getByRole("group", { name: "PIN de 4 números" });
    expect(document.activeElement).toBe(group);
    expect(document.querySelector("input, textarea, [contenteditable='true']")).toBeNull();
    fireEvent.keyDown(group, { key: "a" });
    fireEvent.keyDown(group, { key: "9" });
    fireEvent.keyDown(group, { key: "Backspace" });
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.keyDown(group, { key: "4" });
    fireEvent.keyDown(group, { key: "6" });
    expect(screen.getByRole("button", { name: "Usar PIN" })).toBeDisabled();
    fireEvent.keyDown(group, { key: "8" });
    fireEvent.keyDown(group, { key: "5" });
    expect(changed).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("2468");
    fireEvent.click(screen.getByRole("button", { name: "Usar PIN" }));
    expect(changed).toHaveBeenCalledExactlyOnceWith("2468");
    expect(submitted).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("discards cancelled drafts and can leave an optional PIN unchanged", () => {
    const changed = vi.fn();
    render(<PinEditor label="PIN nuevo" value="2468" onChange={changed} optional />);
    const trigger = screen.getByRole("button", { name: "PIN nuevo" });
    expect(trigger).toHaveAccessibleDescription("4 números configurados");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Usar PIN" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mantener PIN actual" }));
    expect(changed).toHaveBeenCalledExactlyOnceWith("");
    expect(document.querySelector("input")).toBeNull();
  });
  it("does not open or change the PIN while its form is saving", () => {
    const changed = vi.fn();
    render(<PinEditor label="Tu PIN" value="" onChange={changed} disabled />);
    const trigger = screen.getByRole("button", { name: "Tu PIN" });
    fireEvent.click(trigger);
    expect(trigger).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });
});
