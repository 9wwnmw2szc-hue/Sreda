/** Provider-agnostic billing types. Entitlement SoT is business_solution. */

export type EntitlementStatus =
  | "active"
  | "trial"
  | "expired"
  | "disabled"
  | "paused"
  | "absent";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "expired";

export type BillingProviderName =
  | "none"
  | "noop"
  | "mock"
  | "yookassa"
  | "stripe";

export type SolutionEntitlement = {
  businessId: string;
  solutionCode: string;
  status: EntitlementStatus;
  /** True when status is active|trial and not past expires_at. */
  entitled: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  validFrom: Date | null;
  validUntil: Date | null;
};

export type CheckoutInput = {
  businessId: string;
  solutionCodes: string[];
  successUrl: string;
  cancelUrl: string;
  currency?: string;
};

export type CheckoutSession = {
  id: string;
  url: string;
  provider: BillingProviderName;
};

export type WebhookResult =
  | { handled: false; reason: string }
  | {
      handled: true;
      businessId?: string;
      /** Provider events must never imply UI "payment succeeded" without entitlement write. */
      entitlementUpdates?: Array<{
        solutionCode: string;
        status: "active" | "trial" | "expired" | "disabled";
        expiresAt?: Date | null;
      }>;
    };

export type BillingSummaryLine = {
  solutionCode: string;
  name: string;
  priceRub: number;
  entitled: boolean;
  entitlementStatus: EntitlementStatus;
  messageLimit?: number;
};

export type BillingSummary = {
  businessId: string;
  lines: BillingSummaryLine[];
  entitledCount: number;
  estimatedMonthlyRub: number;
  /** False until a real payment provider is connected. */
  paymentConnected: boolean;
  /** Honest operator-facing status — never fake payment success. */
  statusLabel: string;
  nextStep: string;
};
