import { createFileRoute, redirect } from "@tanstack/react-router";
import { HubApp } from "@/components/hub/HubApp";
import { passwordRecoveryArrival } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery"
    )
      throw redirect({
        to: "/reset-password",
        hash: window.location.hash.slice(1),
        replace: true,
        reloadDocument: true,
      });
    // Auth may have consumed the fragment before this route resolves. Preserve
    // the captured intent and initialized session with an in-app navigation.
    if (passwordRecoveryArrival.recovery) throw redirect({ to: "/reset-password", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Skendal" },
      {
        name: "description",
        content:
          "Tareas, compras, calendario y gastos compartidos para toda la familia, en la tablet de casa y en cada móvil.",
      },
      { property: "og:title", content: "Skendal" },
      {
        property: "og:description",
        content: "Tareas, compras, calendario y gastos compartidos para toda la familia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HubApp,
});
