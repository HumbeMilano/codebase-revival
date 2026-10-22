import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Finance, type FinanceState } from "./Finance";
import { MEMBERS, setMembers } from "./data";
import type { Contribution, LedgerBill } from "@/lib/ledger";

vi.mock("./Kiosk", () => ({ Avatar: () => <span /> }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
const original = [...MEMBERS];
afterEach(() => {
  cleanup();
  MEMBERS.splice(0, MEMBERS.length, ...original);
});
const state = (bills: LedgerBill[] = []): FinanceState => ({
  bills,
  setBills: vi.fn().mockResolvedValue(true),
  contributions: [],
  setContributions: vi.fn().mockResolvedValue(true),
});
const bill: LedgerBill = {
  id: "bill",
  revision: 7,
  name: "Rent",
  category: "Vivienda",
  base: 100,
  dueDay: 31,
  autoPay: false,
  splits: [{ personId: "real", type: "amount", value: 100 }],
  overrides: {},
};

describe("financial forms", () => {
  it("saves an actual household member and leaves a failed contribution editable", async () => {
    setMembers([{ key: "real", name: "Ana", role: "admin" }]);
    const f = state();
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    f.setContributions = save;
    render(<Finance f={f} compact />);
    fireEvent.click(screen.getByRole("button", { name: /Aporte$/ }));
    expect(screen.getByRole("dialog", { name: "Nuevo aporte" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Monto del aporte"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar aporte" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const apply = save.mock.calls[0]![0] as (rows: Contribution[]) => Contribution[];
    expect(apply([])[0]?.personId).toBe("real");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardar aporte" })).toBeEnabled(),
    );
    expect(screen.getByRole("dialog", { name: "Nuevo aporte" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar aporte" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("requires a valid person and at most two monetary decimals", () => {
    setMembers([]);
    render(<Finance f={state()} compact />);
    fireEvent.click(screen.getByRole("button", { name: /Aporte$/ }));
    fireEvent.change(screen.getByLabelText("Monto del aporte"), { target: { value: "50" } });
    expect(screen.getByRole("button", { name: "Guardar aporte" })).toBeDisabled();
  });

  it("blocks a month override that would leave fixed allocations above its total", () => {
    setMembers([{ key: "real", name: "Ana", role: "admin" }]);
    render(<Finance f={state([bill])} compact />);
    fireEvent.click(screen.getByRole("button", { name: /Rent/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cambiar monto de este mes/ }));
    fireEvent.change(screen.getByLabelText("Monto de este mes"), { target: { value: "50" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Los montos fijos superan");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("preserves mixed splits and the optimistic revision when editing a bill", async () => {
    setMembers([
      { key: "real", name: "Ana", role: "admin" },
      { key: "other", name: "Bruno", role: "admin" },
    ]);
    const f = state([
      {
        ...bill,
        splits: [
          { personId: "real", type: "amount", value: 20 },
          { personId: "other", type: "equal", value: 0 },
        ],
      },
    ]);
    render(<Finance f={f} compact />);
    fireEvent.click(screen.getByRole("button", { name: /Rent/ }));
    fireEvent.click(screen.getByRole("button", { name: /Editar factura recurrente/ }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Updated Rent" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar factura" }));
    await waitFor(() => expect(f.setBills).toHaveBeenCalledOnce());
    const apply = vi.mocked(f.setBills).mock.calls[0]![0] as (rows: LedgerBill[]) => LedgerBill[];
    const saved = apply(f.bills)[0]!;
    expect(saved.revision).toBe(7);
    expect(saved.splits).toEqual(f.bills[0]!.splits);
  });

  it("opens a real editor when a quick-create request arrives", () => {
    setMembers([{ key: "real", name: "Ana", role: "admin" }]);
    const f = state();
    const { rerender } = render(<Finance f={f} compact createRequest={0} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<Finance f={f} compact createRequest={1} />);
    expect(screen.getByRole("dialog", { name: "Nueva factura" })).toBeInTheDocument();
  });
});
