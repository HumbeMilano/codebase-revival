// Public catalogue only: no account session, payment data or server credential.
(async () => {
  try {
    const response = await fetch(
      "https://rwbeiestzyzceramgtdw.supabase.co/rest/v1/rpc/business_catalog",
      {
        headers: { apikey: "sb_publishable_Aal707QWHprU7mfaJMbrnw_Xw3Ycei7" },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) return;
    const catalogue = await response.json();
    const plan = catalogue.plans?.find((row) => row.id === "pro");
    if (
      !plan ||
      !/^[A-Z]{3}$/.test(plan.currency) ||
      !Number.isSafeInteger(plan.amount_cents) ||
      !Number.isSafeInteger(plan.annual_amount_cents) ||
      plan.amount_cents < 0 ||
      plan.annual_amount_cents < 0
    )
      return;
    const price = new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency });
    document.getElementById("monthly-price").textContent = price.format(plan.amount_cents / 100);
    document.getElementById("annual-price").textContent = price.format(
      plan.annual_amount_cents / 100,
    );
    document.getElementById("pricing-cards").hidden = false;
    document.getElementById("pricing-status").textContent =
      `Precios previstos en ${plan.currency}. Los cobros automáticos todavía no están activos.`;
  } catch {
    // The account CTA and the rest of the page continue working without the API.
  }
})();
