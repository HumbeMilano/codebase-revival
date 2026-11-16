import { useEffect, useId, useRef, useState } from "react";
import { Check, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addShoppingItem, shoppingSuggestions } from "@/lib/shopping";
import { shoppingListId } from "@/lib/offline-shopping";
import { cn } from "@/lib/utils";
import type { PersistedSetter } from "@/lib/persisted-collection";
import type { ShopItem } from "./data";
import { NativeInputShortcut } from "./NativeInputShortcut";

export function ShoppingProductForm({
  items,
  setItems,
  listId,
  householdId,
  disabled = false,
  autoFocus = false,
  focusRequest = 0,
  onBusyChange,
}: {
  items: ShopItem[];
  setItems: PersistedSetter<ShopItem[]>;
  listId: string;
  householdId: string;
  disabled?: boolean;
  autoFocus?: boolean;
  focusRequest?: number;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const inputId = `shopping-product-${id}`;
  const suggestionsId = `shopping-suggestions-${id}`;
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState({ listId, name: "" });
  const name = entry.listId === listId ? entry.name : "";
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const matches = shoppingSuggestions(
    items.filter((item) => shoppingListId(item, householdId) === listId),
    name,
  );
  const showing = open && matches.length > 0;
  const active = matches.findIndex((item) => item.id === activeId);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (autoFocus || focusRequest) input.current?.focus();
  }, [autoFocus, focusRequest]);
  const add = async (value = name) => {
    if (saving.current || disabled || !value.trim()) return;
    const submittedName = name;
    const submittedList = listId;
    const item: ShopItem = {
      id: crypto.randomUUID(),
      name: value.trim(),
      done: false,
      listId: submittedList,
    };
    saving.current = true;
    setBusy(true);
    onBusyChange?.(true);
    try {
      const saved = await setItems((rows) => addShoppingItem(rows, item, householdId));
      if (saved) {
        setEntry((current) =>
          current.listId === submittedList && current.name === submittedName
            ? { ...current, name: "" }
            : current,
        );
        if (input.current?.dataset["listId"] === submittedList) input.current.focus();
      }
    } finally {
      saving.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  return (
    <div ref={root} className="relative">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
        aria-busy={busy}
        className="flex items-center gap-2 rounded-2xl bg-secondary p-2 pl-4"
      >
        <input
          ref={input}
          id={inputId}
          data-list-id={listId}
          role="combobox"
          aria-label="Producto"
          aria-autocomplete="list"
          aria-expanded={showing}
          aria-controls={showing ? suggestionsId : undefined}
          aria-activedescendant={
            showing && matches[active] ? `${suggestionsId}-${active}` : undefined
          }
          autoComplete="off"
          maxLength={150}
          value={name}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setEntry({ listId, name: event.target.value });
            setActiveId(null);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              if (!matches.length) return;
              event.preventDefault();
              setOpen(true);
              const index =
                event.key === "ArrowDown"
                  ? (active + 1) % matches.length
                  : (active <= 0 ? matches.length : active) - 1;
              setActiveId(matches[index]?.id ?? null);
            } else if (event.key === "Enter" && showing && matches[active]) {
              event.preventDefault();
              void add(matches[active].name);
            } else if (event.key === "Escape" && showing) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setActiveId(null);
            } else if (event.key === "Tab") setOpen(false);
          }}
          placeholder="Añadir producto"
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        <NativeInputShortcut targetId={inputId} />
        <Button
          type="submit"
          size="icon"
          aria-label="Añadir producto"
          disabled={busy || disabled || !name.trim()}
          className="size-11 shrink-0 rounded-xl"
        >
          <Plus />
        </Button>
      </form>
      {showing && (
        <div
          role="listbox"
          id={suggestionsId}
          aria-label="Productos existentes"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-2xl border bg-card p-1 shadow-card"
        >
          {matches.map((item, index) => (
            <button
              type="button"
              role="option"
              id={`${suggestionsId}-${index}`}
              key={item.id}
              aria-label={item.name}
              aria-selected={active === index}
              tabIndex={-1}
              disabled={busy || disabled}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-secondary",
                active === index && "bg-secondary",
              )}
              onClick={() => void add(item.name)}
            >
              {item.done ? (
                <RotateCcw className="size-4 shrink-0" />
              ) : (
                <Check className="size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 break-words">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {item.done ? "Volver a pedir" : "En la lista"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
