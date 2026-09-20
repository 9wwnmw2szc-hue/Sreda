import type { ReactNode } from "react";

/** Pass-through: login stays ungated; console group applies requireAdminPage. */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
