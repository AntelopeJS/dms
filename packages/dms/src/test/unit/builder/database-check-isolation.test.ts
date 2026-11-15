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

const TIMEOUT_MS = 200;
const DEADLINE_MS = TIMEOUT_MS * 3;
const TcpAddress = z.object({ port: z.number() });

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

describe("a database check runs its driver's probe in a process of its own", () => {
  /** Fails on a check that runs the probe in this process, where an uncaught throw on a socket event ends it. */
  it("answers a probe that throws on a socket event as unreachable, and this process keeps running", async () => {
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

  /** Fails on a check that waits for a probe that never answers, or leaves its connection open. */
  it("ends a probe that never answers at the deadline, and leaves no socket of it open", async () => {
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
  }).timeout(10_000);
});

describe("what a database check's probe process survives and gets", () => {
  /** Fails on a check that a MySQL server can end by writing its sign-in OK and a 1-byte error packet in one write. */
  it("answers a MySQL server that coalesces its OK and a short error packet, and this process keeps running", async () => {
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
  }).timeout(10_000);

  /** Fails on a check that hands the probe this process's environment. */
  it("runs the probe with no variable of this process", async () => {
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
      expect(answer.reason).to.match(/environment: (?:SystemRoot,WINDIR)?$/);
    } finally {
      delete process.env.DMS_ISOLATION_SECRET;
    }
  });
});
