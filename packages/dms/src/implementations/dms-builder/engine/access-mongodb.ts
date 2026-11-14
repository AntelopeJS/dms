import {
  type Privileges,
  type RelationAccess,
  summarizeRelations,
} from "./database-access";

/** One entry of `authenticatedUserPrivileges` in the answer of `connectionStatus`. */
export interface MongoPrivilege {
  resource: { db?: string; collection?: string; anyResource?: boolean };
  actions: string[];
}

/** One collection or view `listCollections` answers with. */
export interface MongoRelation {
  name: string;
  type?: string;
}

/** What the server told about the account that signed in to `database`, and what it lists there. */
export interface MongoGrants {
  database: string;
  /** The account the server reports; none when the server has no access control. */
  user: string | undefined;
  privileges: readonly MongoPrivilege[];
  relations: readonly MongoRelation[];
}

const SYSTEM_PREFIX = "system.";
const READ = "find";
const WRITES = ["insert", "update", "remove"];

/**
 * Whether a privilege of the account covers `action` on the collection. The same test as `Allows`
 * in the catalog of `@antelopejs/mongodb` 1.7.0 (`dist/implementations/catalog/discovery.js`): the
 * resource names every resource, or this database or any, and this collection or any.
 */
function allows(
  privileges: readonly MongoPrivilege[],
  database: string,
  collection: string,
  action: string,
): boolean {
  return privileges.some(
    ({ actions, resource }) =>
      actions.includes(action) &&
      (resource.anyResource === true ||
        ((resource.db === database || resource.db === "") &&
          (resource.collection === collection || resource.collection === ""))),
  );
}

function relationAccess(
  privileges: readonly MongoPrivilege[],
  database: string,
  relation: MongoRelation,
): RelationAccess {
  const isView = relation.type === "view";
  const may = (action: string) =>
    allows(privileges, database, relation.name, action);
  return {
    readable: may(READ),
    writable: !isView && WRITES.some(may),
  };
}

/**
 * What a MongoDB account may do, from the collections it lists. It writes when it may insert,
 * update or remove in any collection that is not a view, which is `Writes` in `discovery.js` of
 * the catalog of `@antelopejs/mongodb` 1.7.0, and the `system.` collections are left out as there.
 * A collection it can read is one it may `find` in. A server without access control signs nobody
 * in and lists no privilege, yet answers every command, so a read that succeeded counts as full
 * privileges, whatever the database holds: an empty database, or one of views, can be written to
 * there, since an insert creates its collection.
 */
export function mongoAccess(grants: MongoGrants): Privileges {
  if (grants.user === undefined) {
    return { canRead: true, canWrite: true };
  }
  return summarizeRelations(
    grants.relations
      .filter(({ name }) => !name.startsWith(SYSTEM_PREFIX))
      .map((relation) =>
        relationAccess(grants.privileges, grants.database, relation),
      ),
  );
}
