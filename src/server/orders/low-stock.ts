/**
 * Low-stock threshold crossing detection with deduped event keys.
 * Wired via orders.decrementStock → notify(inventory.low_stock).
 */

export type LowStockCrossing = {
  crossed: boolean;
  /** Stable event key for dedupe via notification.event_key UNIQUE(business_id, event_key). */
  eventKey: string | null;
};

/** True when stock moved from above threshold to at-or-below (inclusive). */
export function crossedLowStockThreshold(
  previousStock: number,
  nextStock: number,
  threshold: number | null | undefined,
): boolean {
  if (threshold == null || threshold < 0) return false;
  return previousStock > threshold && nextStock <= threshold;
}

export function lowStockEventKey(
  productId: string,
  variantId: string | null,
  threshold: number,
): string {
  const scope = variantId ? `variant:${variantId}` : `product:${productId}`;
  return `inventory.low_stock:${scope}:t${threshold}`;
}

export function evaluateLowStockCrossing(input: {
  productId: string;
  variantId?: string | null;
  previousStock: number;
  nextStock: number;
  threshold: number | null | undefined;
}): LowStockCrossing {
  if (
    !crossedLowStockThreshold(
      input.previousStock,
      input.nextStock,
      input.threshold,
    )
  ) {
    return { crossed: false, eventKey: null };
  }
  return {
    crossed: true,
    eventKey: lowStockEventKey(
      input.productId,
      input.variantId ?? null,
      input.threshold!,
    ),
  };
}

/** Whether a low-stock notification should be emitted for this stock transition. */
export function maybeNotifyLowStock(
  input: Parameters<typeof evaluateLowStockCrossing>[0],
): { shouldNotify: boolean; eventKey: string | null } {
  const result = evaluateLowStockCrossing(input);
  return { shouldNotify: result.crossed, eventKey: result.eventKey };
}
