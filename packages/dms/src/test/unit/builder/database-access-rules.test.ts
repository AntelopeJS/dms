import { expect } from "chai";
import {
  type MongoGrants,
  type MongoPrivilege,
  type MongoRelation,
  mongoAccess,
  mysqlAccess,
  type PostgresRelationRow,
  postgresAccess,
  summarizeRelations,
} from "../../../implementations/dms-builder/engine";

const NO_WRITE = { insert: false, update: false, delete: false };
const SELECT_ONLY: PostgresRelationRow = { readable: true, ...NO_WRITE };
const NO_PRIVILEGE: PostgresRelationRow = { readable: false, ...NO_WRITE };

const ORDERS: MongoRelation = { name: "orders", type: "collection" };
const NOTES: MongoRelation = { name: "notes", type: "collection" };
const REPORT: MongoRelation = { name: "report", type: "view" };

function privilege(
  actions: string[],
  resource: MongoPrivilege["resource"],
): MongoPrivilege {
  return { actions, resource };
}

function mongo(grants: Partial<MongoGrants>) {
  return mongoAccess({
    database: "shop",
    user: "app",
    privileges: [],
    relations: [ORDERS, NOTES],
    ...grants,
  });
}

describe("the access a PostgreSQL role is answered", () => {
  /** Fails on an implementation that takes SELECT for write access. */
  it("a read-only role reads and cannot write", () => {
    expect(postgresAccess([SELECT_ONLY, SELECT_ONLY])).to.deep.equal({
      canRead: true,
      canWrite: false,
    });
  });

  /** Fails on an implementation that needs INSERT in particular, or that needs SELECT to write. */
  it("INSERT on one table is write access without any read access", () => {
    expect(
      postgresAccess([{ ...NO_PRIVILEGE, insert: true }, NO_PRIVILEGE]),
    ).to.deep.equal({ canRead: false, canWrite: true });
  });

  /** Fails on an implementation that looks at INSERT alone, or at UPDATE or DELETE alone. */
  it("UPDATE alone and DELETE alone are write access too", () => {
    expect(
      postgresAccess([{ ...NO_PRIVILEGE, update: true }]).canWrite,
    ).to.equal(true);
    expect(
      postgresAccess([{ ...NO_PRIVILEGE, delete: true }]).canWrite,
    ).to.equal(true);
  });

  /** Fails on an implementation that counts a visible relation as a readable one. */
  it("a role that sees tables and may use none of them reads nothing", () => {
    expect(postgresAccess([NO_PRIVILEGE, NO_PRIVILEGE])).to.deep.equal({
      canRead: false,
      canWrite: false,
    });
  });

  /** Fails on an implementation that asks one table for both and not any table for each. */
  it("the read and the write may sit on different tables", () => {
    expect(
      postgresAccess([SELECT_ONLY, { ...NO_PRIVILEGE, update: true }]),
    ).to.deep.equal({ canRead: true, canWrite: true });
  });

  /** Fails on an implementation that reads `some` of an empty list, which is false. */
  it("an empty database reads and writes nothing", () => {
    expect(postgresAccess([])).to.deep.equal({
      canRead: true,
      canWrite: false,
    });
  });
});

describe("the access a MySQL or MariaDB account is answered", () => {
  const none = { readable: false, insert: false, update: false, delete: false };

  /** Fails on an implementation that reads a write as a read, or misses one kind of write. */
  it("reads a relation it may SELECT from, and writes one it may INSERT, UPDATE or DELETE in", () => {
    expect(mysqlAccess([{ ...none, readable: true }, none])).to.deep.equal({
      canRead: true,
      canWrite: false,
    });
    for (const write of ["insert", "update", "delete"]) {
      expect(mysqlAccess([{ ...none, [write]: true }]), write).to.deep.equal({
        canRead: false,
        canWrite: true,
      });
    }
  });

  /** Fails on an implementation that answers no read access for a database with no relation. */
  it("an account that sees no relation reads, as the catalogs decide, and writes nothing", () => {
    expect(mysqlAccess([])).to.deep.equal({ canRead: true, canWrite: false });
  });
});

describe("the access a MongoDB account is answered from its grants", () => {
  /** Fails on an implementation that matches every grant without its database. */
  it("a role granted on another database reads nothing here", () => {
    expect(
      mongo({
        privileges: [
          privilege(["find", "insert"], { db: "elsewhere", collection: "" }),
        ],
      }),
    ).to.deep.equal({ canRead: false, canWrite: false });
  });

  /** Fails on an implementation that needs the grant to name the collection. */
  it("a read role grants find on every collection of its database", () => {
    expect(
      mongo({
        privileges: [privilege(["find"], { db: "shop", collection: "" })],
      }),
    ).to.deep.equal({ canRead: true, canWrite: false });
  });

  /** Fails on an implementation that reads `remove` as `delete`, or leaves it out. */
  it("insert, update or remove on one collection is write access", () => {
    for (const action of ["insert", "update", "remove"]) {
      expect(
        mongo({
          privileges: [
            privilege([action], { db: "shop", collection: "orders" }),
          ],
        }).canWrite,
        action,
      ).to.equal(true);
    }
  });

  /** Fails on an implementation that writes through `find`, or reads through `insert`. */
  it("a role that may insert into one collection and find in none reads nothing", () => {
    expect(
      mongo({
        privileges: [
          privilege(["insert"], { db: "shop", collection: "orders" }),
        ],
      }),
    ).to.deep.equal({ canRead: false, canWrite: true });
  });

  /** Fails on an implementation that does not take `db: ""` as every database. */
  it("a grant on every database and every collection covers this one", () => {
    expect(
      mongo({
        privileges: [privilege(["find", "update"], { db: "", collection: "" })],
      }),
    ).to.deep.equal({ canRead: true, canWrite: true });
  });

  /** Fails on an implementation that does not take `anyResource` as everything. */
  it("an `anyResource` grant covers every collection", () => {
    expect(
      mongo({ privileges: [privilege(["find"], { anyResource: true })] })
        .canRead,
    ).to.equal(true);
  });

  /** Fails on an implementation that lets a view be written to. */
  it("a view is never written to, whatever the grants say", () => {
    expect(
      mongo({
        relations: [REPORT],
        privileges: [
          privilege(["find", "insert"], { db: "shop", collection: "" }),
        ],
      }),
    ).to.deep.equal({ canRead: true, canWrite: false });
  });

  /** Fails on an implementation that counts `system.` collections, which the catalog leaves out. */
  it("the system collections count neither as read nor as write", () => {
    expect(
      mongo({
        relations: [{ name: "system.views", type: "collection" }, ORDERS],
        privileges: [
          privilege(["find", "insert"], {
            db: "shop",
            collection: "system.views",
          }),
        ],
      }),
    ).to.deep.equal({ canRead: false, canWrite: false });
  });
});

describe("the access a MongoDB account is answered from what the database holds", () => {
  /** Fails on an implementation that reads an empty database as unreadable. */
  it("a database with no collection reads and writes nothing", () => {
    expect(mongo({ relations: [] })).to.deep.equal({
      canRead: true,
      canWrite: false,
    });
  });

  /** Fails on an implementation that takes an account without privileges for a server without access control. */
  it("a signed-in account with no privilege has no access", () => {
    expect(mongo({ user: "app", privileges: [] })).to.deep.equal({
      canRead: false,
      canWrite: false,
    });
  });

  /** Fails on an implementation that gives a server without access control no privilege at all. */
  it("a server without access control gives full privileges", () => {
    expect(mongo({ user: undefined, privileges: [] })).to.deep.equal({
      canRead: true,
      canWrite: true,
    });
  });

  /** Fails on an implementation that reads a server without access control from what the database holds, so an empty one, or one of views, cannot be written to. */
  it("a server without access control reads and writes a database that is empty or holds only views", () => {
    for (const relations of [[], [REPORT]]) {
      expect(mongo({ user: undefined, relations })).to.deep.equal({
        canRead: true,
        canWrite: true,
      });
    }
  });

  /** Fails on an implementation that counts a view of a signed-in account as writable. */
  it("a signed-in account with every privilege writes to no view and to nothing in an empty database", () => {
    const everything = [
      privilege(["find", "insert", "update", "remove"], { anyResource: true }),
    ];
    expect(
      mongo({ privileges: everything, relations: [REPORT] }),
    ).to.deep.equal({ canRead: true, canWrite: false });
    expect(mongo({ privileges: everything, relations: [] })).to.deep.equal({
      canRead: true,
      canWrite: false,
    });
  });
});

describe("the access a RethinkDB account is answered from its tables", () => {
  /** Fails on an implementation that takes a table the account can read for one it can write. */
  it("tables the account can read and not write mean read access only", () => {
    expect(
      summarizeRelations([
        { readable: true, writable: false },
        { readable: true, writable: false },
      ]),
    ).to.deep.equal({ canRead: true, canWrite: false });
  });

  /** Fails on an implementation that needs every table to be writable. */
  it("one writable table among read-only ones is write access", () => {
    expect(
      summarizeRelations([
        { readable: true, writable: false },
        { readable: true, writable: true },
      ]),
    ).to.deep.equal({ canRead: true, canWrite: true });
  });

  /** Fails on an implementation that lists the tables and stops there. */
  it("an account that is refused every table reads nothing", () => {
    expect(
      summarizeRelations([
        { readable: false, writable: false },
        { readable: false, writable: false },
      ]),
    ).to.deep.equal({ canRead: false, canWrite: false });
  });

  /** Fails on an implementation that reads an empty database as unreadable. */
  it("a database with no table reads and writes nothing", () => {
    expect(summarizeRelations([])).to.deep.equal({
      canRead: true,
      canWrite: false,
    });
  });
});
