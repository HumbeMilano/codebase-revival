import { createFileRoute } from "@tanstack/react-router";
import { HubApp } from "@/components/hub/HubApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HomeHub — El centro de mando de tu hogar" },
      {
        name: "description",
        content:
          "Tareas, compras, calendario y gastos compartidos para toda la familia, en la tablet de casa y en cada móvil.",
      },
      { property: "og:title", content: "HomeHub — El centro de mando de tu hogar" },
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
