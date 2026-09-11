import { delay } from "@/lib/delay";
import { mockUser } from "@/mocks/user";
import type { User } from "@/types";

export async function getCurrentUser(): Promise<User> {
  await delay();
  return mockUser;
}
