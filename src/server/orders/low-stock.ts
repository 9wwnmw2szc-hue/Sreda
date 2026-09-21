/**
 * Low-stock threshold crossing detection (domain stub).
 * Notification wiring (notify + preference type) lands in a follow-up once
 * `inventory.low_stock` is added to notification_preference CHECK / settings UI.
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

/**
 * Stub: returns whether a notification *would* be emitted.
 * Does not write to the database — wire to `notify()` when type is allowed.
 */
export function maybeNotifyLowStock(
  input: Parameters<typeof evaluateLowStockCrossing>[0],
): { shouldNotify: boolean; eventKey: string | null } {
  const result = evaluateLowStockCrossing(input);
  return { shouldNotify: result.crossed, eventKey: result.eventKey };
}
