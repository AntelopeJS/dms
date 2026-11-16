import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock } from "node:test";
import { Logging } from "@antelopejs/interface-core/logging";
import { expect } from "chai";
import Redis from "ioredis";
import { RedisBroker } from "../../../realtime";

interface ConsoleCapture {
  lines: string[];
  restore: () => void;
}

const captureConsoleErrors = (): ConsoleCapture => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return { lines, restore: () => (console.error = original) };
};

describe("[unit] RedisBroker subscriber errors", () => {
  it("handles a connection error of its subscriber instead of leaving it to ioredis' unhandled error log", async () => {
    const client = new Redis({
      path: join(tmpdir(), `dms-no-redis-${randomUUID()}.sock`),
      lazyConnect: true,
      retryStrategy: () => null,
    });
    const broker = new RedisBroker(async () => client);
    const consoleErrors = captureConsoleErrors();
    try {
      const publish = broker.publish({ topic: "t", type: "x", ts: 0 });
      await publish.then(
        () => expect.fail("publish should fail without a Redis server"),
        () => undefined,
      );
    } finally {
      consoleErrors.restore();
      client.disconnect();
    }
    expect(consoleErrors.lines).to.deep.equal([]);
  });
});

describe("[unit] RedisBroker subscriber reconnect logging", () => {
  it("logs one warning when the connection is lost, one line when it is back and nothing per attempt", async () => {
    const subscriber = Object.assign(new EventEmitter(), {
      subscribe: async () => 1,
    });
    // SAFETY: RedisBroker reads only duplicate() from the client, which the stub answers.
    const client = { duplicate: () => subscriber } as Redis;
    const warn = mock.method(Logging, "Warn", () => undefined);
    const info = mock.method(Logging, "Info", () => undefined);
    try {
      await new RedisBroker(async () => client)
        .publish({
          topic: "t",
          type: "x",
          ts: 0,
        })
        .catch(() => undefined);
      for (let attempt = 0; attempt < 5; attempt++) {
        subscriber.emit("error", new Error("ECONNREFUSED"));
      }
      expect(warn.mock.callCount()).to.equal(1);
      expect(info.mock.callCount()).to.equal(0);
      subscriber.emit("ready");
      subscriber.emit("ready");
      expect(info.mock.callCount()).to.equal(1);
      subscriber.emit("error", new Error("ECONNRESET"));
      expect(warn.mock.callCount()).to.equal(2);
    } finally {
      warn.mock.restore();
      info.mock.restore();
    }
  });
});
