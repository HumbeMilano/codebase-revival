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
    document.getElementById("pricing-cards").hidden = false;
  } catch {
    /* Registration and the rest of the page remain usable. */
  }
})();
