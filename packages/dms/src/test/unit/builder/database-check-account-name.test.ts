import net from "node:net";
import os from "node:os";
import type { DatabaseEngine } from "@antelopejs/interface-dms-builder";
import { expect } from "chai";
import { z } from "zod";
import { checkDatabase } from "../../../implementations/dms-builder/engine";

const TIMEOUT_MS = 700;
const PROCESS_TIMEOUT_MS = 30_000;
const TcpAddress = z.object({ port: z.number() });

/** The account this process runs as, which a client library may fall back to when a URL names no user. */
const ACCOUNT = os.userInfo().username;

/** A MySQL greeting for mysql_native_password, so the client answers with its handshake and the user it signs in as. */
function mysqlGreeting(): Buffer {
  const payload = Buffer.from(
    [
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
    ].join(""),
    "hex",
  );
  const head = Buffer.alloc(4);
  head.writeUIntLE(payload.length, 0, 3);
  return Buffer.concat([head, payload]);
}

/** A server that records every byte a client sends, greeting it first when `greeting` is given. */
function recorder(greeting?: Buffer): Promise<{
  port: number;
  received: () => string;
  close: () => Promise<void>;
}> {
  const chunks: Buffer[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
    if (greeting) {
      socket.write(greeting);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: TcpAddress.parse(server.address()).port,
        received: () => Buffer.concat(chunks).toString("latin1"),
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

const URLS: [DatabaseEngine, (port: number) => string, Buffer | undefined][] = [
  ["postgres", (port) => `postgres://127.0.0.1:${port}/shop`, undefined],
  ["postgres", (port) => `postgres://app@127.0.0.1:${port}/shop`, undefined],
  ["mysql", (port) => `mysql://127.0.0.1:${port}/shop`, mysqlGreeting()],
  ["mysql", (port) => `mysql://app@127.0.0.1:${port}/shop`, mysqlGreeting()],
  [
    "mongodb",
    (port) => `mongodb://127.0.0.1:${port}/shop?directConnection=true`,
    undefined,
  ],
  [
    "mongodb",
    (port) => `mongodb://app@127.0.0.1:${port}/shop?directConnection=true`,
    undefined,
  ],
  ["rethinkdb", (port) => `rethinkdb://127.0.0.1:${port}/shop`, undefined],
  ["rethinkdb", (port) => `rethinkdb://app@127.0.0.1:${port}/shop`, undefined],
];

describe("the account a database check signs in as", function () {
  this.timeout(PROCESS_TIMEOUT_MS);

  /**
   * Fails on a driver that signs in as the account this computer runs as when the URL names no
   * user, or names one without a password. On Windows, libuv passes `USERNAME` to the probe's
   * process whatever environment it is given, and `pg` falls back to it.
   */
  it("sends no account name of this computer, whether the URL names no user or a user with no password", async function () {
    if (ACCOUNT.length < 4 || ACCOUNT === "app") {
      this.skip();
    }
    const leaks: string[] = [];
    for (const [engine, url, greeting] of URLS) {
      const server = await recorder(greeting);
      try {
        await checkDatabase(engine, url(server.port), TIMEOUT_MS);
        if (server.received().includes(ACCOUNT)) {
          leaks.push(url(server.port));
        }
      } finally {
        await server.close();
      }
    }
    expect(leaks).to.deep.equal([]);
  });
});
