import { randomBytes } from "node:crypto";
import type {
  Probe,
  ProbeAnswer,
  ProbeConfig,
} from "@antelopejs/interface-database-catalog";
import type {
  DatabaseAccess,
  DatabaseEngine,
} from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import {
  checkDatabase,
  DATABASE_ENGINES,
  noAnswerReason,
  type LoadedProbe,
  redact,
  signInRefusal,
  setProbeLoaderForTests,
} from "../../../implementations/dms-builder/engine";

const SAMPLE_SECRET = `${randomBytes(4).toString("hex")}@/x`;
const ENCODED = encodeURIComponent(SAMPLE_SECRET);
const CHECKED_URL = `postgres://${["app", ENCODED].join(":")}@db.example.com:5432/shop`;

/** The check of `engine` with every driver's `probe` answered by `probe`. */
async function checkWith(
  probe: LoadedProbe,
  engine: DatabaseEngine = "postgres",
  timeoutMs = 40,
): Promise<DatabaseAccess> {
  setProbeLoaderForTests(() => probe);
  try {
    return await checkDatabase(engine, CHECKED_URL, timeoutMs);
  } finally {
    setProbeLoaderForTests();
  }
}

/** A driver whose `probe` answers `answer`. */
function answering(answer: ProbeAnswer): Probe {
  return async () => answer;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("the reasons a database check answers", () => {
  it("redact removes the URL, the password as written, decoded and encoded, and any other connection string (fails on an implementation that leaves the URL or the password in a message, in any of their spellings)", () => {
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

  it("redact leaves a message that holds no secret as it is (fails on an implementation that redacts every message into noise)", () => {
    expect(
      redact("Server selection timed out after 700 ms", CHECKED_URL),
    ).to.equal("Server selection timed out after 700 ms");
  });

  it("a refused port and a timeout each get a sentence of their own (fails on an implementation that answers the driver's raw message for a refused port or a timeout)", () => {
    expect(
      noAnswerReason("connect ECONNREFUSED 127.0.0.1:1", CHECKED_URL),
    ).to.equal("Nothing is listening at this host and port.");
    for (const message of [
      "Server selection timed out after 700 ms",
      "the server did not answer within 1000 ms",
    ]) {
      expect(noAnswerReason(message, CHECKED_URL), message).to.equal(
        "The database did not answer in time.",
      );
    }
  });

  it('a failure that carries no message, such as a refused localhost on Node 24, gets a sentence of its own (fails on an implementation that answers an empty message as "Could not check the database: " with nothing after it)', () => {
    for (const message of ["", "  "]) {
      expect(
        noAnswerReason(message, CHECKED_URL),
        JSON.stringify(message),
      ).to.equal("The database could not be reached at this host and port.");
    }
  });

  it("a message no sentence covers is answered without the URL or the password (fails on an implementation that answers a driver's message as it is)", () => {
    const reason = noAnswerReason(
      `cannot parse ${CHECKED_URL} (${SAMPLE_SECRET})`,
      CHECKED_URL,
    );
    expect(reason.includes(SAMPLE_SECRET)).to.equal(false);
    expect(reason.includes("db.example.com")).to.equal(false);
    expect(reason).to.match(/^Could not check the database: /);
  });

  it("words a message of hundreds of thousands of characters in well under a second (fails on a redaction or a query cut whose regular expression backtracks quadratically, which blocks the event loop past the deadline)", () => {
    const started = performance.now();
    for (const filler of ["a", " ", "a1"]) {
      const message = filler.repeat(100_000);
      signInRefusal(message, CHECKED_URL);
      noAnswerReason(message, CHECKED_URL);
    }
    expect(performance.now() - started).to.be.lessThan(1000);
  });

  it("redact removes a connection string glued to the text before it (fails on a redaction that only knows connection strings whose scheme starts the word)", () => {
    expect(
      redact(`at1postgres://other:pw@h/x and x-mysql://u@h`, CHECKED_URL),
    ).to.equal("[hidden] and [hidden]");
  });

  it("a reason holds no query a driver echoes in its message (fails on an implementation that answers a driver's message with the query it echoes: ReQL's backtrace, MongoDB's command)", () => {
    const reql =
      'Database name `a.b` invalid (Use A-Z, a-z, 0-9, _ and - only) in:\nr.db("a.b").tableList()\n     ^^\n';
    expect(noAnswerReason(reql, CHECKED_URL)).to.equal(
      "Could not check the database: Database name `a.b` invalid (Use A-Z, a-z, 0-9, _ and - only)",
    );
    const command =
      'not authorized on shop to execute command { find: "orders", filter: { card: "4111" }, $db: "shop" }';
    expect(signInRefusal(command, CHECKED_URL)).to.equal(
      "Could not sign in: not authorized on shop to execute command",
    );
  });

  it("a word of the echoed query does not pick the sentence of a refused port or a timeout (fails on an implementation that matches a known sentence against the query a driver echoes, not against its message)", () => {
    const message =
      'Database `refused` does not exist in:\nr.db("ECONNREFUSED").tableList()\n';
    expect(noAnswerReason(message, CHECKED_URL)).to.match(
      /^Could not check the database: Database `refused` does not exist$/,
    );
  });
});

describe("what a database check answers for its driver's probe", () => {
  it("answers the read and write verdict of the driver as it is, for every combination (fails on an implementation that recomputes, defaults or swaps the read and write verdict of the driver)", async () => {
    for (const canRead of [true, false]) {
      for (const canWrite of [true, false]) {
        const answer = await checkWith(
          answering({
            outcome: "signed-in",
            latencyMs: 3,
            user: "app",
            canRead,
            canWrite,
          }),
        );
        expect(
          [answer.canRead, answer.canWrite],
          `${canRead} ${canWrite}`,
        ).to.deep.equal([canRead, canWrite]);
      }
    }
  });

  it("answers the account the driver reports as it is, `@` included (fails on an implementation that parses the account the driver reports, which a user name holding `@` breaks)", async () => {
    const answer = await checkWith(
      answering({
        outcome: "signed-in",
        latencyMs: 2.2,
        user: "ops@team@%",
        canRead: true,
        canWrite: false,
      }),
      "mysql",
    );
    expect(answer).to.deep.equal({
      reachable: true,
      latencyMs: 3,
      user: "ops@team@%",
      canRead: true,
      canWrite: false,
    });
  });

  it("answers no user when the driver reports none, and a reason only when the account cannot read (fails on an implementation that sends `user: undefined`, or a reason with a readable database)", async () => {
    expect(
      await checkWith(
        answering({
          outcome: "signed-in",
          latencyMs: 1,
          canRead: true,
          canWrite: true,
        }),
        "mongodb",
      ),
    ).to.deep.equal({
      reachable: true,
      latencyMs: 1,
      canRead: true,
      canWrite: true,
    });
    const unreadable: ProbeAnswer = {
      outcome: "signed-in",
      latencyMs: 1,
      user: "app",
      canRead: false,
      canWrite: false,
    };
    const reasons: string[] = [];
    for (const why of [
      undefined,
      "no-database-named",
      "no-database",
      "cannot-list",
    ] as const) {
      const answer = await checkWith(
        answering(
          why === undefined ? unreadable : { ...unreadable, unreadable: why },
        ),
      );
      reasons.push(answer.reason ?? "none");
    }
    expect(reasons).to.deep.equal([
      "This account cannot read this database.",
      "The URL names no database: add its name after the host and port.",
      "The server has no database with this name.",
      "This account cannot list the tables or collections of this database.",
    ]);
  });
});

describe("what a database check answers when its driver's probe gets no verdict", () => {
  it("answers each refusal of the driver with its sentence, and any other with the server's message without the secrets (fails on an implementation that shows a refusal's raw message, or the URL and password in it)", async () => {
    const reasons: string[] = [];
    for (const refusal of [
      "credentials",
      "host",
      "database",
      "database-denied",
      "sign-in-required",
      "other",
    ] as const) {
      const answer = await checkWith(
        answering({
          outcome: "refused",
          refusal,
          message: `denied for ${CHECKED_URL} (${SAMPLE_SECRET})`,
        }),
      );
      expect(answer.reachable, refusal).to.equal(true);
      expect([answer.canRead, answer.canWrite], refusal).to.deep.equal([
        false,
        false,
      ]);
      reasons.push(answer.reason ?? "none");
    }
    expect(reasons).to.deep.equal([
      "The database refused this user name or password.",
      "The database does not let this account connect from here.",
      "The server has no database with this name.",
      "This account may not use this database.",
      "This server asks for a user name and a password.",
      "Could not sign in: denied for [hidden] ([hidden])",
    ]);
  });

  it("answers a server the driver did not reach as unreachable, with the sentence of its failure (fails on an implementation that answers a server nobody reached as reachable, or with the driver's raw message)", async () => {
    expect(
      await checkWith(
        answering({
          outcome: "unreachable",
          message: "connect ECONNREFUSED 127.0.0.1:1",
        }),
      ),
    ).to.deep.equal({
      reachable: false,
      canRead: false,
      canWrite: false,
      reason: "Nothing is listening at this host and port.",
    });
  });
});

describe("what a database check answers for a driver that misbehaves", () => {
  it("answers a driver that answers in another shape as unreachable, holding nothing it sent (fails on an implementation that trusts what a driver answers without reading it)", async () => {
    for (const answer of [
      undefined,
      { reachable: true, canRead: true, canWrite: true },
      { outcome: "signed-in", latencyMs: 1, canRead: "yes", canWrite: true },
      {
        outcome: "signed-in",
        latencyMs: Number.POSITIVE_INFINITY,
        canRead: true,
        canWrite: true,
      },
      { outcome: "refused", refusal: "banned", message: SAMPLE_SECRET },
    ]) {
      expect(
        await checkWith(async () => answer),
        JSON.stringify(answer),
      ).to.deep.equal({
        reachable: false,
        canRead: false,
        canWrite: false,
        reason:
          "The database driver answered in a way this check does not understand.",
      });
    }
  });

  it("answers a probe that throws without the password (fails on an implementation that lets a driver's error through, with the password in it)", async () => {
    const throwing: Probe = async () => {
      throw new Error(`driver failed on ${CHECKED_URL}: ${SAMPLE_SECRET}`);
    };
    const answer = await checkWith(throwing);
    expect(answer.reachable).to.equal(false);
    expect(JSON.stringify(answer).includes(SAMPLE_SECRET)).to.equal(false);
    expect(JSON.stringify(answer).includes("db.example.com")).to.equal(false);
  });

  it("resolves when a probe throws an error whose message is not a string or cannot be read (fails on an implementation that reads a thrown error's message as a string without checking it, which rejects the check)", async () => {
    const unreadable = new Error("x");
    Object.defineProperty(unreadable, "message", {
      get() {
        throw new Error(`boom ${CHECKED_URL}`);
      },
    });
    const numeric = new Error("x");
    Object.defineProperty(numeric, "message", { value: 42 });
    const thrown = [numeric, unreadable];
    const reasons: (string | undefined)[] = [];
    for (const error of thrown) {
      const answer = await checkWith(async () => {
        throw error;
      });
      expect(answer.reachable).to.equal(false);
      reasons.push(answer.reason);
    }
    expect(reasons).to.deep.equal([
      "Could not check the database: The check ended with an error that carries no message.",
      "The check ended with an error it could not read.",
    ]);
  });

  it("answers an engine whose driver is not installed with the sentence that installs it (fails on an implementation that answers a driver without `probe` with the error of its require)", async () => {
    setProbeLoaderForTests(() => undefined);
    try {
      const reasons: (string | undefined)[] = [];
      for (const engine of DATABASE_ENGINES) {
        reasons.push((await checkDatabase(engine, CHECKED_URL, 40)).reason);
      }
      expect(reasons).to.deep.equal([
        "Install @antelopejs/postgres to connect a PostgreSQL database.",
        "Install @antelopejs/mysql to connect a MySQL or MariaDB database.",
        "Install @antelopejs/mongodb to connect a MongoDB database.",
        "Install @antelopejs/rethinkdb to connect a RethinkDB database.",
      ]);
    } finally {
      setProbeLoaderForTests();
    }
  });
});

describe("the driver a database check calls and the deadline it keeps", () => {
  it("each engine is checked by the probe of its own driver, with the URL and the timeout (fails on an implementation that sends an engine's URL to another engine's driver, or loads every driver)", async () => {
    const loaded: string[] = [];
    const asked: string[] = [];
    setProbeLoaderForTests((engine) => {
      loaded.push(engine);
      return async ({ url, timeoutMs }) => {
        asked.push(`${engine} ${url} ${timeoutMs}`);
        return {
          outcome: "signed-in",
          latencyMs: 1,
          user: engine,
          canRead: true,
          canWrite: false,
        };
      };
    });
    try {
      const users: (string | undefined)[] = [];
      for (const engine of DATABASE_ENGINES) {
        users.push((await checkDatabase(engine, `${engine}://h/db`, 50)).user);
      }
      expect(users).to.deep.equal([...DATABASE_ENGINES]);
      expect(loaded).to.deep.equal([...DATABASE_ENGINES]);
      expect(asked).to.deep.equal([
        "postgres postgres://h/db 50",
        "mysql mysql://h/db 50",
        "mongodb mongodb://h/db 50",
        "rethinkdb rethinkdb://h/db 50",
      ]);
    } finally {
      setProbeLoaderForTests();
    }
  });

  it("a probe that never answers ends the check as unreachable within three timeouts, and its signal is aborted (fails on an implementation with no deadline, or one that leaves the driver's connections open when it passes)", async () => {
    const signals: AbortSignal[] = [];
    const hung: Probe = ({ signal }: ProbeConfig) => {
      signals.push(signal);
      return new Promise(() => undefined);
    };
    const started = performance.now();
    const answer = await checkWith(hung, "rethinkdb", 40);
    expect(answer).to.deep.equal({
      reachable: false,
      canRead: false,
      canWrite: false,
      reason: "The database did not answer in time.",
    });
    expect(performance.now() - started).to.be.lessThan(1000);
    expect(signals.map(({ aborted }) => aborted)).to.deep.equal([true]);
  }).timeout(3000);

  it("the signal is aborted once the probe has answered, and not before (fails on an implementation that aborts the probe before it answers, or never tells it the check is over)", async () => {
    const seen: boolean[] = [];
    let handed: AbortSignal | undefined;
    const slow: Probe = async ({ signal }: ProbeConfig) => {
      handed = signal;
      await pause(10);
      seen.push(signal.aborted);
      return {
        outcome: "signed-in",
        latencyMs: 1,
        canRead: true,
        canWrite: false,
      };
    };
    await checkWith(slow);
    expect(seen).to.deep.equal([false]);
    expect(handed?.aborted).to.equal(true);
  });
});
