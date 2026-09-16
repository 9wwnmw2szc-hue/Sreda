export const SOLUTION_DESTINATIONS = {
  leads: "/solutions/leads/setup",
  admin_messages: "/messages",
  booking: "/bookings",
  autopost: "/posts",
} as const;

export type PresentedSolutionCode = keyof typeof SOLUTION_DESTINATIONS;

export function solutionRoute(code: string) {
  return SOLUTION_DESTINATIONS[code as PresentedSolutionCode] ?? "/solutions";
}

/** The approved pink cube was originally exported under the legacy sales name. */
export function solutionVisualCode(code: string) {
  return code === "admin_messages" ? "sales" : code;
}
