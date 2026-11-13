import { expect } from "chai";
import { MongoClient } from "mongodb";
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

const TIMEOUT_MS = 1000;
const ROOT_SECRET = secretOf("root");
const WRONG_SECRET = secretOf("wrong");
const PLAIN_ROLES = ["reader", "writer"];

const suite = dockerAvailable ? describe : describe.skip;

/** The server never sees the command that reads the account: the handshake is through and nothing more is answered. */
function stallsAtAccountCommand(): Stall {
  return (chunk, fromClient) =>
    fromClient && chunk.includes("connectionStatus");
}

suite(`checking a MongoDB database live${LIVE_SUITE_NOTE}`, function () {
  let secured: Container | undefined;
  let open: Container | undefined;

  function urlOf(
    user: string,
    password = secretOf(user),
    port = secured?.port,
  ) {
    return `mongodb://${user}:${password}@127.0.0.1:${port}/shop?authSource=shop`;
  }

  async function ready(url: string) {
    await waitFor("MongoDB", async () => {
      const client = new MongoClient(url, { serverSelectionTimeoutMS: 500 });
      try {
        await client.db("admin").command({ ping: 1 });
        return true;
      } catch {
        return false;
      } finally {
        await client.close();
      }
    });
  }

  async function seed(client: MongoClient) {
    const shop = client.db("shop");
    await shop.collection("orders").insertOne({ total: 1 });
    await shop.collection("notes").insertOne({ text: "a" });
    return shop;
  }

  before(async function () {
    this.timeout(START_TIMEOUT_MS);
    [secured, open] = await Promise.all([
      startContainer("mongo:8", 27017, [
        "-e",
        "MONGO_INITDB_ROOT_USERNAME=root",
        "-e",
        `MONGO_INITDB_ROOT_PASSWORD=${ROOT_SECRET}`,
      ]),
      startContainer("mongo:8", 27017),
    ]);
    const rootUrl = `mongodb://root:${ROOT_SECRET}@127.0.0.1:${secured.port}/admin`;
    await ready(rootUrl);
    const root = new MongoClient(rootUrl);
    const shop = await seed(root);
    for (const user of PLAIN_ROLES) {
      await shop.command({
        createUser: user,
        pwd: secretOf(user),
        roles: [{ role: user === "reader" ? "read" : "readWrite", db: "shop" }],
      });
    }
    await shop.command({
      createRole: "listOnly",
      privileges: [
        {
          resource: { db: "shop", collection: "" },
          actions: ["listCollections"],
        },
      ],
      roles: [],
    });
    await shop.command({
      createRole: "insertOnly",
      privileges: [
        {
          resource: { db: "shop", collection: "orders" },
          actions: ["insert", "find"],
        },
      ],
      roles: [],
    });
    await shop.command({
      createUser: "lister",
      pwd: secretOf("lister"),
      roles: ["listOnly"],
    });
    await shop.command({
      createUser: "inserter",
      pwd: secretOf("inserter"),
      roles: ["insertOnly"],
    });
    await root.close();
    await ready(`mongodb://127.0.0.1:${open.port}/shop`);
    const unsecured = new MongoClient(`mongodb://127.0.0.1:${open.port}/shop`);
    await seed(unsecured);
    await unsecured
      .db("viewsonly")
      .createCollection("report", { viewOn: "nothing", pipeline: [] });
    await unsecured.close();
  });

  after(async function () {
    this.timeout(START_TIMEOUT_MS);
    await Promise.all([removeContainer(secured), removeContainer(open)]);
  });

  it("answers read access and no write access to an account that may only find", async () => {
    const answer = await checkDatabase("mongodb", urlOf("reader"), TIMEOUT_MS);
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
    const answer = await checkDatabase("mongodb", urlOf("writer"), TIMEOUT_MS);
    expect(answer).to.include({
      user: "writer",
      canRead: true,
      canWrite: true,
    });
  });

  it("answers no access to an account that lists the collections and finds in none", async () => {
    const answer = await checkDatabase("mongodb", urlOf("lister"), TIMEOUT_MS);
    expect(answer).to.include({
      user: "lister",
      canRead: false,
      canWrite: false,
    });
    expect(answer.reason).to.equal("This account cannot read this database.");
  });

  it("answers that an account that may not list the collections cannot read", async () => {
    const answer = await checkDatabase(
      "mongodb",
      urlOf("inserter"),
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      user: "inserter",
      canRead: false,
    });
    expect(answer.reason).to.equal(
      "This account cannot list the collections of this database.",
    );
  });

  it("answers a refused password as a server that answered, without the password", async () => {
    const answer = await checkDatabase(
      "mongodb",
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

  it("answers a connection with no account to a server that asks for one", async () => {
    const answer = await checkDatabase(
      "mongodb",
      `mongodb://127.0.0.1:${secured?.port}/shop`,
      TIMEOUT_MS,
    );
    expect(answer).to.deep.equal({
      reachable: true,
      canRead: false,
      canWrite: false,
      reason: "This server asks for a user name and a password.",
    });
  });

  it("gives full privileges on a server without access control", async () => {
    const answer = await checkDatabase(
      "mongodb",
      `mongodb://127.0.0.1:${open?.port}/shop`,
      TIMEOUT_MS,
    );
    expect(answer).to.include({
      reachable: true,
      canRead: true,
      canWrite: true,
    });
    expect(answer).to.not.have.property("user");
  });

  it("gives full privileges on an empty database, and on one that holds only a view, of a server without access control", async () => {
    for (const database of ["empty", "viewsonly"]) {
      const answer = await checkDatabase(
        "mongodb",
        `mongodb://127.0.0.1:${open?.port}/${database}`,
        TIMEOUT_MS,
      );
      expect(answer, database).to.include({
        reachable: true,
        canRead: true,
        canWrite: true,
      });
      expect(answer, database).to.not.have.property("user");
    }
  });

  it("answers a port nothing listens on as unreachable, within the timeout", async () => {
    const port = await closedPort();
    const started = performance.now();
    const answer = await checkDatabase(
      "mongodb",
      urlOf("reader", WRONG_SECRET, port),
      TIMEOUT_MS,
    );
    expect(performance.now() - started).to.be.lessThan(TIMEOUT_MS * 3);
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
        "mongodb",
        urlOf("reader", WRONG_SECRET, silent.port),
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
    const proxy = await relay(open?.port ?? 0);
    try {
      const answer = await checkDatabase(
        "mongodb",
        `mongodb://127.0.0.1:${proxy.port}/shop`,
        TIMEOUT_MS,
      );
      expect(answer).to.include({ reachable: true });
      expect(await proxy.openAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      await proxy.close();
    }
  });

  it("answers what the database said, and shuts its sockets, when the server ignores the goodbye", async () => {
    const proxy = await relayIgnoringGoodbye(open?.port ?? 0);
    const sockets = watchClientSockets(proxy.port);
    try {
      const answer = await checkDatabase(
        "mongodb",
        `mongodb://127.0.0.1:${proxy.port}/shop`,
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
    const proxy = await relay(open?.port ?? 0, stallsAtAccountCommand);
    try {
      const answer = await checkDatabase(
        "mongodb",
        `mongodb://127.0.0.1:${proxy.port}/shop`,
        TIMEOUT_MS,
      );
      expect(answer.reason).to.equal("The database did not answer in time.");
      expect(await proxy.openAfter(CLOSE_SETTLE_MS)).to.equal(0);
    } finally {
      await proxy.close();
    }
  });
});
