import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "@/components/admin/AdminPage";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administración del servicio — HomeHub" },
      {
        name: "description",
        content:
          "Panel de administración de la plataforma HomeHub: hogares, cuentas, planes y accesos.",
      },
      { property: "og:title", content: "Administración del servicio — HomeHub" },
      { property: "og:description", content: "Gestiona hogares, cuentas y planes de HomeHub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});
