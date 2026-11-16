import type { ShopItem } from "@/components/hub/data";

const productName = (name: string) => name.trim().toLocaleLowerCase("es");
const listId = (item: ShopItem, defaultListId?: string) => item.listId ?? defaultListId;
const sameProduct = (a: ShopItem, b: ShopItem, defaultListId?: string) =>
  listId(a, defaultListId) === listId(b, defaultListId) &&
  productName(a.name) === productName(b.name);

/** Pending products first; each group keeps its original insertion order. */
export function sortShoppingItems(items: ShopItem[]): ShopItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(a.item.done) - Number(b.item.done) ||
        (a.item.position ?? a.index) - (b.item.position ?? b.index) ||
        a.index - b.index,
    )
    .map(({ item }) => item);
}

export function shoppingSuggestions(items: ShopItem[], query: string): ShopItem[] {
  const searchName = (name: string) => productName(name).normalize("NFD").replace(/\p{M}/gu, "");
  const prefix = searchName(query);
  return prefix
    ? sortShoppingItems(items)
        .filter((item) => searchName(item.name).startsWith(prefix))
        .slice(0, 8)
    : [];
}

/** Asking for an existing product reuses it, including its age, ID and revision. */
export function addShoppingItem(
  items: ShopItem[],
  item: ShopItem,
  defaultListId?: string,
): ShopItem[] {
  if (!item.name.trim()) return items;
  const existing = items.find((row) => sameProduct(row, item, defaultListId));
  if (existing)
    return existing.done
      ? items.map((row) => (row.id === existing.id ? { ...row, done: false } : row))
      : items;
  return restoreShoppingItem(items, item, defaultListId);
}

/** Undo restores the removed state without changing a replacement added meanwhile. */
export function restoreShoppingItem(
  items: ShopItem[],
  item: ShopItem,
  defaultListId?: string,
): ShopItem[] {
  const name = item.name.trim();
  if (!name || items.some((existing) => sameProduct(existing, item, defaultListId))) return items;
  const position = item.position ?? Math.max(-1, ...items.map((row, i) => row.position ?? i)) + 1;
  return [...items, { ...item, name, position }];
}
