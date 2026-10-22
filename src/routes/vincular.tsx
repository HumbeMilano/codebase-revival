import { createFileRoute } from "@tanstack/react-router";
import { TabletPairingPage } from "@/components/hub/TabletPairing";

export const Route = createFileRoute("/vincular")({
  head: () => ({ meta: [{ title: "Vincular tablet · HomeHub" }] }),
  component: TabletPairingPage,
});
