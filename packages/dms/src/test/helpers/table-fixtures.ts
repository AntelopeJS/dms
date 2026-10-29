import { Session } from "@antelopejs/interface-dms/auth/db";
import { Role, UserInvite } from "@antelopejs/interface-dms/db";

/** A stored-role instance carrying only the given fields. */
export function roleFixture(fields: Pick<Role, "_id"> & Partial<Role>): Role {
  return Object.assign(new Role(), fields);
}

/** A stored-session instance carrying only the given fields. */
export function sessionFixture(
  fields: Pick<Session, "_id"> & Partial<Session>,
): Session {
  return Object.assign(new Session(), fields);
}

/** A stored-invite instance carrying only the given fields. */
export function inviteFixture(
  fields: Pick<UserInvite, "_id"> & Partial<UserInvite>,
): UserInvite {
  return Object.assign(new UserInvite(), fields);
}
