import { delay } from "@/lib/delay";
import { mockBilling } from "@/mocks/billing";
import type { BillingInfo } from "@/types";

export async function getBilling(
  businessId: string,
): Promise<BillingInfo | null> {
  await delay();
  return mockBilling.find((item) => item.businessId === businessId) ?? null;
}
