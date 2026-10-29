import { User } from "@antelopejs/interface-dms/auth/db";

/**
 * A stored-user instance carrying only the given fields; every other column
 * stays unset, as on a row the database has not filled in.
 */
export function userFixture(fields: Pick<User, "_id"> & Partial<User>): User {
  return Object.assign(new User(), fields);
}
