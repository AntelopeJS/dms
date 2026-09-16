import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SystemStateModel } from "../../db";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { UserInviteModel } from "@antelopejs/interface-dms/db/models";
import type { UserInvite } from "@antelopejs/interface-dms/db/tables/user_invites.table";
import { UserModel } from "@antelopejs/interface-dms/auth/db/models";
import type { User } from "@antelopejs/interface-dms/auth/db/tables/users.table";

const MILLISECONDS_IN_HOUR = 3_600_000;

export interface UserInviteSeed {
  email: string;
  roles_ids?: string[];
  language?: string;
  owner?: boolean;
  skipEmailValidation?: boolean;
  lifetimeMs?: number;
}

export interface SeededUserInvite {
  token: string;
  email: string;
}

/**
 * Seed a `user_invites` row for the default tenant and return its token.
 * Uses the in-process DMS models so the row is encoded/located exactly like
 * an invite created through the application.
 */
export async function seedUserInvite(
  invite: UserInviteSeed,
): Promise<SeededUserInvite> {
  const token = randomUUID();
  const model = GetModel(UserInviteModel, DEFAULT_TENANT_ID);
  await model.insert({
    email: invite.email,
    roles_ids: invite.roles_ids ?? [],
    language: invite.language ?? "en",
    token,
    asTenantOwner: invite.owner ?? false,
    expiresAt: new Date(
      Date.now() + (invite.lifetimeMs ?? MILLISECONDS_IN_HOUR),
    ),
    skipEmailValidation: invite.skipEmailValidation ?? true,
  });
  return { token, email: invite.email };
}

export async function findUserByEmail(email: string): Promise<User> {
  const user = await GetModel(UserModel).getByEmail(email);
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }
  return user;
}

export async function updateUserByEmail(
  email: string,
  update: Partial<User>,
): Promise<void> {
  const model = GetModel(UserModel);
  const user = await model.getByEmail(email);
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }
  await model.update(user._id, update);
}

export interface GeneralSettingsSeed {
  has_onboarded?: boolean;
}

/**
 * Set the singleton system-state row (replaces the legacy general_settings
 * store). Only `has_onboarded` survives in the current schema.
 */
export async function seedGeneralSettings(
  overrides: GeneralSettingsSeed = {},
): Promise<void> {
  const model = GetModel(SystemStateModel);
  const current = await model.getConfig();
  await model.updateConfig({
    // The spread row is an AntelopeJS table class: `Table` declares one
    // field and a static, no instance methods, and the value is
    // serialised to JSON on the way out. No prototype to lose.
    // oxlint-disable-next-line typescript/no-misused-spread
    ...current,
    has_onboarded: overrides.has_onboarded ?? false,
    updatedAt: new Date(),
  } as Parameters<SystemStateModel["updateConfig"]>[0]);
}

export async function getGeneralSettings(): Promise<Record<
  string,
  unknown
> | null> {
  const config = await GetModel(SystemStateModel).getConfig();
  return (config as Record<string, unknown> | undefined) ?? null;
}

export async function listUserInvitesByEmail(
  email: string,
): Promise<UserInvite[]> {
  const invites = await GetModel(UserInviteModel, DEFAULT_TENANT_ID).getAll();
  return invites.filter((invite) => invite.email === email);
}
