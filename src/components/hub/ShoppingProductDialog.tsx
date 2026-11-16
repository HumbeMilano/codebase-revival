import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { HubState } from "./Screens";
import type { ShoppingList } from "./data";
import { ShoppingProductForm } from "./ShoppingProductForm";

export function ShoppingProductDialog({
  s,
  list,
  householdId,
}: {
  s: Pick<HubState, "items" | "setItems">;
  list: ShoppingList;
  householdId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="dw-shopping-add"
          aria-label={`Añadir producto a ${list.name}`}
        >
          <Plus aria-hidden="true" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="rounded-3xl"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (
            busy ||
            (target.getAttribute("role") === "combobox" &&
              target.getAttribute("aria-expanded") === "true")
          )
            event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Añadir a {list.name}</DialogTitle>
        </DialogHeader>
        <ShoppingProductForm
          items={s.items}
          setItems={s.setItems}
          listId={list.id}
          householdId={householdId}
          onBusyChange={setBusy}
          autoFocus
        />
      </DialogContent>
    </Dialog>
  );
}
