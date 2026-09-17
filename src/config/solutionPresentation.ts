export const SOLUTION_DESTINATIONS = {
  leads: "/solutions/leads/setup",
  admin_messages: "/messages",
  booking: "/bookings",
  autopost: "/posts",
  orders: "/orders",
} as const;

export type PresentedSolutionCode = keyof typeof SOLUTION_DESTINATIONS;

export function solutionRoute(code: string) {
  return SOLUTION_DESTINATIONS[code as PresentedSolutionCode] ?? "/solutions";
}

/** The approved pink cube was originally exported under the legacy sales name. */
export function solutionVisualCode(code: string) {
  if (code === "admin_messages" || code === "orders") return "sales";
  return code;
}
