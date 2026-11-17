import { expect } from "chai";
import {
  InMemoryBroker,
  setRealtimeBroker,
  stopRealtime,
  getSessionInfo,
} from "../../../realtime";
import { RealtimeController } from "../../../routes";
import {
  type RecordedSseStream,
  recordedSseStream,
} from "../../helpers/recorded-sse-stream";
import { helloConnectionId } from "../../helpers/sse-frames";
import { userFixture } from "../../helpers/user-fixture";

const USER = userFixture({
  _id: "stop-closes-streams-user",
  email: "u@example.com",
});

type FakeStream = RecordedSseStream;

interface TimerSpy {
  started: Set<unknown>;
  cleared: Set<unknown>;
  restore: () => void;
}

const createFakeStream = (): FakeStream => recordedSseStream();

const spyOnIntervals = (): TimerSpy => {
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  const started = new Set<unknown>();
  const cleared = new Set<unknown>();
  // SAFETY: Parameters reads only the last of setInterval's overloads, so the spy's own type names one; at runtime it forwards every argument to the original setInterval and answers its handle unchanged, so each call of any overload behaves as the original's.
  globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => {
    const timer = originalSet(...args);
    started.add(timer);
    return timer;
  }) as typeof setInterval;
  globalThis.clearInterval = (
    timer: NodeJS.Timeout | string | number | undefined,
  ) => {
    cleared.add(timer);
    originalClear(timer);
  };
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
