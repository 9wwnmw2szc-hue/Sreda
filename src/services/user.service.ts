import { apiRequest } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/dataMode";
import { mockUser } from "@/mocks/user";
import type { User } from "@/types";
export async function getCurrentUser(): Promise<User> {
  return isDemoMode ? mockUser : apiRequest<User>("/api/v1/me");
}
