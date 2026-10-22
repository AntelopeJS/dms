import { EventEmitter } from "node:events";
import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  InMemoryBroker,
  setRealtimeBroker,
  stopRealtime,
} from "../../../realtime";
import { getSessionInfo } from "../../../realtime/sessions";
import { RealtimeController } from "../../../routes/realtime";

const USER = { _id: "stop-closes-streams-user", email: "u@example.com" };

interface FakeStream {
  ctx: RequestContext;
  frames: string[];
  isEnded: () => boolean;
}

interface TimerSpy {
  started: Set<unknown>;
  cleared: Set<unknown>;
  restore: () => void;
}

const createFakeStream = (): FakeStream => {
  const frames: string[] = [];
  let isEnded = false;
  const writer = {
    write: (frame: string) => {
      frames.push(frame);
      return true;
    },
    end: () => {
      isEnded = true;
    },
  };
  const rawRequest = Object.assign(new EventEmitter(), { headers: {} });
  const ctx = {
    rawRequest,
    response: { addHeader: () => {}, getWriteStream: () => writer },
  } as unknown as RequestContext;
  return { ctx, frames, isEnded: () => isEnded };
};

const spyOnIntervals = (): TimerSpy => {
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  const started = new Set<unknown>();
  const cleared = new Set<unknown>();
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const timer = originalSet(...args);
    started.add(timer);
    return timer;
  }) as typeof setInterval;
  globalThis.clearInterval = ((timer: NodeJS.Timeout) => {
    cleared.add(timer);
    originalClear(timer);
  }) as typeof clearInterval;
  return {
    started,
    cleared,
    restore: () => {
      globalThis.setInterval = originalSet;
      globalThis.clearInterval = originalClear;
    },
  };
};

const readConnectionId = (stream: FakeStream): string => {
  const hello = stream.frames.find((frame) => frame.startsWith("event: hello"));
  const data = hello?.split("\ndata: ")[1] ?? "{}";
  return (JSON.parse(data) as { connectionId: string }).connectionId;
};

const openConnection = async (stream: FakeStream): Promise<void> => {
  await RealtimeController.prototype.connectionStream.call(
    undefined,
    stream.ctx,
    USER as unknown as User,
  );
};

/** Opens a tab's session on the connection `stream` holds; returns its id. */
const openSession = async (stream: FakeStream): Promise<string> => {
  const greeting = await RealtimeController.prototype.openSession.call(
    undefined,
    createFakeStream().ctx,
    readConnectionId(stream),
    USER as unknown as User,
  );
  return greeting.sessionId!;
};

describe("[unit] realtime — stopRealtime ends open SSE streams", () => {
  let timers: TimerSpy;

  beforeEach(() => {
    setRealtimeBroker(new InMemoryBroker());
    timers = spyOnIntervals();
  });

  afterEach(() => {
    timers.restore();
    setRealtimeBroker(new InMemoryBroker());
  });

  it("ends a connection opened before the stop and clears its keepalive", async () => {
    const stream = createFakeStream();
    await openConnection(stream);
    const sessionId = await openSession(stream);
    expect(getSessionInfo(sessionId)).to.not.equal(undefined);
    expect(timers.started.size).to.equal(1);

    await stopRealtime();

    expect(stream.isEnded()).to.equal(true);
    expect([...timers.started].every((t) => timers.cleared.has(t))).to.equal(
      true,
    );
    expect(getSessionInfo(sessionId)).to.equal(undefined);
  });

  it("ends every open stream, not just the first", async () => {
    const streams = [createFakeStream(), createFakeStream()];
    for (const stream of streams) await openConnection(stream);

    await stopRealtime();

    expect(streams.map((stream) => stream.isEnded())).to.deep.equal([
      true,
      true,
    ]);
    expect(timers.cleared.size).to.equal(2);
  });

  it("leaves a stream the client already closed alone", async () => {
    const stream = createFakeStream();
    await openConnection(stream);
    stream.ctx.rawRequest.emit("close");

    await stopRealtime();

    expect(stream.isEnded()).to.equal(false);
  });
});
