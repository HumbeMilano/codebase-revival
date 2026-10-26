// Only the public catalogue is read. This page cannot start a charge.
(async () => {
  const spanish = document.documentElement.lang === "es";
  try {
    const response = await fetch(
      "https://rwbeiestzyzceramgtdw.supabase.co/rest/v1/rpc/business_catalog",
      {
        headers: { apikey: "sb_publishable_Aal707QWHprU7mfaJMbrnw_Xw3Ycei7" },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return;
    const catalogue = await response.json(),
      plan = catalogue.plans?.find((row) => row.id === "pro");
    if (
      !plan ||
      !/^[A-Z]{3}$/.test(plan.currency) ||
      !Number.isSafeInteger(plan.amount_cents) ||
      !Number.isSafeInteger(plan.annual_amount_cents) ||
      plan.amount_cents < 0 ||
      plan.annual_amount_cents < 0
    )
      return;
    const format = new Intl.NumberFormat(spanish ? "es-US" : "en-US", {
      style: "currency",
      currency: plan.currency,
    });
    document.getElementById("monthly-price").textContent = format.format(plan.amount_cents / 100);
    document.getElementById("annual-price").textContent = format.format(
      plan.annual_amount_cents / 100,
    );
    document.getElementById("pricing-status").textContent = spanish
      ? `Precios previstos en ${plan.currency}. Los cobros automáticos todavía no están activos.`
      : `Planned prices in ${plan.currency}. Automatic subscription payments are not active.`;
    const comparison = document.getElementById("plan-comparison");
    if (comparison && catalogue.plans?.length === 2) {
      const labels = spanish
        ? {
            members: "Miembros",
            lists: "Listas activas",
            devices: "Tablets vinculadas",
            photos: "Fotos de bloqueo",
            widgets: "Widgets por inicio",
          }
        : {
            members: "Members",
            lists: "Active lists",
            devices: "Linked tablets",
            photos: "Lock-screen photos",
            widgets: "Home screen widgets",
          };
      const table = document.createElement("table"),
        caption = document.createElement("caption");
      caption.textContent = spanish
        ? "Propuesta Free / Pro por hogar. Límites aún desactivados."
        : "Proposed Free / Pro capacity per household. Limits are not active yet.";
      table.append(caption);
      const head = document.createElement("thead"),
        header = document.createElement("tr");
      for (const text of [spanish ? "Capacidad" : "Capacity", "Skendal Free", "Skendal Pro"]) {
        const th = document.createElement("th");
        th.scope = "col";
        th.textContent = text;
        header.append(th);
      }
      head.append(header);
      table.append(head);
      const body = document.createElement("tbody");
      for (const [key, label] of Object.entries(labels)) {
        const values = ["free", "pro"].map(
          (id) => catalogue.plans.find((row) => row.id === id)?.limits?.[key],
        );
        if (values.some((value) => !Number.isSafeInteger(value) || value < 1)) continue;
        const row = document.createElement("tr"),
          th = document.createElement("th");
        th.scope = "row";
        th.textContent = label;
        row.append(th);
        values.forEach((value, index) => {
          const td = document.createElement("td");
          td.textContent =
            key === "widgets" && index === 1
              ? spanish
                ? "Catálogo completo"
                : "Full catalogue"
              : String(value);
          row.append(td);
        });
        body.append(row);
      }
      table.append(body);
      comparison.replaceChildren(table);
      comparison.hidden = false;
    }
    document.getElementById("pricing-cards").hidden = false;
  } catch {
    /* Registration and the rest of the page remain usable. */
  }
})();
