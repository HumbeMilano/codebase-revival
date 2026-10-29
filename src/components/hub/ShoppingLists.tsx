import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { addShoppingItem } from "@/lib/shopping";
import { defaultShoppingList, shoppingListId } from "@/lib/offline-shopping";
import type { HubState } from "./Screens";
import { HOUSEHOLD, type ShopItem, type ShoppingList } from "./data";
import { NativeInputShortcut } from "./NativeInputShortcut";

type ShoppingState = Pick<
  HubState,
  "items" | "setItems" | "shoppingSync" | "shoppingLists" | "setShoppingLists"
>;
export function Shopping({
  s,
  createRequest = 0,
  initialListId,
}: {
  s: ShoppingState;
  compact: boolean;
  createRequest?: number;
  initialListId?: string | undefined;
}) {
  const householdId = s.shoppingSync?.householdId ?? HOUSEHOLD.id;
  const lists = s.shoppingLists?.length ? s.shoppingLists : [defaultShoppingList(householdId)];
  const [selected, setSelected] = useState(initialListId ?? householdId);
  const list =
    lists.find((row) => row.id === selected && !row.archived) ??
    lists.find((row) => !row.archived)!;
  const listId = list?.id ?? householdId;
  const items = s.items.filter((item) => shoppingListId(item, householdId) === listId);
  const activeLists = lists.filter((row) => !row.archived);
  const archived = lists.filter((row) => row.archived);
  const [showArchive, setShowArchive] = useState(false);
  const [editor, setEditor] = useState<{ id: string | null; name: string } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (createRequest) input.current?.focus();
  }, [createRequest]);
  const saveList = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor || busy || !s.setShoppingLists || !editor.name.trim()) return;
    const draft = { ...editor };
    const id = draft.id ?? crypto.randomUUID();
    const value: ShoppingList = {
      id,
      name: draft.name.trim(),
      archived: false,
      position: lists.length,
    };
    setBusy(true);
    const saved = await s.setShoppingLists((rows) =>
      draft.id
        ? rows.map((row) => (row.id === draft.id ? { ...row, name: draft.name.trim() } : row))
        : [...rows, value],
    );
    setBusy(false);
    if (saved) {
      setEditor(null);
      setSelected(id);
      setName("");
    }
  };
  const archive = async (row: ShoppingList, archived: boolean) => {
    if (!s.setShoppingLists || busy) return;
    setBusy(true);
    const saved = await s.setShoppingLists((rows) =>
      rows.map((current) => (current.id === row.id ? { ...current, archived } : current)),
    );
    setBusy(false);
    if (saved && !archived) {
      setSelected(row.id);
      setShowArchive(false);
    }
  };
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    if (
      items.some((row) => row.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase())
    ) {
      toast.info("Ese producto ya está en esta lista.");
      return;
    }
    const submittedName = name;
    const item: ShopItem = {
      id: crypto.randomUUID(),
      name: submittedName.trim(),
      done: false,
      listId,
    };
    setBusy(true);
    const saved = await s.setItems((rows) => addShoppingItem(rows, item));
    setBusy(false);
    if (saved) {
      setName((current) => (current === submittedName ? "" : current));
      input.current?.focus();
    }
  };
  const remove = async (item: ShopItem) => {
    if (!(await s.setItems((rows) => rows.filter((row) => row.id !== item.id)))) return;
    toast(`"${item.name}" eliminado`, {
      action: {
        label: "Deshacer",
        onClick: () => {
          void s.setItems((rows) =>
            addShoppingItem(rows, {
              id: item.id,
              name: item.name,
              done: item.done,
              listId: shoppingListId(item, householdId),
            }),
          );
        },
      },
    });
  };
  const sync = s.shoppingSync;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">Mis listas</h2>
        <Button
          type="button"
          className="rounded-full"
          disabled={!s.setShoppingLists || busy}
          onClick={() => setEditor({ id: null, name: "" })}
        >
          <Plus className="size-4" />
          Nueva lista
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Listas de compras">
        {activeLists.map((row, index) => {
          const products = s.items.filter((item) => shoppingListId(item, householdId) === row.id);
          const pending = products.filter((item) => !item.done).length;
          return (
            <button
              type="button"
              key={row.id}
              aria-label={`Abrir lista ${row.name}`}
              aria-pressed={row.id === listId}
              className={cn(
                "min-w-0 rounded-2xl border-2 p-4 text-left transition duration-200 motion-reduce:transition-none",
                row.id === listId ? "border-foreground bg-card shadow-card" : "border-transparent",
                ["bg-accent", "bg-lilac", "bg-success", "bg-sky"][index % 4],
              )}
              onClick={() => {
                setSelected(row.id);
                setName("");
                setShowArchive(false);
              }}
            >
              <ListChecks className="mb-3 size-5" />
              <span className="block truncate font-display text-lg font-bold">{row.name}</span>
              <span className="text-xs text-muted-foreground">
                {pending} pendientes · {products.length} productos
              </span>
            </button>
          );
        })}
      </div>
      {sync && (sync.error || sync.conflict) && (
        <section
          aria-label="Sincronización de compras"
          className="space-y-2 text-xs text-muted-foreground"
        >
          {sync.error && (
            <p role="alert" className="text-destructive">
              {sync.error}
            </p>
          )}
          {sync.conflict ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={sync.syncing || navigator.onLine === false}
                onClick={() => void sync.resolve(true)}
              >
                Aplicar mis cambios
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={sync.syncing || navigator.onLine === false}
                onClick={() => void sync.resolve(false)}
              >
                Usar las listas del hogar
              </Button>
            </div>
          ) : (
            !!sync.pending && (
              <Button
                size="sm"
                variant="outline"
                disabled={sync.syncing || navigator.onLine === false}
                onClick={() => void sync.sync()}
              >
                Sincronizar ahora
              </Button>
            )
          )}
        </section>
      )}
      <section
        className="space-y-4 rounded-3xl bg-card p-4 shadow-card sm:p-6"
        aria-label={`Lista ${list?.name ?? "Groceries"}`}
      >
        <header className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 break-words font-display text-xl font-bold">
            {list?.name}
          </h3>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Renombrar lista"
            disabled={!s.setShoppingLists || busy}
            onClick={() => setEditor({ id: listId, name: list?.name ?? "" })}
          >
            <Pencil className="size-4" />
          </Button>
          {listId !== householdId && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Archivar lista"
              disabled={busy}
              onClick={() => {
                if (list) void archive(list, true);
              }}
            >
              <Archive className="size-4" />
            </Button>
          )}
        </header>
        <form
          onSubmit={(event) => void add(event)}
          aria-busy={busy}
          className="flex items-center gap-2 rounded-2xl bg-secondary p-2 pl-4"
        >
          <input
            ref={input}
            id="shopping-product"
            maxLength={150}
            aria-label="Producto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Añadir producto"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          <NativeInputShortcut targetId="shopping-product" />
          <Button
            type="submit"
            size="icon"
            aria-label="Añadir producto"
            disabled={busy || !name.trim()}
            className="size-11 shrink-0 rounded-xl"
          >
            <Plus />
          </Button>
        </form>
        <ul className="divide-y divide-border">
          {[...items]
            .sort((a, b) => Number(a.done) - Number(b.done))
            .map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-1">
                <Button
                  variant="ghost"
                  aria-label={item.name}
                  aria-pressed={item.done}
                  onClick={() =>
                    void s.setItems((rows) =>
                      rows.map((row) => (row.id === item.id ? { ...row, done: !row.done } : row)),
                    )
                  }
                  className="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal rounded-xl px-2 py-3 text-left"
                >
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border-2",
                      item.done ? "border-success-strong bg-success" : "border-foreground/25",
                    )}
                  >
                    {item.done && <Check />}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 break-words text-base",
                      item.done && "text-muted-foreground line-through",
                    )}
                  >
                    {item.name}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${item.name}`}
                  onClick={() => void remove(item)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
        </ul>
        {!items.length && (
          <div className="py-8 text-center">
            <ListChecks className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Esta lista está vacía.</p>
          </div>
        )}
      </section>
      {!!archived.length && (
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setShowArchive((value) => !value)}
        >
          <Archive className="size-4" />
          Archivadas ({archived.length})
        </Button>
      )}
      {showArchive && (
        <section aria-label="Listas archivadas" className="space-y-2">
          {archived.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-2xl bg-card p-4">
              <span className="min-w-0 flex-1 break-words font-semibold">{row.name}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={`Restaurar ${row.name}`}
                onClick={() => void archive(row, false)}
              >
                <RotateCcw className="size-4" />
                Restaurar
              </Button>
            </div>
          ))}
        </section>
      )}
      <Dialog
        open={!!editor}
        onOpenChange={(value) => {
          if (!value && !busy) setEditor(null);
        }}
      >
        <DialogContent className="rounded-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editor?.id ? "Renombrar lista" : "Nueva lista"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(event) => void saveList(event)} className="space-y-4">
            <label className="block text-sm font-semibold">
              Nombre de la lista
              <input
                autoFocus
                required
                maxLength={80}
                value={editor?.name ?? ""}
                onChange={(event) =>
                  setEditor((value) => (value ? { ...value, name: event.target.value } : value))
                }
                className="mt-2 w-full rounded-xl border bg-background p-3"
              />
            </label>
            {!editor?.id && (
              <div className="flex flex-wrap gap-2">
                {["Groceries", "School", "Farmacia", "Viajes"].map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setEditor({ id: null, name: suggestion })}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}
            {sync?.error && (
              <p role="alert" className="text-sm text-destructive">
                {sync.error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full rounded-full"
              disabled={busy || !editor?.name.trim()}
            >
              {busy ? "Guardando…" : "Guardar lista"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
