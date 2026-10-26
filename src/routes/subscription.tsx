import { createFileRoute } from "@tanstack/react-router";
import { SubscriptionPage } from "@/components/billing/SubscriptionPage";
export const Route = createFileRoute("/subscription")({
  head: () => ({ meta: [{ title: "Mi plan — Skendal" }, { name: "robots", content: "noindex" }] }),
  component: SubscriptionPage,
});
