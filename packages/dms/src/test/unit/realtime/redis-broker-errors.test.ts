import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
