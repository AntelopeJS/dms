import { randomBytes } from "node:crypto";
import dns from "node:dns";
import type {
  DatabaseAccess,
  DatabaseEngine,
} from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import {
  CLOSE_GRACE_MS,
  checkConnection,
  DATABASE_ENGINES,
  noAnswerReason,
  parseCheckInput,
  type Probe,
  redact,
  checkDatabase as runCheck,
  serverRefusal,
  setClientLoaderForTests,
  signedIn,
} from "../../../implementations/dms-builder/engine";

const SAMPLE_SECRET = `${randomBytes(4).toString("hex")}@/x`;
const ENCODED = encodeURIComponent(SAMPLE_SECRET);
const CHECKED_URL = `postgres://${["app", ENCODED].join(":")}@db.example.com:5432/shop`;

/** What a probe of these specs answers when it reaches a database. */
const ANSWERED: DatabaseAccess = {
  reachable: true,
  canRead: true,
  canWrite: false,
};

type Check = (
  engine: DatabaseEngine,
  url: string,
  timeoutMs: number,
) => Promise<DatabaseAccess>;

/** The check with each engine's probe answered by the given one. */
function loadCheck(probes: Record<DatabaseEngine, Probe>): Check {
  return (engine, url, timeoutMs) => runCheck(engine, url, timeoutMs, probes);
}

function loadCheckWith(probe: Probe): Check {
  return loadCheck({
    postgres: probe,
    mysql: probe,
    mongodb: probe,
    rethinkdb: probe,
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("the reasons a database check answers", () => {
  /** Fails on an implementation that leaves the URL or the password in a message, in any of their spellings. */
  it("redact removes the URL, the password as written, decoded and encoded, and any other connection string", () => {
    const message = `failed ${CHECKED_URL} for ${SAMPLE_SECRET} and ${ENCODED} and mongodb://other:${["secret", "2"].join("")}@h/x`;
    const redacted = redact(message, CHECKED_URL);
    for (const secret of [
      CHECKED_URL,
      SAMPLE_SECRET,
      ENCODED,
      "secret2",
      "mongodb://",
    ]) {
      expect(redacted.includes(secret), secret).to.equal(false);
    }
  });

  /** Fails on an implementation that redacts every message into noise. */
  it("redact leaves a message that holds no secret as it is", () => {
    expect(
      redact("Server selection timed out after 700 ms", CHECKED_URL),
    ).to.equal("Server selection timed out after 700 ms");
  });

  /** Fails on an implementation that answers the driver's raw message for a refused port or a timeout. */
  it("a refused port and a timeout each get a sentence of their own", () => {
    expect(
      noAnswerReason("connect ECONNREFUSED 127.0.0.1:1", CHECKED_URL),
    ).to.equal("Nothing is listening at this host and port.");
    expect(
      noAnswerReason("Server selection timed out after 700 ms", CHECKED_URL),
    ).to.equal("The database did not answer in time.");
  });

  /** Fails on an implementation that answers a driver's message as it is. */
  it("a message no sentence covers is answered without the URL or the password", () => {
    const reason = noAnswerReason(
      `cannot parse ${CHECKED_URL} (${SAMPLE_SECRET})`,
      CHECKED_URL,
    );
    expect(reason.includes(SAMPLE_SECRET)).to.equal(false);
    expect(reason.includes("db.example.com")).to.equal(false);
    expect(reason).to.match(/^Could not check the database: /);
  });

  /** Fails on an implementation that sends `user: undefined`, or a reason with a readable database. */
  it("an account answers with its user and a reason only when it cannot read", () => {
    expect(
      signedIn(2, undefined, { canRead: true, canWrite: false }),
    ).to.deep.equal({
      reachable: true,
      latencyMs: 2,
      canRead: true,
      canWrite: false,
    });
    expect(
      signedIn(2, "app", { canRead: false, canWrite: false }),
    ).to.deep.equal({
      reachable: true,
      latencyMs: 2,
      user: "app",
      canRead: false,
      canWrite: false,
      reason: "This account cannot read this database.",
    });
  });

  /** Fails on an implementation that answers a driver's message with the query it echoes: ReQL's backtrace, MongoDB's command. */
  it("a reason holds no query a driver echoes in its message", () => {
    const reql =
      'Database name `a.b` invalid (Use A-Z, a-z, 0-9, _ and - only) in:\nr.db("a.b").tableList()\n     ^^\n';
    expect(noAnswerReason(reql, CHECKED_URL)).to.equal(
      "Could not check the database: Database name `a.b` invalid (Use A-Z, a-z, 0-9, _ and - only)",
    );
    const command =
      'not authorized on shop to execute command { find: "orders", filter: { card: "4111" }, $db: "shop" }';
    expect(serverRefusal(command, CHECKED_URL)).to.equal(
      "The server refused the request: not authorized on shop to execute command",
    );
  });

  /** Fails on an implementation that matches a known sentence against the query a driver echoes, not against its message. */
  it("a word of the echoed query does not pick the sentence of a refused port or a timeout", () => {
    const message =
      'Database `refused` does not exist in:\nr.db("ECONNREFUSED").tableList()\n';
    expect(noAnswerReason(message, CHECKED_URL)).to.match(
      /^Could not check the database: Database `refused` does not exist$/,
    );
  });
});

describe("the probe a database check runs and the deadline it keeps", () => {
  /** Fails on an implementation that sends an engine's URL to another engine's probe. */
  it("each engine is checked by its own probe, with the URL and the timeout", async () => {
    const asked: string[] = [];
    const probe =
      (engine: string): Probe =>
      async (url, timeoutMs) => {
        asked.push(`${engine} ${url} ${timeoutMs}`);
        return { ...ANSWERED, user: engine };
      };
    const checkDatabase = loadCheck({
      postgres: probe("postgres"),
      mysql: probe("mysql"),
      mongodb: probe("mongodb"),
      rethinkdb: probe("rethinkdb"),
    });
    const answers: (string | undefined)[] = [];
    for (const engine of DATABASE_ENGINES) {
      answers.push((await checkDatabase(engine, `${engine}://h/db`, 50)).user);
    }
    expect(answers).to.deep.equal([
      "postgres",
      "mysql",
      "mongodb",
      "rethinkdb",
    ]);
    expect(asked).to.deep.equal([
      "postgres postgres://h/db 50",
      "mysql mysql://h/db 50",
      "mongodb mongodb://h/db 50",
      "rethinkdb rethinkdb://h/db 50",
    ]);
  });

  /** Fails on an implementation with no deadline, which waits for a probe that never answers. */
  it("a probe that never answers ends the check as unreachable within three timeouts", async () => {
    const hung: Probe = () => new Promise(() => undefined);
    const checkDatabase = loadCheckWith(hung);
    const started = performance.now();
    const answer = await checkDatabase("postgres", CHECKED_URL, 40);
    expect(answer).to.deep.equal({
      reachable: false,
      canRead: false,
      canWrite: false,
      reason: "The database did not answer in time.",
    });
    expect(performance.now() - started).to.be.lessThan(1000);
  }).timeout(3000);

  /** Fails on an implementation that leaves a connection open when the deadline passes, or answers before it has started closing it. */
  it("the deadline closes what the probe opened, before it answers", async () => {
    const events: string[] = [];
    const stalled: Probe = (_url, _timeoutMs, connections) => {
      connections.add(async () => {
        events.push("closed");
      });
      return new Promise(() => undefined);
    };
    const checkDatabase = loadCheckWith(stalled);
    const answer = await checkDatabase("rethinkdb", CHECKED_URL, 40);
    events.push("answered");
    expect(answer.reason).to.equal("The database did not answer in time.");
    expect(events).to.deep.equal(["closed", "answered"]);
  });

  /** Fails on an implementation that asks for another engine's client, or for none, when it checks one. */
  it("a client is required only when its engine is checked", async () => {
    const asked: string[] = [];
    setClientLoaderForTests((name) => {
      asked.push(name);
      return undefined;
    });
    try {
      const answer = await runCheck(
        "postgres",
        "postgres://u@127.0.0.1:1/db",
        500,
      );
      expect(asked).to.deep.equal(["pg"]);
      expect(answer.reason).to.equal(
        "Install pg to connect a PostgreSQL database.",
      );
    } finally {
      setClientLoaderForTests();
    }
  });
});

describe("the connections a database check closes", () => {
  /** Fails on an implementation that closes a connection only at the deadline, or makes the answer wait for the close to finish. */
  it("an answer starts closing what the probe opened, once, and does not wait for it", async () => {
    const events: string[] = [];
    const answering: Probe = async (_url, _timeoutMs, connections) => {
      connections.add(async () => {
        events.push("closing");
        await pause(20);
        events.push("closed");
      });
      return ANSWERED;
    };
    const checkDatabase = loadCheckWith(answering);
    const answer = await checkDatabase("mongodb", CHECKED_URL, 100);
    events.push("answered");
    expect(answer).to.deep.equal(ANSWERED);
    expect(events).to.deep.equal(["closing", "answered"]);
    await pause(400);
    expect(events).to.deep.equal(["closing", "answered", "closed"]);
  });

  /** Fails on an implementation that waits for a close before it answers: a close that never ends lets the deadline replace the probe's answer. */
  it("the answer is the probe's own when a connection never finishes closing", async () => {
    const stuck: Probe = async (_url, _timeoutMs, connections) => {
      connections.add(() => new Promise(() => undefined));
      return ANSWERED;
    };
    const checkDatabase = loadCheckWith(stuck);
    expect(await checkDatabase("postgres", CHECKED_URL, 40)).to.deep.equal(
      ANSWERED,
    );
  }).timeout(3000);

  /** Fails on an implementation that never shuts a socket its library leaves open, that shuts it before the grace, or that shuts one that closed. */
  it("a connection still open after the grace is shut, and one that closed is left alone", async () => {
    const shut: string[] = [];
    const probe: Probe = async (_url, _timeoutMs, connections) => {
      const never = () => new Promise<void>(() => undefined);
      connections.add(never, () => {
        shut.push("hung");
      });
      connections.add(
        async () => undefined,
        () => {
          shut.push("closed");
        },
      );
      connections.add(
        () => {
          throw new Error("close threw");
        },
        () => {
          shut.push("failed");
        },
      );
      connections.add(never, () => {
        throw new Error("destroy threw");
      });
      return ANSWERED;
    };
    const checkDatabase = loadCheckWith(probe);
    expect(await checkDatabase("postgres", CHECKED_URL, 40)).to.deep.equal(
      ANSWERED,
    );
    expect(shut, "nothing is shut before the grace").to.deep.equal([]);
    await pause(CLOSE_GRACE_MS + 200);
    expect(shut).to.have.length(2);
    expect(new Set(shut)).to.deep.equal(new Set(["failed", "hung"]));
  });

  /** Fails on an implementation that closes only what was open when the deadline passed, so a late connection stays open. */
  it("a connection opened after the deadline is closed at once", async () => {
    const closed: string[] = [];
    const late: Probe = async (_url, _timeoutMs, connections) => {
      await pause(200);
      connections.add(async () => {
        closed.push("late");
      });
      return ANSWERED;
    };
    const checkDatabase = loadCheckWith(late);
    const answer = await checkDatabase("postgres", CHECKED_URL, 40);
    expect(answer.reason).to.equal("The database did not answer in time.");
    await pause(300);
    expect(closed).to.deep.equal(["late"]);
  });

  /** Fails on an implementation that lets a connection that fails to close, or throws when asked, take the answer with it. */
  it("a connection that cannot be closed does not change the answer", async () => {
    const stubborn: Probe = async (_url, _timeoutMs, connections) => {
      connections.add(async () => {
        throw new Error("close failed");
      });
      connections.add(() => {
        throw new Error("close threw");
      });
      return ANSWERED;
    };
    const checkDatabase = loadCheckWith(stubborn);
    expect(await checkDatabase("postgres", CHECKED_URL, 40)).to.deep.equal(
      ANSWERED,
    );
  });

  /** Fails on an implementation that lets a probe's error out, or that answers its message with the password in it. */
  it("a probe that throws is answered, without the password", async () => {
    const broken: Probe = async () => {
      throw new Error(`driver failed on ${CHECKED_URL}: ${SAMPLE_SECRET}`);
    };
    const checkDatabase = loadCheckWith(broken);
    const answer = await checkDatabase("postgres", CHECKED_URL, 40);
    expect(answer.reachable).to.equal(false);
    expect(JSON.stringify(answer).includes(SAMPLE_SECRET)).to.equal(false);
    expect(JSON.stringify(answer).includes("db.example.com")).to.equal(false);
  });
});

/** Fails on a check that refuses an SRV URL, or a probe that hands the driver anything but the URL as typed. */
describe("checking a MongoDB database by an SRV URL", () => {
  it("hands the URL to the driver unchanged, which looks up the SRV record of its host", async () => {
    const host = "cluster0.ab1cd.mongodb.net";
    const url = `mongodb+srv://app@${host}/shop?retryWrites=true&w=majority`;
    const lookups: string[] = [];
    const resolve = dns.promises.resolve;
    dns.promises.resolve = async (name: string, type: string = "A") => {
      lookups.push(`${type} ${name}`);
      throw Object.assign(new Error(`query${type} ENOTFOUND ${name}`), {
        code: "ENOTFOUND",
      });
    };
    try {
      const result = await checkConnection(
        parseCheckInput({ engine: "mongodb", url }),
        true,
      );
      expect(result).to.deep.equal({
        ok: true,
        data: {
          reachable: false,
          canRead: false,
          canWrite: false,
          reason: "This host name could not be found.",
        },
        changes: [],
      });
      expect(lookups).to.have.members([
        `SRV _mongodb._tcp.${host}`,
        `TXT ${host}`,
      ]);
    } finally {
      dns.promises.resolve = resolve;
    }
  });
});
