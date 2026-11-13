import { fromDatabase } from "@antelopejs/interface-database-decorators";
import { User } from "@antelopejs/interface-dms/auth/db";

/**
 * A stored-user instance carrying only the given fields; every other column
 * stays unset, as on a row the database has not filled in.
 */
export function userFixture(fields: Pick<User, "_id"> & Partial<User>): User {
  return Object.assign(new User(), fields);
}

/**
 * A stored-user instance read from a row of the given fields, so `password`
 * holds exactly the given text. Assigning the field hashes it, which would
 * hide a leaked password from a text search and rewrite what a test reads
 * back.
 */
export function plainPasswordUserFixture(
  fields: Pick<User, "_id"> & Partial<User>,
): User {
  return fromDatabase(fields, User);
}
