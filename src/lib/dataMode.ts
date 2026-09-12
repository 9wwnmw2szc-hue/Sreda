/** Demo must be explicitly enabled and can never bypass production identity. */
export const isDemoMode =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DATA_SOURCE === "mock";
