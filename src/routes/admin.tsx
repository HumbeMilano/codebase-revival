import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminPage } from "@/components/admin/AdminPage";
import { adminEntry } from "@/lib/pwa-context";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    throw redirect({
      href: adminEntry(new URL(window.location.href)),
      reloadDocument: true,
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "Skendal Admin" },
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
