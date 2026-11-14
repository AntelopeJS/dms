import { expect } from "chai";
import { createConnection } from "mysql2/promise";
import { checkDatabase } from "../../../implementations/dms-builder/engine";
import {
  CLOSE_SETTLE_MS,
  closedPort,
  type Container,
  dockerAvailable,
  LIVE_SUITE_NOTE,
  relay,
  relayIgnoringGoodbye,
  removeContainer,
  secretOf,
  type Stall,
  silentServer,
  START_TIMEOUT_MS,
  startContainer,
  waitFor,
  watchClientSockets,
} from "./helpers/database-servers";

const TIMEOUT_MS = 1000;
const ADMIN_SECRET = secretOf("admin");
const WRONG_SECRET = secretOf("wrong");

/** The byte after a packet's three-byte length: its sequence id, `0` for a command. */
const SEQUENCE_BYTE = 3;
/** The byte that names a command: COM_QUERY, and COM_QUIT, which a client sends before it closes. */
const COMMAND_BYTE = 4;
const QUERY_COMMAND = 0x03;
const QUIT_COMMAND = 0x01;

function isCommand(chunk: Buffer, command: number): boolean {
  return chunk[SEQUENCE_BYTE] === 0 && chunk[COMMAND_BYTE] === command;
}

function saysGoodbye(chunk: Buffer, fromClient: boolean): boolean {
  return fromClient && isCommand(chunk, QUIT_COMMAND);
}

/** The server never sees the first query: the sign-in is through and nothing more is answered. */
function stallsAtFirstQuery(): Stall {
  return (chunk, fromClient) => fromClient && isCommand(chunk, QUERY_COMMAND);
}

const GRANTS: [string, string][] = [
  ["reader", "SELECT ON shop.*"],
  ["writer", "SELECT, INSERT, UPDATE, DELETE ON shop.*"],
  ["inserter", "INSERT ON shop.orders"],
  ["updater", "UPDATE ON shop.notes"],
  ["deleter", "DELETE ON shop.notes"],
  ["blind", "SELECT (id) ON shop.orders"],
];

/** An account named with `@` that reads `shop` only through a role another role holds. */
const ROLE_USER = "ops@team";

const ROLE_SETUP = [
  "CREATE ROLE shop_read",
  "CREATE ROLE shop_staff",
  "GRANT SELECT ON shop.* TO shop_read",
  "GRANT shop_read TO shop_staff",
  `CREATE USER '${ROLE_USER}'@'%' IDENTIFIED BY '${secretOf(ROLE_USER)}'`,
  `GRANT shop_staff TO '${ROLE_USER}'@'%'`,
];

const SETUP = [
  "CREATE DATABASE shop",
  "CREATE TABLE shop.orders (id int PRIMARY KEY, total int)",
  "CREATE TABLE shop.notes (id int PRIMARY KEY)",
  ...[...GRANTS.map(([user]) => user), "stranger"].map(
    (user) => `CREATE USER '${user}'@'%' IDENTIFIED BY '${secretOf(user)}'`,
  ),
  ...GRANTS.map(([user, grant]) => `GRANT ${grant} TO '${user}'@'%'`),
  ...ROLE_SETUP,
];

/** A MySQL-protocol server the suite starts: the image, and the variable it reads the root password from. */
interface Flavour {
  label: string;
  image: string;
  passwordVariable: string;
  /** How the server makes the role the account holds active on every sign-in. */
  defaultRole: string;
}

const FLAVOURS: Flavour[] = [
  {
    label: "MySQL",
    image: "mysql:8.4",
    passwordVariable: "MYSQL_ROOT_PASSWORD",
    defaultRole: `SET DEFAULT ROLE ALL TO '${ROLE_USER}'@'%'`,
  },
  {
    label: "MariaDB",
    image: "mariadb:11",
    passwordVariable: "MARIADB_ROOT_PASSWORD",
    defaultRole: `SET DEFAULT ROLE shop_staff FOR '${ROLE_USER}'@'%'`,
  },
];

const suite = dockerAvailable ? describe : describe.skip;

/** The server a suite runs against, once its `before` has started it. */
interface Live {
  url(user: string, password?: string, database?: string): string;
  port(): number;
}

function accessCases(live: Live): void {
  it("answers read access and no write access to an account that may only SELECT", async () => {
    const answer = await checkDatabase("mysql", live.url("reader"), TIMEOUT_MS);
    expect(answer).to.include({
      reachable: true,
      user: "reader@%",
      canRead: true,
      canWrite: false,
    });
    expect(answer.latencyMs).to.be.a("number");
    expect(answer).to.not.have.property("reason");
  });

  it("answers write access to an account that may write", async () => {
    const answer = await checkDatabase("mysql", live.url("writer"), TIMEOUT_MS);
    expect(answer).to.include({ canRead: true, canWrite: true });
  });

  it("answers write access without read access to an account that may only DELETE", async () => {
    const answer = await checkDatabase(
      "mysql",
      live.url("deleter"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      canRead: false,
      canWrite: true,
    });
    expect(answer.reason).to.be.a("string");
  });

  /** Fails on an implementation that counts INSERT or UPDATE on a relation the account cannot read. */
  it("answers no access to an account that may only INSERT or UPDATE", async () => {
    for (const user of ["inserter", "updater"]) {
      const answer = await checkDatabase("mysql", live.url(user), TIMEOUT_MS);
      expect(answer, user).to.include({ canRead: false, canWrite: false });
    }
  });

  /** Fails on an implementation that matches grantees by the account's name instead of the session's privileges. */
  it("answers read access to an account named with @ that reads through a role another role holds", async () => {
    const answer = await checkDatabase(
      "mysql",
      live.url(encodeURIComponent(ROLE_USER), secretOf(ROLE_USER)),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      user: `${ROLE_USER}@%`,
      canRead: true,
      canWrite: false,
    });
  });

  it("answers no access, with a reason, to an account granted some columns only", async () => {
    const answer = await checkDatabase("mysql", live.url("blind"), TIMEOUT_MS);
    expect(answer).to.include({ canRead: false, canWrite: false });
    expect(answer.reason).to.equal("This account cannot read this database.");
  });

  it("answers a refused password as a server that answered, without the password", async () => {
    const answer = await checkDatabase(
      "mysql",
      live.url("reader", WRONG_SECRET),
      TIMEOUT_MS,
    );
    expect(answer).to.deep.equal({
      reachable: true,
      canRead: false,
      canWrite: false,
      reason: "The database refused this user name or password.",
    });
    expect(JSON.stringify(answer)).to.not.include(WRONG_SECRET);
  });

  it("answers a database the server does not have, and one the account may not use", async () => {
    const missing = await checkDatabase(
      "mysql",
      live.url("root", ADMIN_SECRET, "missing"),
      TIMEOUT_MS,
    );
    expect(missing).to.include({ reachable: true, canRead: false });
    expect(missing.reason).to.equal(
      "The server has no database with this name.",
    );
    const denied = await checkDatabase(
      "mysql",
      live.url("stranger"),
      TIMEOUT_MS,
    );
    expect(denied.reason).to.equal("This account may not use this database.");
  });

  it("answers a URL that names no database once the account has signed in", async () => {
    const answer = await checkDatabase(
      "mysql",
      live.url("reader", undefined, ""),
      TIMEOUT_MS,
    );
    expect(answer).to.include({ reachable: true, user: "reader@%" });
    expect(answer.reason).to.equal(
      "The URL names no database: add its name after the host and port.",
    );
  });
}

function connectionCases(live: Live): void {
  it("answers a port nothing listens on, and a server that never speaks, as unreachable", async () => {
    const port = await closedPort();
    const refused = await checkDatabase(
      "mysql",
      `mysql://reader:${WRONG_SECRET}@127.0.0.1:${port}/shop`,
      TIMEOUT_MS,
    );
    expect(refused).to.include({ reachable: false, canRead: false });
    expect(JSON.stringify(refused)).to.not.include(WRONG_SECRET);
    const silent = await silentServer();
    try {
      const started = performance.now();
      const answer = await checkDatabase(
        "mysql",
        `mysql://reader:${WRONG_SECRET}@127.0.0.1:${silent.port}/shop`,
        TIMEOUT_MS,
      );
      expect(performance.now() - started).to.be.lessThan(TIMEOUT_MS * 3);
      expect(answer.reason).to.equal("The database did not answer in time.");
    } finally {
      await silent.close();
    }
  });

  it("connects to the socket path the URL names, not to its host and port", async () => {
    const answer = await checkDatabase(
      "mysql",
      `${live.url("reader")}?socketPath=/nonexistent/mysqld.sock`,
      TIMEOUT_MS,
    );
    expect(answer).to.include({ reachable: false, canRead: false });
  });

  it("closes its connections once it has answered", async () => {
    const proxy = await relay(live.port());
    try {
      const answer = await checkDatabase(
        "mysql",
        `mysql://root:${ADMIN_SECRET}@127.0.0.1:${proxy.port}/shop`,
        TIMEOUT_MS,
      );
      expect(answer).to.include({ reachable: true });
      expect(await proxy.openAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      await proxy.close();
    }
  });

  it("answers what the database said, and shuts its socket, when the server ignores the goodbye", async () => {
    const proxy = await relayIgnoringGoodbye(live.port(), saysGoodbye);
    const sockets = watchClientSockets(proxy.port);
    try {
      const answer = await checkDatabase(
        "mysql",
        `mysql://root:${ADMIN_SECRET}@127.0.0.1:${proxy.port}/shop`,
        TIMEOUT_MS,
      );
      expect(answer).to.include({
        reachable: true,
        canRead: true,
        canWrite: true,
      });
      expect(await sockets.leftOpenAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      sockets.stop();
      await proxy.close();
    }
  });

  it("closes its connections once the server stops answering after the sign-in", async () => {
    const proxy = await relay(live.port(), stallsAtFirstQuery);
    try {
      const answer = await checkDatabase(
        "mysql",
        `mysql://root:${ADMIN_SECRET}@127.0.0.1:${proxy.port}/shop`,
        TIMEOUT_MS,
      );
      expect(answer.reason).to.equal("The database did not answer in time.");
      expect(await proxy.openAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      await proxy.close();
    }
  });
}

for (const flavour of FLAVOURS) {
  /** Fails on a probe that reads privileges another way than `@antelopejs/mysql`'s catalog does. */
  suite(
    `checking a ${flavour.label} database live${LIVE_SUITE_NOTE}`,
    function () {
      let server: Container | undefined;
      const live: Live = {
        url: (user, password = secretOf(user), database = "shop") =>
          `mysql://${user}:${password}@127.0.0.1:${server?.port}/${database}`,
        port: () => server?.port ?? 0,
      };

      before(async function () {
        this.timeout(START_TIMEOUT_MS);
        server = await startContainer(flavour.image, 3306, [
          "-e",
          `${flavour.passwordVariable}=${ADMIN_SECRET}`,
        ]);
        const admin = { uri: live.url("root", ADMIN_SECRET, "") };
        await waitFor(flavour.label, async () => {
          try {
            await (await createConnection(admin)).end();
            return true;
          } catch {
            return false;
          }
        });
        const connection = await createConnection(admin);
        for (const statement of [...SETUP, flavour.defaultRole]) {
          await connection.query(statement);
        }
        await connection.end();
      });

      after(async function () {
        this.timeout(START_TIMEOUT_MS);
        await removeContainer(server);
      });

      accessCases(live);
      connectionCases(live);
    },
  );
}
