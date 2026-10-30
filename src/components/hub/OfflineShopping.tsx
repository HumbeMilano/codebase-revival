import { Shopping } from "./Screens";
import { useOfflineShopping } from "@/hooks/use-offline-shopping";
import { supabase } from "@/integrations/supabase/client";
import type { ShoppingContext } from "@/lib/offline-shopping";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { HubSearch } from "@/lib/hub-navigation";

export function OfflineShopping({
  context,
  onReconnect,
}: {
  context: ShoppingContext;
  onReconnect: () => void;
}) {
  // Display and local edits only. A fresh server-validated household context must
  // be restored before any queued operation may leave this device.
  const shopping = useOfflineShopping(context, supabase, false);
  const navigate = useNavigate({ from: "/" });
  const search = useSearch({ from: "/" });
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{context.householdName}</p>
          <h1 className="font-display text-3xl font-bold">Compras</h1>
        </div>
        <Button type="button" variant="outline" onClick={onReconnect}>
          Volver a conectar
        </Button>
      </header>
      <Shopping
        compact
        initialListId={search.section === "shopping" ? search.record : undefined}
        onListChange={(id, replace) => {
          void navigate({
            to: "/",
            search: (previous: HubSearch) => ({ ...previous, section: "shopping", record: id }),
            replace: replace ?? false,
          });
        }}
        s={{
          items: shopping.items,
          setItems: shopping.setItems,
          shoppingSync: shopping,
          shoppingLists: shopping.lists,
          setShoppingLists: shopping.setLists,
        }}
      />
    </main>
  );
}
