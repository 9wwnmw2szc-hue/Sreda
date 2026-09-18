/** The approved visual code matches the solution code 1:1 (no shared sales alias). */
export function solutionVisualCode(code: string) {
  if (code === "admin_messages") return "admin-messages";
  return code;
}

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

export function solutionModuleAsset(code: string) {
  return `/assets/sreda/v2/module-${solutionVisualCode(code)}.webp`;
}
