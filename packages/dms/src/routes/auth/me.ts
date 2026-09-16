import { sanitizeUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";

export async function me(user: User): Promise<Partial<User>> {
  return sanitizeUser(user);
}
