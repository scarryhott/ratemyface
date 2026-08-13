/** Checkout hint for getEntitlements: pack size always; checkout_action when balance cannot cover the next metered Action. */
export function entitlementsCheckoutFields(credits: number, packSize: number, meteredCosts: Record<string, number>) {
  const costs = Object.values(meteredCosts).filter((n) => Number.isFinite(n) && n > 0);
  const next_metered_cost = costs.length ? Math.min(...costs) : 1;
  const checkout_needed = credits <= 0 || credits < next_metered_cost;
  return {
    credit_pack_size: packSize,
    next_metered_cost,
    checkout_needed,
    ...(checkout_needed ? { checkout_action: "createCreditCheckoutSession" as const } : {})
  };
}
