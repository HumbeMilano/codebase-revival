import type { ShopItem } from "@/components/hub/data";

export function addShoppingItem(items: ShopItem[], item: ShopItem): ShopItem[] {
  const name = item.name.trim();
  if (!name || items.some((existing) => existing.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) return items;
  return [...items, { ...item, name }];
}