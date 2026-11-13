import { expect } from "chai";
import { checkDatabase } from "../../../implementations/dms-builder/engine/database-check";
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
import { answersAdmin, countRows, setUpShop } from "./helpers/rethinkdb-admin";

const TIMEOUT_MS = 1000;
const ADMIN_SECRET = secretOf("admin");
const WRONG_SECRET = secretOf("wrong");
const HANDSHAKE_MESSAGES = 3;

/** The server goes quiet once the three NUL-ended messages of the sign-in are through. */
function stallsAfterSignIn(): Stall {
  let ended = 0;
  return (chunk, fromClient) => {
    const signedIn = ended >= HANDSHAKE_MESSAGES;
    if (!fromClient) {
      ended += chunk.filter((byte) => byte === 0).length;
    }
    return signedIn;
  };
}

const suite = dockerAvailable ? describe : describe.skip;

suite(`checking a RethinkDB database live${LIVE_SUITE_NOTE}`, function () {
  let server: Container | undefined;

  function urlOf(
    user: string,
    password = secretOf(user),
    database = "shop",
    port = server?.port,
  ) {
    return `rethinkdb://${user}:${password}@127.0.0.1:${port}/${database}`;
  }

  before(async function () {
    this.timeout(START_TIMEOUT_MS);
    server = await startContainer(
      "rethinkdb:2.4",
      28015,
      [],
      ["rethinkdb", "--bind", "all", "--initial-password", ADMIN_SECRET],
    );
    const port = server.port;
    await waitFor("RethinkDB", () => answersAdmin(port, ADMIN_SECRET));
    await setUpShop(port, ADMIN_SECRET, [
      {
        name: "reader",
        password: secretOf("reader"),
        database: { read: true },
      },
      {
        name: "writer",
        password: secretOf("writer"),
        database: { read: true, write: true },
      },
      { name: "blind", password: secretOf("blind") },
    ]);
  });

  after(async function () {
    this.timeout(START_TIMEOUT_MS);
    await removeContainer(server);
  });

  it("answers read access and no write access to an account that may only read", async () => {
    const answer = await checkDatabase(
      "rethinkdb",
      urlOf("reader"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      user: "reader",
      canRead: true,
      canWrite: false,
    });
    expect(answer.latencyMs).to.be.a("number");
    expect(answer).to.not.have.property("reason");
  });

  it("answers write access to an account that may write", async () => {
    const answer = await checkDatabase(
      "rethinkdb",
      urlOf("writer"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      user: "writer",
      canRead: true,
      canWrite: true,
    });
  });

  it("answers no access, with a reason, to an account that may use no table", async () => {
    const answer = await checkDatabase("rethinkdb", urlOf("blind"), TIMEOUT_MS);
    expect(answer).to.include({
      reachable: true,
      user: "blind",
      canRead: false,
      canWrite: false,
    });
    expect(answer.reason).to.equal("This account cannot read this database.");
  });

  it("deletes no row of the tables it asks an account that may write about", async () => {
    const port = server?.port ?? 0;
    await checkDatabase("rethinkdb", urlOf("writer"), TIMEOUT_MS);
    expect(await countRows(port, ADMIN_SECRET, "orders")).to.equal(1);
  });

  it("answers a database with no table as readable and not written to", async () => {
    const answer = await checkDatabase(
      "rethinkdb",
      urlOf("admin", ADMIN_SECRET, "empty"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      canRead: true,
      canWrite: false,
    });
  });

  it("answers a database the server does not have, as an account that signed in", async () => {
    const answer = await checkDatabase(
      "rethinkdb",
      urlOf("admin", ADMIN_SECRET, "missing"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      user: "admin",
      canRead: false,
    });
    expect(answer.reason).to.equal(
      "The server has no database with this name.",
    );
  });

  it("answers a URL that names no database as a server that answered, saying so and holding no query", async () => {
    const address = `rethinkdb://admin:${ADMIN_SECRET}@127.0.0.1:${server?.port}`;
    for (const url of [address, `${address}/`]) {
      const answer = await checkDatabase("rethinkdb", url, TIMEOUT_MS);
      expect(answer, url).to.include({
        reachable: true,
        user: "admin",
        canRead: false,
        canWrite: false,
      });
      expect(answer.reason, url).to.equal(
        "The URL names no database: add its name after the host and port.",
      );
      expect(JSON.stringify(answer), url).to.not.include("r.db(");
    }
  });

  it("answers a refused password as a server that answered, without the password", async () => {
    const answer = await checkDatabase(
      "rethinkdb",
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

  it("answers a port nothing listens on as unreachable, within the timeout", async () => {
    const port = await closedPort();
    const started = performance.now();
    const answer = await checkDatabase(
      "rethinkdb",
      urlOf("reader", WRONG_SECRET, "shop", port),
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
        "rethinkdb",
        urlOf("reader", WRONG_SECRET, "shop", silent.port),
        TIMEOUT_MS,
      );
      expect(performance.now() - started).to.be.lessThan(TIMEOUT_MS * 3);
      expect(answer).to.include({ reachable: false });
      expect(answer.reason).to.equal("The database did not answer in time.");
    } finally {
      await silent.close();
    }
  });

  it("closes its connections once it has answered", async () => {
    const proxy = await relay(server?.port ?? 0);
    try {
      const answer = await checkDatabase(
        "rethinkdb",
        urlOf("admin", ADMIN_SECRET, "shop", proxy.port),
        TIMEOUT_MS,
      );
      expect(answer).to.include({ reachable: true });
      expect(await proxy.openAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      await proxy.close();
    }
  });

  it("answers what the database said, and shuts its socket, when the server ignores the goodbye", async () => {
    const proxy = await relayIgnoringGoodbye(server?.port ?? 0);
    const sockets = watchClientSockets(proxy.port);
    try {
      const answer = await checkDatabase(
        "rethinkdb",
        urlOf("admin", ADMIN_SECRET, "shop", proxy.port),
        TIMEOUT_MS,
      );
      expect(answer).to.include({ reachable: true });
      expect(await sockets.leftOpenAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      sockets.stop();
      await proxy.close();
    }
  });

  it("closes its connections once the server stops answering after the sign-in", async () => {
    const proxy = await relay(server?.port ?? 0, stallsAfterSignIn);
    try {
      const answer = await checkDatabase(
        "rethinkdb",
        urlOf("admin", ADMIN_SECRET, "shop", proxy.port),
        TIMEOUT_MS,
      );
      expect(answer.reason).to.equal("The database did not answer in time.");
      expect(await proxy.openAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      await proxy.close();
    }
  });
});
