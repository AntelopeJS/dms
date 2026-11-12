import { EventEmitter } from "node:events";
import type { RequestContext } from "@antelopejs/interface-api";
import { expect } from "chai";
import {
  InMemoryBroker,
  setRealtimeBroker,
  stopRealtime,
  getSessionInfo,
} from "../../../realtime";
import { RealtimeController } from "../../../routes";
import { helloConnectionId } from "../../helpers/sse-frames";
import { userFixture } from "../../helpers/user-fixture";

const USER = userFixture({
  _id: "stop-closes-streams-user",
  email: "u@example.com",
});

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
  // SAFETY: The controller methods under test pass ctx only to openSseStream, which calls response.addHeader, response.getWriteStream and rawRequest.on, and to getRequestTenantId, which reads rawRequest and its authorization header; the double supplies each of those, and its writer implements the write and end that openSseStream calls.
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
  globalThis.setInterval = new Proxy(originalSet, {
    apply: (target, _thisArg, args: Parameters<typeof setInterval>) => {
      const timer = target(...args);
      started.add(timer);
      return timer;
    },
  });
  globalThis.clearInterval = new Proxy(originalClear, {
    apply: (target, _thisArg, args: Parameters<typeof clearInterval>) => {
      cleared.add(args[0]);
      return target(...args);
    },
  });
  return {
    started,
    cleared,
    restore: () => {
      globalThis.setInterval = originalSet;
      globalThis.clearInterval = originalClear;
    },
  };
};

const openConnection = async (stream: FakeStream): Promise<void> => {
  await RealtimeController.prototype.connectionStream.call(
    undefined,
    stream.ctx,
    USER,
  );
};

/** Opens a tab's session on the connection `stream` holds; returns its id. */
const openSession = async (stream: FakeStream): Promise<string> => {
  const greeting = await RealtimeController.prototype.openSession.call(
    undefined,
    createFakeStream().ctx,
    helloConnectionId(stream.frames),
    USER,
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
