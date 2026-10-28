import { createFileRoute, redirect } from "@tanstack/react-router";
import { HubApp } from "@/components/hub/HubApp";
import { passwordRecoveryArrival, supabase } from "@/integrations/supabase/client";
import { AdminPage } from "@/components/admin/AdminPage";
import { currentApplication } from "@/lib/pwa-context";
import { canResumePasswordRecovery } from "@/lib/password-recovery";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
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
    if (currentApplication.admin) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && canResumePasswordRecovery(session))
        throw redirect({ to: "/reset-password", replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: currentApplication.admin ? "Skendal Admin" : "Skendal" },
      {
        name: "description",
        content: currentApplication.admin
          ? "Administración de Skendal: hogares, cuentas y operaciones del servicio."
          : "Tareas, compras, calendario y gastos compartidos para toda la familia, en la tablet de casa y en cada móvil.",
      },
      { property: "og:title", content: currentApplication.admin ? "Skendal Admin" : "Skendal" },
      {
        property: "og:description",
        content: "Tareas, compras, calendario y gastos compartidos para toda la familia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: currentApplication.admin ? AdminPage : HubApp,
});
