import { expect } from "chai";
import { Client } from "pg";
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
  type Stall,
  silentServer,
  START_TIMEOUT_MS,
  startContainer,
  waitFor,
  watchClientSockets,
  secretOf,
} from "./helpers/database-servers";

const TIMEOUT_MS = 1000;
const ADMIN_SECRET = secretOf("admin");
const WRONG_SECRET = secretOf("wrong");

/** The first byte of a simple query message, PostgreSQL's Query. */
const QUERY_MESSAGE = 0x51;
/** The first byte of the message a client sends before it closes, PostgreSQL's Terminate. */
const TERMINATE_MESSAGE = 0x58;

function saysGoodbye(chunk: Buffer, fromClient: boolean): boolean {
  return fromClient && chunk[0] === TERMINATE_MESSAGE;
}
const ROLES = ["reader", "writer", "inserter", "updater", "deleter", "blind"];

const SETUP = [
  "CREATE TABLE orders (id int PRIMARY KEY, total int)",
  "CREATE TABLE notes (id int PRIMARY KEY)",
  ...ROLES.map(
    (role) => `CREATE ROLE ${role} LOGIN PASSWORD '${secretOf(role)}'`,
  ),
  `GRANT USAGE ON SCHEMA public TO ${ROLES.join(", ")}`,
  "GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader",
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO writer",
  "GRANT INSERT ON orders TO inserter",
  "GRANT UPDATE ON notes TO updater",
  "GRANT DELETE ON notes TO deleter",
];

const suite = dockerAvailable ? describe : describe.skip;

let server: Container | undefined;

/** The server never sees the first query: the sign-in is through and nothing more is answered. */
function stallsAtFirstQuery(): Stall {
  return (chunk, fromClient) => fromClient && chunk[0] === QUERY_MESSAGE;
}

function urlOf(user: string, password = secretOf(user), database = "shop") {
  return `postgres://${user}:${password}@127.0.0.1:${server?.port}/${database}`;
}

async function connectAs(user: string, database: string) {
  const client = new Client({
    connectionString: `postgres://${user}:${ADMIN_SECRET}@127.0.0.1:${server?.port}/${database}`,
  });
  await client.connect();
  return client;
}

async function startServer() {
  server = await startContainer("postgres:18", 5432, [
    "-e",
    `POSTGRES_PASSWORD=${ADMIN_SECRET}`,
  ]);
  await waitFor("PostgreSQL", async () => {
    try {
      await (await connectAs("postgres", "postgres")).end();
      return true;
    } catch {
      return false;
    }
  });
  const admin = await connectAs("postgres", "postgres");
  await admin.query("CREATE DATABASE shop");
  await admin.end();
  const owner = await connectAs("postgres", "shop");
  for (const statement of SETUP) {
    await owner.query(statement);
  }
  await owner.end();
}

function rolePrivilegeCases() {
  it("answers read access and no write access to a role that may only SELECT", async () => {
    const answer = await checkDatabase("postgres", urlOf("reader"), TIMEOUT_MS);
    expect(answer).to.include({
      reachable: true,
      user: "reader",
      canRead: true,
      canWrite: false,
    });
    expect(answer.latencyMs).to.be.a("number");
    expect(answer).to.not.have.property("reason");
  });

  /** Fails on an engine table that lists a scheme the probe cannot connect with. */
  it("connects the same way through a postgresql:// URL", async () => {
    const answer = await checkDatabase(
      "postgres",
      urlOf("reader").replace(/^postgres:/, "postgresql:"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      user: "reader",
      canRead: true,
    });
  });

  it("answers write access to a role that may write", async () => {
    const answer = await checkDatabase("postgres", urlOf("writer"), TIMEOUT_MS);
    expect(answer).to.include({
      user: "writer",
      canRead: true,
      canWrite: true,
    });
  });

  it("answers write access without read access to a role that may only INSERT", async () => {
    const answer = await checkDatabase(
      "postgres",
      urlOf("inserter"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      user: "inserter",
      canRead: false,
      canWrite: true,
    });
    expect(answer.reason).to.be.a("string");
  });

  it("answers write access to a role that may only UPDATE, and to one that may only DELETE", async () => {
    for (const role of ["updater", "deleter"]) {
      const answer = await checkDatabase("postgres", urlOf(role), TIMEOUT_MS);
      expect(answer).to.include({ user: role, canRead: false, canWrite: true });
    }
  });

  it("answers no access, with a reason, to a role that sees tables and may use none", async () => {
    const answer = await checkDatabase("postgres", urlOf("blind"), TIMEOUT_MS);
    expect(answer).to.include({ canRead: false, canWrite: false });
    expect(answer.reason).to.equal("This account cannot read this database.");
  });
}

function refusalCases() {
  it("answers a refused password as a server that answered, without the password", async () => {
    const answer = await checkDatabase(
      "postgres",
      urlOf("reader", WRONG_SECRET),
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

  it("answers a database the server does not have as a server that answered", async () => {
    const answer = await checkDatabase(
      "postgres",
      urlOf("reader", undefined, "missing"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({ reachable: true, canRead: false });
    expect(answer.reason).to.equal(
      "The server has no database with this name.",
    );
  });
}

function unreachableCases() {
  it("answers a port nothing listens on as unreachable, within the timeout", async () => {
    const port = await closedPort();
    const started = performance.now();
    const answer = await checkDatabase(
      "postgres",
      `postgres://reader:${WRONG_SECRET}@127.0.0.1:${port}/shop`,
      TIMEOUT_MS,
    );
    expect(performance.now() - started).to.be.lessThan(TIMEOUT_MS);
    expect(answer).to.include({
      reachable: false,
      canRead: false,
      canWrite: false,
    });
    expect(JSON.stringify(answer)).to.not.include(WRONG_SECRET);
  });

  it("answers a server that never speaks as unreachable, within the deadline", async () => {
    const silent = await silentServer();
    try {
      const started = performance.now();
      const answer = await checkDatabase(
        "postgres",
        `postgres://reader:${WRONG_SECRET}@127.0.0.1:${silent.port}/shop`,
        TIMEOUT_MS,
      );
      expect(performance.now() - started).to.be.lessThan(TIMEOUT_MS * 3);
      expect(answer).to.include({ reachable: false });
      expect(answer.reason).to.equal("The database did not answer in time.");
    } finally {
      await silent.close();
    }
  });
}

function connectionCloseCases() {
  it("closes its connections once it has answered", async () => {
    const proxy = await relay(server?.port ?? 0);
    try {
      const answer = await checkDatabase(
        "postgres",
        `postgres://postgres:${ADMIN_SECRET}@127.0.0.1:${proxy.port}/shop`,
        TIMEOUT_MS,
      );
      expect(answer).to.include({ reachable: true });
      expect(await proxy.openAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      await proxy.close();
    }
  });

  /**
   * A client library says goodbye and waits for the server to close, so a server that ignores it
   * keeps the socket open for good. A check that closes through the library alone fails this: its
   * answer is replaced by the deadline's, and its socket stays open.
   */
  it("answers what the database said, and shuts its socket, when the server ignores the goodbye", async () => {
    const proxy = await relayIgnoringGoodbye(server?.port ?? 0, saysGoodbye);
    const sockets = watchClientSockets(proxy.port);
    try {
      const answer = await checkDatabase(
        "postgres",
        `postgres://postgres:${ADMIN_SECRET}@127.0.0.1:${proxy.port}/shop`,
        TIMEOUT_MS,
      );
      expect(answer).to.include({
        reachable: true,
        user: "postgres",
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
    const proxy = await relay(server?.port ?? 0, stallsAtFirstQuery);
    try {
      const answer = await checkDatabase(
        "postgres",
        `postgres://postgres:${ADMIN_SECRET}@127.0.0.1:${proxy.port}/shop`,
        TIMEOUT_MS,
      );
      expect(answer.reason).to.equal("The database did not answer in time.");
      expect(await proxy.openAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      await proxy.close();
    }
  });
}

suite(`checking a PostgreSQL database live${LIVE_SUITE_NOTE}`, function () {
  before(async function () {
    this.timeout(START_TIMEOUT_MS);
    await startServer();
  });

  after(async function () {
    this.timeout(START_TIMEOUT_MS);
    await removeContainer(server);
  });

  rolePrivilegeCases();
  refusalCases();
  unreachableCases();
  connectionCloseCases();
});
