import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Shopping } from "./ShoppingLists";
import { HOUSEHOLD, type ShopItem } from "./data";
import type { PersistedSetter } from "@/lib/persisted-collection";

vi.mock("./NativeInputShortcut", () => ({ NativeInputShortcut: () => null }));
const original = { ...HOUSEHOLD };
afterEach(() => {
  cleanup();
  Object.assign(HOUSEHOLD, original);
});

it("keeps a new list draft when an earlier list's acknowledged add finishes", async () => {
  const home = "10000000-0000-4000-8000-000000000001";
  const school = "10000000-0000-4000-8000-000000000002";
  HOUSEHOLD.id = home;
  let resolve!: (saved: boolean) => void;
  const save = vi.fn<PersistedSetter<ShopItem[]>>(
    () =>
      new Promise<boolean>((finish) => {
        resolve = finish;
      }),
  );
  const s = {
    items: [],
    setItems: save,
    shoppingLists: [
      { id: home, name: "Groceries", archived: false },
      { id: school, name: "School", archived: false },
    ],
  };
  const changed = vi.fn();
  const { rerender } = render(
    <Shopping compact s={s} initialListId={home} onListChange={changed} />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Producto" }), {
    target: { value: "Pencils" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Añadir producto" }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  const update = save.mock.calls[0]![0] as (items: ShopItem[]) => ShopItem[];
  expect(update([])[0]).toMatchObject({ listId: home, name: "Pencils" });
  fireEvent.click(screen.getByRole("button", { name: "Abrir lista School" }));
  expect(changed).toHaveBeenCalledWith(school, false);
  rerender(<Shopping compact s={s} initialListId={school} onListChange={changed} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Producto" }), {
    target: { value: "Pencils" },
  });
  await act(async () => resolve(true));
  expect(screen.getByRole("textbox", { name: "Producto" })).toHaveValue("Pencils");
  expect(screen.getByRole("region", { name: "Lista School" })).toBeInTheDocument();
});
