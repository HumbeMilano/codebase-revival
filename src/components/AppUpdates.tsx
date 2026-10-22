import { useEffect, useState } from "react";

export function AppUpdates() {
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let active = true;
    const changed = () => {
      if (active && hadController) setUpdated(true);
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
    };
  }, []);
  return updated ? (
    <aside
      role="status"
      className="fixed bottom-24 right-4 z-[70] max-w-sm space-y-2 rounded-2xl border bg-card p-4 shadow-lg"
    >
      <p className="text-sm">
        Hay una actualización preparada. Guarda los formularios antes de recargar.
      </p>
      <button
        type="button"
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        onClick={() => window.location.reload()}
      >
        Actualizar app
      </button>
    </aside>
  ) : null;
}
