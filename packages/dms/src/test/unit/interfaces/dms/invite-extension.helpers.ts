import {
  type InviteExtensionOptions,
  RegisterInviteExtension,
} from "@antelopejs/interface-dms/invite-extensions";
import type { User } from "@antelopejs/interface-dms/auth/db";

export let admin: User;

export function setAdmin(user: User): void {
  admin = user;
}

export const disposers: Array<() => void> = [];

export function register<T>(options: InviteExtensionOptions<T>): () => void {
  const dispose = RegisterInviteExtension(options);
  disposers.push(dispose);
  return dispose;
}
