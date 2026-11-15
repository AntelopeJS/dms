import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { z } from "zod";
import {
  checkDatabase,
  noAnswerReason,
  signInRefusal,
} from "../../../implementations/dms-builder/engine";

const TIMEOUT_MS = 1000;
const ENV_SECRETS = {
  PGPASSWORD: "env-password-6d1f",
  PGUSER: "env-user-6d1f",
};
/**
 * What the check answers for a URL its driver refuses before it signs in: the probe's refusal, or
 * the client's own error, as long as it signs nobody in and sends nothing of this computer.
 */
const REFUSED = /^(?:Could not sign in|Could not check the database): \S/;
const OIDC_TOKEN = "oidc-token-of-this-host-6d1f";
const TcpAddress = z.object({ port: z.number() });

/** The first byte of a password message from a PostgreSQL client. */
const PASSWORD_MESSAGE = 0x70;
/** The authentication request that asks the client for its password in clear. */
const CLEARTEXT_PASSWORD = 3;
const STARTUP_HEADER_BYTES = 8;

interface Listener {
  port: number;
  /** Every byte any client sent, joined. */
  received(): string;
  connections(): number;
  close(): Promise<void>;
}

/**
 * A server that answers a PostgreSQL startup by asking for the password in clear, which is what a
 * host that wants a secret does, and records everything it receives.
 */
function passwordAskingServer(): Promise<Listener> {
  const chunks: Buffer[] = [];
  let count = 0;
  const server = net.createServer((socket) => {
    count += 1;
    let asked = false;
    socket.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
      if (!asked && chunk.length >= STARTUP_HEADER_BYTES) {
        asked = true;
        const ask = Buffer.alloc(9);
        ask.write("R", 0);
        ask.writeInt32BE(8, 1);
        ask.writeInt32BE(CLEARTEXT_PASSWORD, 5);
        socket.write(ask);
      } else if (chunk[0] === PASSWORD_MESSAGE) {
        socket.destroy();
      }
    });
    socket.on("error", () => undefined);
  });
  return listen(server, chunks, () => count);
}

/** A server that accepts connections and says nothing, recording what it receives. */
function silentServer(): Promise<Listener> {
  const chunks: Buffer[] = [];
  let count = 0;
  const server = net.createServer((socket) => {
    count += 1;
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("error", () => undefined);
  });
  return listen(server, chunks, () => count);
}

function listen(
  server: net.Server,
  chunks: Buffer[],
  connections: () => number,
): Promise<Listener> {
  const sockets: net.Socket[] = [];
  server.on("connection", (socket) => sockets.push(socket));
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: TcpAddress.parse(server.address()).port,
        received: () => Buffer.concat(chunks).toString("latin1"),
        connections,
        close: () =>
          new Promise((closed) => {
            for (const socket of sockets) {
              socket.destroy();
            }
            server.close(() => closed());
          }),
      });
    });
  });
}

/** Runs `check` with `variables` set in this process, as a developer's shell would set them. */
async function withEnvironment<Result>(
  variables: Record<string, string>,
  check: () => Promise<Result>,
): Promise<Result> {
  const before = Object.fromEntries(
    Object.keys(variables).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, variables);
  try {
    return await check();
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

describe("what a PostgreSQL check sends of this computer", () => {
  const LOCAL_FILES = REFUSED;

  /** Fails on a check that lets `pg` fill a missing password, user or option from `PG*` variables. */
  it("sends no variable of this process to the server when the URL has no password, and says the server asks for one", async () => {
    const server = await passwordAskingServer();
    try {
      const answer = await withEnvironment(ENV_SECRETS, () =>
        checkDatabase(
          "postgres",
          `postgres://app@127.0.0.1:${server.port}/shop`,
          TIMEOUT_MS,
        ),
      );
      const received = server.received();
      for (const secret of Object.values(ENV_SECRETS)) {
        expect(received, secret).not.to.include(secret);
      }
      expect(received).to.include("app");
      expect(answer).to.deep.equal({
        reachable: true,
        canRead: false,
        canWrite: false,
        reason: "This server asks for a user name and a password.",
      });
    } finally {
      await server.close();
    }
  });

  /** Fails on a check that withholds the password the URL gives, or sends `PGPASSWORD` in its place. */
  it("sends the password of the URL, and only it", async () => {
    const server = await passwordAskingServer();
    try {
      await withEnvironment(ENV_SECRETS, () =>
        checkDatabase(
          "postgres",
          `postgres://app:url-password-6d1f@127.0.0.1:${server.port}/shop`,
          TIMEOUT_MS,
        ),
      );
      expect(server.received()).to.include("url-password-6d1f");
      expect(server.received()).not.to.include(ENV_SECRETS.PGPASSWORD);
    } finally {
      await server.close();
    }
  });

  /** Fails on a check that lets `pg` fill the user or the host from this computer, or present a certificate of it, or reads the URL otherwise than `pg`. */
  it("refuses a URL with no user or host, naming a certificate or key, or holding a control character, before connecting", async () => {
    const server = await passwordAskingServer();
    try {
      const base = `127.0.0.1:${server.port}/shop`;
      const reasons: (string | undefined)[] = [];
      for (const url of [
        `postgres://${base}`,
        `postgres://app:pw@/shop`,
        `postgres://app:pw@${base}?sslcert=/etc/hostname`,
        `postgres://app:pw@${base}?ssl\tkey=/etc/hostname`,
        `postgres://app:pw@${base}?sslroot\tcert=/dev/zero`,
      ]) {
        reasons.push((await checkDatabase("postgres", url, TIMEOUT_MS)).reason);
      }
      expect(server.connections()).to.equal(0);
      for (const reason of reasons) {
        expect(reason).to.match(REFUSED);
      }
    } finally {
      await server.close();
    }
  });

  /** Fails on a refusal so wide that it turns away a URL that names a socket directory, which `pg` connects to as written. */
  it("lets a URL that names a socket directory through", async () => {
    for (const url of [
      "postgres://app:pw@%2Fnonexistent-dms-socket-dir/shop",
      "postgres://app:pw@/shop?host=/nonexistent-dms-socket-dir",
    ]) {
      const answer = await checkDatabase("postgres", url, 200);
      expect(answer.reachable, url).to.equal(false);
      expect(answer.reason, url).to.match(
        /^Could not check the database: .*ENOENT/,
      );
    }
  });

  /** Fails on a check that lets `pg` read an `sslrootcert`, which it reads synchronously while it parses the URL, so a file that never ends holds the process before any deadline. */
  it("refuses every sslrootcert at once, a device or a file that never ends included, before connecting", async () => {
    const server = await passwordAskingServer();
    try {
      const base = `postgres://app:pw@127.0.0.1:${server.port}/shop?sslmode=require&`;
      for (const query of [
        "sslrootcert=/dev/zero",
        "sslrootcert=/proc/self/pagemap",
        "sslrootcert=/sys/kernel/security/apparmor/revision",
        "sslrootcert=/etc/hostname",
        `${"sslrootcert=/etc/hostname&".repeat(10_000)}sslrootcert=/dev/zero`,
      ]) {
        const started = performance.now();
        const answer = await checkDatabase(
          "postgres",
          base + query,
          TIMEOUT_MS,
        );
        expect(performance.now() - started, query.slice(0, 40)).to.be.lessThan(
          TIMEOUT_MS,
        );
        expect(answer.reason, query.slice(0, 40)).to.match(LOCAL_FILES);
      }
      expect(server.connections()).to.equal(0);
    } finally {
      await server.close();
    }
  });
});

describe("an ssl value a PostgreSQL check refuses", () => {
  /** A server that accepts TLS, which is when `pg` reads a key of the `ssl` it was given. */
  function tlsAcceptingServer(): Promise<Listener> {
    const chunks: Buffer[] = [];
    let count = 0;
    const server = net.createServer((socket) => {
      count += 1;
      socket.once("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
        socket.write("S");
      });
      socket.on("error", () => undefined);
    });
    return listen(server, chunks, () => count);
  }

  /** Fails on a check that hands `pg` an `ssl` it keeps as a string, which ends the process once the server accepts TLS. */
  it("refuses an ssl value pg would keep as a string, before connecting, and keeps the ones it reads", async () => {
    const server = await tlsAcceptingServer();
    try {
      const base = `postgres://app:pw@127.0.0.1:${server.port}/shop?`;
      for (const query of [
        "ssl=false",
        "ssl=require",
        "ssl=abc",
        "ssl=true&ssl=abc",
        "ssl=false&sslmode=",
        "sslmode=&ssl=require",
        "sslmode=&ssl=true&ssl=false",
      ]) {
        const answer = await checkDatabase(
          "postgres",
          base + query,
          TIMEOUT_MS,
        );
        expect(answer.reason, query).to.match(REFUSED);
      }
      expect(server.connections()).to.equal(0);
      for (const query of [
        "ssl=no-verify",
        "ssl=false&sslmode=require",
        "ssl=",
        "ssl=0",
      ]) {
        await checkDatabase("postgres", base + query, 200);
      }
      expect(server.connections()).to.equal(4);
    } finally {
      await server.close();
    }
  });
});

describe("the URL options a MySQL check passes on", () => {
  const SSL_SETTING = REFUSED;

  /** Fails on a check that hands `mysql2` a client certificate of this computer, or an option value of a type it dereferences on a socket event. */
  it("refuses an ssl with a certificate or a value of another type, and a socketPath that is not a path, before connecting", async () => {
    const server = await silentServer();
    try {
      const base = `mysql://app:pw@127.0.0.1:${server.port}/shop?`;
      const refusals: [string, RegExp][] = [
        [`ssl=${encodeURIComponent('{"cert":"x","key":"y"}')}`, SSL_SETTING],
        [`ssl=${encodeURIComponent('{"pfx":"x"}')}`, SSL_SETTING],
        [`ssl=${encodeURIComponent('{"ca":1}')}`, SSL_SETTING],
        ["ssl=abc", SSL_SETTING],
        ["ssl=1", SSL_SETTING],
        ["ssl=true", SSL_SETTING],
        [`ssl=%7B%7D&ssl=${encodeURIComponent('{"key":"y"}')}`, SSL_SETTING],
        [`socketPath=${encodeURIComponent('{"port":1}')}`, REFUSED],
        ["ss\tl=abc", REFUSED],
      ];
      for (const [query, reason] of refusals) {
        const answer = await checkDatabase("mysql", base + query, TIMEOUT_MS);
        expect(answer.reason, query).to.match(reason);
      }
      expect(server.connections()).to.equal(0);
    } finally {
      await server.close();
    }
  });

  /** Fails on a refusal so wide that it turns away a URL whose other options only shape how rows are read. */
  it("lets the ssl settings it reads through, and drops the other options", async () => {
    for (const query of [
      "ssl=%7B%7D",
      `ssl=${encodeURIComponent('{"rejectUnauthorized":false}')}`,
      `connectAttributes=${encodeURIComponent('{"x":1}')}&timezone=Z`,
    ]) {
      const answer = await checkDatabase(
        "mysql",
        `mysql://app:pw@127.0.0.1:1/shop?${query}`,
        TIMEOUT_MS,
      );
      expect(answer.reason, query).to.equal(
        "Nothing is listening at this host and port.",
      );
    }
  });
});

describe("what a MongoDB check sends of this computer", () => {
  const OTHER_MECHANISM = REFUSED;
  const LOCAL_FILES = REFUSED;

  /** Fails on a check that lets `mongodb` sign in with an OIDC token file of this process. */
  it("sends no token of this process for an OIDC URL, and opens no connection", async () => {
    const server = await silentServer();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "dms-oidc-"));
    const tokenFile = path.join(folder, "token");
    fs.writeFileSync(tokenFile, OIDC_TOKEN);
    try {
      const url = `mongodb://127.0.0.1:${server.port}/shop?authMechanism=MONGODB-OIDC&authMechanismProperties=ENVIRONMENT:test&directConnection=true`;
      const answer = await withEnvironment({ OIDC_TOKEN_FILE: tokenFile }, () =>
        checkDatabase("mongodb", url, TIMEOUT_MS),
      );
      expect(server.connections()).to.equal(0);
      expect(server.received()).not.to.include(OIDC_TOKEN);
      expect(answer.reason).to.match(OTHER_MECHANISM);
    } finally {
      await server.close();
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  /** Fails on a refusal that a change of case, a repeated key, percent-encoding or a control character the client's parser drops gets past. */
  it("refuses every other mechanism and every file option, however the URL spells it, before connecting", async () => {
    const server = await silentServer();
    try {
      const base = `mongodb://app:pw@127.0.0.1:${server.port}/shop?directConnection=true`;
      const refusals: [string, RegExp][] = [
        ["&authMechanism=MONGODB-AWS", OTHER_MECHANISM],
        ["&AUTHMECHANISM=mongodb-aws", OTHER_MECHANISM],
        ["&authMechanism=PLAIN&authMechanism=MONGODB-AWS", OTHER_MECHANISM],
        ["&authMechanism=MONGODB%2DAWS", OTHER_MECHANISM],
        ["&auth%4Dechanism=GSSAPI", OTHER_MECHANISM],
        ["&authMechanism=MONGODB-X509", OTHER_MECHANISM],
        ["&authMechanism=AWS", OTHER_MECHANISM],
        ["&tlsCAFile=/etc/hostname", LOCAL_FILES],
        ["&TLSCERTIFICATEKEYFILE=/etc/hostname", LOCAL_FILES],
        ["&tls%43RLFile=/etc/hostname", LOCAL_FILES],
        ["&sslCA=/dev/zero", LOCAL_FILES],
        ["&SSLKEY=/etc/hostname", LOCAL_FILES],
        ["&tlsCertificateFile=/etc/hostname", LOCAL_FILES],
        ["&auth\tMechanism=MONGODB-AWS", REFUSED],
        ["&authMechanism=MONGODB-\nAWS", REFUSED],
        ["&tlsCA\rFile=/etc/hostname", REFUSED],
      ];
      for (const [query, reason] of refusals) {
        const answer = await checkDatabase("mongodb", base + query, TIMEOUT_MS);
        expect(answer.reason, query).to.match(reason);
      }
      expect(server.connections()).to.equal(0);
    } finally {
      await server.close();
    }
  });

  /** Fails on a check that hands `mongodb` an `authMechanism` it matches as a regular expression, which holds the process for seconds. */
  it("answers an authMechanism written as a backtracking pattern at once", async () => {
    const mechanism = encodeURIComponent(`${".*".repeat(19)}Z`);
    const started = performance.now();
    const answer = await checkDatabase(
      "mongodb",
      `mongodb://app:pw@127.0.0.1:1/shop?authMechanism=${mechanism}`,
      TIMEOUT_MS,
    );
    expect(performance.now() - started).to.be.lessThan(500);
    expect(answer.reason).to.match(OTHER_MECHANISM);
  });

  /** Fails on a refusal so wide that it turns away the mechanisms that use the URL's credentials. */
  it("lets the mechanisms that use the URL's user name and password through", async () => {
    for (const mechanism of [
      "SCRAM-SHA-256",
      "scram-sha-1",
      "PLAIN",
      "DEFAULT",
    ]) {
      const answer = await checkDatabase(
        "mongodb",
        `mongodb://app:pw@127.0.0.1:1/shop?authMechanism=${mechanism}&directConnection=true`,
        200,
      );
      expect(answer.reason, mechanism).to.equal(
        "Nothing is listening at this host and port.",
      );
    }
  }).timeout(10_000);
});

describe("how long the check takes to word a long message", () => {
  function slowest(word: (message: string) => string, message: string): number {
    let best = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 3; round += 1) {
      const started = performance.now();
      word(message);
      best = Math.min(best, performance.now() - started);
    }
    return Math.max(best, 1);
  }

  /** Fails on a redaction or a query cut whose regular expression backtracks quadratically: a message ten times longer then takes a hundred times as long. */
  it("grows linearly with the length of a server's message, up to a million characters", () => {
    const url = "postgres://app:pw@db.example:5432/shop";
    const words = [
      (message: string) => signInRefusal(message, url),
      (message: string) => noAnswerReason(message, url),
    ];
    for (const filler of ["a", " ", "a1"]) {
      for (const word of words) {
        const short = slowest(word, filler.repeat(100_000));
        const long = slowest(word, filler.repeat(1_000_000));
        expect(long / short, JSON.stringify(filler)).to.be.lessThan(30);
      }
    }
  }).timeout(20_000);
});
