import { describe, expect, it } from "vitest";
import {
  addShoppingItem,
  restoreShoppingItem,
  shoppingSuggestions,
  sortShoppingItems,
} from "./shopping";
import type { ShopItem } from "@/components/hub/data";

const product = (
  id: string,
  name: string,
  done: boolean,
  position: number,
  listId = "home",
): ShopItem => ({ id, name, done, position, listId, revision: 2 });

describe("shopping order and reuse", () => {
  it("shows pending oldest first and retains the age when checking and reusing a product", () => {
    const items = [
      product("new", "Picadillo", false, 3),
      product("first", "Pan", true, 0),
      product("old", "Huevos", false, 1),
    ];
    expect(sortShoppingItems(items).map((item) => item.id)).toEqual(["old", "new", "first"]);
    const reused = addShoppingItem(items, product("unused", " pan ", false, 99));
    expect(sortShoppingItems(reused).map((item) => item.id)).toEqual(["first", "old", "new"]);
    expect(reused.find((item) => item.id === "first")).toEqual({ ...items[1], done: false });
    expect(items[1]?.done).toBe(true);
    expect(items.map((item) => item.id)).toEqual(["new", "first", "old"]);
  });
  it("keeps legacy insertion order without positions and uses a stable order for ties", () => {
    const items: ShopItem[] = [
      { id: "a", name: "Pan", done: true },
      { id: "b", name: "Huevos", done: false },
      { id: "c", name: "Picadillo", done: false },
    ];
    expect(sortShoppingItems(items).map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(
      sortShoppingItems(items.map((item) => ({ ...item, position: 0 }))).map((item) => item.id),
    ).toEqual(["b", "c", "a"]);
  });
  it("does not change or duplicate a pending item, but permits the same name on another list", () => {
    const items = [product("one", "Pan", false, 4)];
    expect(addShoppingItem(items, product("unused", " PAN ", false, 8))).toBe(items);
    const next = addShoppingItem(items, {
      id: "school",
      name: "Pan",
      done: false,
      listId: "school",
    });
    expect(next).toHaveLength(2);
    expect(next[1]?.position).toBe(5);
    expect(addShoppingItem(items, product("blank", "   ", false, 8))).toBe(items);
  });
  it("reuses a legacy product without listId only in the original list", () => {
    const old: ShopItem = { id: "original", name: "Pan", done: true, revision: 3 };
    const next = addShoppingItem([old], product("unused", "pan", false, 6), "home");
    expect(next).toEqual([{ ...old, done: false }]);
    expect(
      addShoppingItem([old], product("school", "Pan", false, 6, "school"), "home"),
    ).toHaveLength(2);
  });
  it("matches progressively by prefix, case and accents using actual saved names", () => {
    const items = [
      product("p", "Pan", false, 0),
      product("h", "Huevos", false, 1),
      product("pi", "Picadillo", true, 2),
      product("pl", "Plátanos", false, 3),
    ];
    expect(shoppingSuggestions(items, "p").map((item) => item.name)).toEqual([
      "Pan",
      "Plátanos",
      "Picadillo",
    ]);
    expect(shoppingSuggestions(items, " PI ").map((item) => item.name)).toEqual(["Picadillo"]);
    expect(shoppingSuggestions(items, "plata").map((item) => item.name)).toEqual(["Plátanos"]);
    expect(shoppingSuggestions(items, "")).toEqual([]);
    expect(shoppingSuggestions(items, "huevitos")).toEqual([]);
  });
  it("undo preserves the deleted state and never reactivates a concurrent replacement", () => {
    const removed = product("old", "Pan", true, 1);
    expect(restoreShoppingItem([], removed)).toEqual([removed]);
    const existing = [product("replacement", "Pan", true, 5)];
    expect(restoreShoppingItem(existing, removed)).toBe(existing);
  });
});
