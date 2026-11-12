import { User } from "@antelopejs/interface-dms/auth/db";

/**
 * A stored-user instance carrying only the given fields; every other column
 * stays unset, as on a row the database has not filled in.
 */
export function userFixture(fields: Pick<User, "_id"> & Partial<User>): User {
  return Object.assign(new User(), fields);
}

/**
 * A {@link userFixture} whose `password` holds exactly the given text. The
 * stored field hashes what it is assigned, which would hide a leaked password
 * from a text search and rewrite what a test reads back.
 */
export function plainPasswordUserFixture(
  fields: Pick<User, "_id"> & Partial<User>,
): User {
  const { password, ...rest } = fields;
  const user = userFixture(rest);
  if (Object.hasOwn(fields, "password")) {
    Object.defineProperty(user, "password", {
      value: password,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }
  return user;
}
