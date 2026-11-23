import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { z } from "zod";
import {
  checkDatabase,
  setProbeBasesForTests,
} from "../../../implementations/dms-builder/engine";

/** How long a spec of several checks may take: each check starts a Node process for its probe. */
const PROCESS_TIMEOUT_MS = 20_000;

const TIMEOUT_MS = 200;
const DEADLINE_MS = TIMEOUT_MS * 3;
const TcpAddress = z.object({ port: z.number() });

/** The variables libuv adds to a child's environment on Windows, from the parent's, whatever it is given. */
const WINDOWS_REQUIRED = new Set([
  "HOMEDRIVE",
  "HOMEPATH",
  "LOGONSERVER",
  "PATH",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "USERDOMAIN",
  "USERNAME",
  "USERPROFILE",
  "WINDIR",
]);

/**
 * A project folder whose `@antelopejs/postgres` is a stand-in: its `dist/probe.js` is `source`,
 * which the check runs in its own process as it runs a real driver's probe.
 */
function standInProject(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-probe-stand-in-"));
  const driver = path.join(root, "node_modules", "@antelopejs", "postgres");
  fs.mkdirSync(path.join(driver, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "stand-in-project", private: true }),
  );
  fs.writeFileSync(
    path.join(driver, "package.json"),
    JSON.stringify({ name: "@antelopejs/postgres", version: "0.0.0" }),
  );
  fs.writeFileSync(path.join(driver, "dist", "probe.js"), source);
  return root;
}

async function withStandIn<Result>(
  source: string,
  check: () => Promise<Result>,
): Promise<Result> {
  const root = standInProject(source);
  setProbeBasesForTests([path.join(root, "package.json")]);
  try {
    return await check();
  } finally {
    setProbeBasesForTests();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** A server that counts the sockets a probe opens to it and how many are still open. */
function socketCounter(): Promise<{
  port: number;
  open: () => number;
  opened: () => number;
  close: () => Promise<void>;
}> {
  const sockets = new Set<net.Socket>();
  let opened = 0;
  const server = net.createServer((socket) => {
    opened += 1;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: TcpAddress.parse(server.address()).port,
        open: () => sockets.size,
        opened: () => opened,
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

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("a database check runs its driver's probe in a process of its own", function () {
  this.timeout(PROCESS_TIMEOUT_MS);
  it("answers a probe that throws on a socket event as unreachable, and this process keeps running (fails on a check that runs the probe in this process, where an uncaught throw on a socket event ends it)", async () => {
    const answer = await withStandIn(
      `exports.probe = () => new Promise(() => {
  setTimeout(() => { throw new RangeError("The value of offset is out of range."); }, 10);
});
`,
      () =>
        checkDatabase(
          "postgres",
          "postgres://app:pw@127.0.0.1:1/shop",
          TIMEOUT_MS,
        ),
    );
    expect(answer.reachable).to.equal(false);
    expect(answer.reason).to.match(
      /RangeError: The value of offset is out of range\./,
    );
  });

  it("ends a probe that never answers at the deadline, and leaves no socket of it open (fails on a check that waits for a probe that never answers, or leaves its connection open)", async () => {
    const server = await socketCounter();
    try {
      const started = performance.now();
      const answer = await withStandIn(
        `const net = require("node:net");
exports.probe = ({ url }) => {
  const { port } = new URL(url);
  net.connect(Number(port), "127.0.0.1").on("error", () => {});
  return new Promise(() => {});
};
`,
        () =>
          checkDatabase(
            "postgres",
            `postgres://app:pw@127.0.0.1:${server.port}/shop`,
            TIMEOUT_MS,
          ),
      );
      const elapsed = performance.now() - started;
      expect(answer.reason).to.equal("The database did not answer in time.");
      expect(elapsed).to.be.lessThan(DEADLINE_MS + 1000);
      await pause(300);
      expect(server.opened()).to.equal(1);
      expect(server.open()).to.equal(0);
    } finally {
      await server.close();
    }
  }).timeout(PROCESS_TIMEOUT_MS);
});

describe("what a database check's probe process survives and gets", function () {
  this.timeout(PROCESS_TIMEOUT_MS);
  it("answers a MySQL server that coalesces its OK and a short error packet, and this process keeps running (fails on a check that a MySQL server can end by writing its sign-in OK and a 1-byte error packet in one write)", async () => {
    const frame = (sequence: number, hex: string) => {
      const payload = Buffer.from(hex, "hex");
      const head = Buffer.alloc(4);
      head.writeUIntLE(payload.length, 0, 3);
      head[3] = sequence;
      return Buffer.concat([head, payload]);
    };
    const greeting = [
      "0a",
      Buffer.from("8.4.0\0").toString("hex"),
      "01000000",
      "4141414141414141",
      "00",
      "0fa2",
      "ff",
      "0200",
      "0800",
      "15",
      "00".repeat(10),
      "414141414141414141414141",
      "00",
      Buffer.from("mysql_native_password\0").toString("hex"),
    ].join("");
    const server = net.createServer((socket) => {
      socket.on("error", () => undefined);
      socket.write(frame(0, greeting));
      socket.once("data", () =>
        socket.write(
          Buffer.concat([frame(2, "00000002000000"), frame(0, "ff")]),
        ),
      );
    });
    await new Promise<void>((listening) =>
      server.listen(0, "127.0.0.1", () => listening()),
    );
    try {
      const port = TcpAddress.parse(server.address()).port;
      const answer = await checkDatabase(
        "mysql",
        `mysql://u:p@127.0.0.1:${port}/db`,
        TIMEOUT_MS * 5,
      );
      expect(answer.canRead).to.equal(false);
      expect(answer.reason).to.be.a("string");
    } finally {
      await new Promise((closed) => server.close(closed));
    }
  }).timeout(PROCESS_TIMEOUT_MS);
});

describe("what a database check reads of its probe's output", function () {
  this.timeout(PROCESS_TIMEOUT_MS);
  it("answers what the driver decided after it printed megabytes of lines, and keeps its text whole (fails on a check that settles on the child's exit before its last stdout chunk, or splits a character across chunks)", async () => {
    const user = "é".repeat(100_000);
    const answers = await withStandIn(
      `exports.probe = async () => {
  for (let line = 0; line < 200_000; line += 1) console.log("line " + line);
  return { outcome: "signed-in", latencyMs: 1, user: ${JSON.stringify(user)}, canRead: true, canWrite: true };
};
`,
      () =>
        Promise.all(
          Array.from({ length: 8 }, () =>
            checkDatabase(
              "postgres",
              "postgres://app:pw@127.0.0.1:1/shop",
              TIMEOUT_MS * 25,
            ),
          ),
        ),
    );
    for (const answer of answers) {
      expect(answer.canRead).to.equal(true);
      expect(answer.canWrite).to.equal(true);
      expect(answer.user === user, "user unchanged").to.equal(true);
    }
  }).timeout(30_000);

  it("keeps this process responsive while a driver floods its stdout (fails on a check that re-reads everything a driver printed on every chunk, which holds this process's event loop)", async () => {
    let longest = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }, 10);
    try {
      await withStandIn(
        `exports.probe = () => new Promise(() => {
  const chunk = "l\\n".repeat(32768);
  const go = () => process.stdout.write(chunk, go);
  go();
});
`,
        () =>
          checkDatabase(
            "postgres",
            "postgres://app:pw@127.0.0.1:1/shop",
            TIMEOUT_MS * 5,
          ),
      );
    } finally {
      clearInterval(ticker);
    }
    expect(longest).to.be.lessThan(os.platform() === "win32" ? 1000 : 250);
  }).timeout(PROCESS_TIMEOUT_MS);
});

describe("when a database check takes its probe's answer", function () {
  this.timeout(PROCESS_TIMEOUT_MS);
  it("answers a probe that ends while a process it started holds its output, without waiting for that process (fails on a check that waits for its probe's pipes to close, which a process the probe started can hold open)", async () => {
    const started = performance.now();
    const answer = await withStandIn(
      `const { spawn } = require("node:child_process");
exports.probe = () => {
  spawn(process.execPath, ["-e", "setTimeout(() => {}, 2000)"], {
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  }).unref();
  setTimeout(() => process.exit(3), 50);
  return new Promise(() => {});
};
`,
      () =>
        checkDatabase(
          "postgres",
          "postgres://app:pw@127.0.0.1:1/shop",
          TIMEOUT_MS * 5,
        ),
    );
    expect(answer.reason).to.match(/ended without an answer \(3\)/);
    expect(performance.now() - started).to.be.lessThan(TIMEOUT_MS * 5);
  });

  it("answers what the driver decided after it printed text with no end of line (fails on a check that misses the answer of a driver that printed text with no end of line before it)", async () => {
    const answer = await withStandIn(
      `exports.probe = async () => {
  process.stdout.write("progress...");
  return { outcome: "signed-in", latencyMs: 1, canRead: true, canWrite: false };
};
`,
      () =>
        checkDatabase(
          "postgres",
          "postgres://app:pw@127.0.0.1:1/shop",
          TIMEOUT_MS,
        ),
    );
    expect([answer.canRead, answer.canWrite]).to.deep.equal([true, false]);
  });
});

describe("what a database check's probe process gets", function () {
  this.timeout(PROCESS_TIMEOUT_MS);
  it("runs the probe with no variable of this process, but the system ones libuv adds on Windows (fails on a check that hands the probe this process's environment)", async () => {
    process.env.DMS_ISOLATION_SECRET = "isolation-secret-6d1f";
    try {
      const answer = await withStandIn(
        `exports.probe = async () => ({
  outcome: "refused",
  refusal: "other",
  message: "environment: " + Object.keys(process.env).join(","),
});
`,
        () =>
          checkDatabase(
            "postgres",
            "postgres://app:pw@127.0.0.1:1/shop",
            TIMEOUT_MS,
          ),
      );
      expect(answer.reason).to.not.include("DMS_ISOLATION_SECRET");
      const names = /environment: (.*)$/.exec(answer.reason ?? "")?.[1] ?? "";
      const passed = names === "" ? [] : names.split(",");
      expect(passed).to.satisfy((list: string[]) =>
        list.every((name) =>
          os.platform() === "win32"
            ? WINDOWS_REQUIRED.has(name.toUpperCase())
            : false,
        ),
      );
    } finally {
      delete process.env.DMS_ISOLATION_SECRET;
    }
  });
});
