import { EventEmitter } from "node:events";
import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  cancelScheduledBroadcast,
  DEV_RELOAD_TOPIC,
  scheduleBroadcast,
  setSlugProvider,
} from "../../../store/frontend";
import {
  buildUserNotificationTopic,
  getRealtimeBroker,
  InMemoryBroker,
  setRealtimeBroker,
  stopRealtime,
  getSessionInfo,
} from "../../../realtime";
import { RealtimeController } from "../../../routes";

const USER = { _id: "shared-connection-user", email: "u@example.com" };
const OTHER_USER = { _id: "shared-connection-other", email: "o@example.com" };

interface FakeStream {
  ctx: RequestContext;
  frames: string[];
  isEnded: () => boolean;
}

interface Frame {
  event: string;
  data: ReturnType<typeof JSON.parse>;
}

interface SessionGreeting {
  ok: boolean;
  sessionId?: string;
  menuTopics?: string[];
  devReloadTopic?: string;
}

const BROADCAST_SETTLE_MS = 400;

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
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The SSE context double supplies lifecycle events and a writer, not the complete HTTP context.
  const ctx = {
    rawRequest,
    response: { addHeader: () => {}, getWriteStream: () => writer },
  } as unknown as RequestContext;
  return { ctx, frames, isEnded: () => isEnded };
};

const parseFrames = (stream: FakeStream): Frame[] =>
  stream.frames
    .filter((frame) => frame.startsWith("event: "))
    .map((frame) => {
      const [eventLine, dataLine] = frame.split("\n");
      return {
        event: eventLine!.slice("event: ".length),
        data: JSON.parse(dataLine!.slice("data: ".length)),
      };
    });

const controller = RealtimeController.prototype;

const openConnection = async (stream: FakeStream): Promise<string> => {
  await controller.connectionStream.call(
    undefined,
    stream.ctx,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The realtime fixture supplies identity fields only, not a complete stored user instance.
    USER as User,
  );
  const hello = parseFrames(stream).find((frame) => frame.event === "hello");
  return hello!.data.connectionId;
};

const openSession = (
  connectionId: string,
  user: typeof USER = USER,
): Promise<SessionGreeting> =>
  controller.openSession.call(
    undefined,
    createFakeStream().ctx,
    connectionId,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The realtime fixture supplies identity fields only, not a complete stored user instance.
    user as User,
  );

const settle = () => new Promise((resolve) => setImmediate(resolve));

const sessionFramesOf = (stream: FakeStream, sessionId: string): Frame[] =>
  parseFrames(stream).filter(
    (frame) => frame.event === "session" && frame.data.sessionId === sessionId,
  );

describe("[unit] realtime — shared connection", () => {
  beforeEach(() => setRealtimeBroker(new InMemoryBroker()));
  afterEach(async () => {
    await stopRealtime();
    setRealtimeBroker(new InMemoryBroker());
  });

  it("hosts a session per tab, each one's frames enveloped with its id", async () => {
    const stream = createFakeStream();
    const connectionId = await openConnection(stream);
    const first = await openSession(connectionId);
    const second = await openSession(connectionId);
    expect(first.ok).to.equal(true);
    expect(first.sessionId).to.not.equal(second.sessionId);
    expect(first.menuTopics).to.be.an("array").that.is.not.empty;

    await settle();
    await getRealtimeBroker().publish({
      topic: buildUserNotificationTopic(USER._id),
      type: "notification:new",
      ts: 1,
    });

    for (const greeting of [first, second]) {
      const delivered = sessionFramesOf(stream, greeting.sessionId!).filter(
        (frame) => frame.data.data.type === "notification:new",
      );
      expect(delivered).to.have.length(1);
      expect(delivered[0]!.data.event).to.equal(
        buildUserNotificationTopic(USER._id),
      );
    }
  });

  it("ends one tab's session and leaves the other and the stream open", async () => {
    const stream = createFakeStream();
    const connectionId = await openConnection(stream);
    const first = await openSession(connectionId);
    const second = await openSession(connectionId);

    const ack = await controller.closeSession.call(
      undefined,
      connectionId,
      first.sessionId!,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The realtime fixture supplies identity fields only, not a complete stored user instance.
      USER as User,
    );

    expect(ack.ok).to.equal(true);
    expect(getSessionInfo(first.sessionId!)).to.equal(undefined);
    expect(getSessionInfo(second.sessionId!)).to.not.equal(undefined);
    expect(stream.isEnded()).to.equal(false);
  });

  it("closes one session alone, telling its tab on the shared stream", async () => {
    const stream = createFakeStream();
    const connectionId = await openConnection(stream);
    const first = await openSession(connectionId);
    const second = await openSession(connectionId);

    await getSessionInfo(first.sessionId!)!.close();

    expect(getSessionInfo(first.sessionId!)).to.equal(undefined);
    expect(getSessionInfo(second.sessionId!)).to.not.equal(undefined);
    expect(stream.isEnded()).to.equal(false);
    const ended = sessionFramesOf(stream, first.sessionId!).filter(
      (frame) => frame.data.event === "session-ended",
    );
    expect(ended).to.have.length(1);
    expect(
      sessionFramesOf(stream, second.sessionId!).some(
        (frame) => frame.data.event === "session-ended",
      ),
    ).to.equal(false);
  });

  it("refuses to end a session for another user", async () => {
    const connectionId = await openConnection(createFakeStream());
    const greeting = await openSession(connectionId);

    const ack = await controller.closeSession.call(
      undefined,
      connectionId,
      greeting.sessionId!,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The foreign-user fixture supplies identity fields only, not a complete stored user instance.
      OTHER_USER as User,
    );

    expect(ack.ok).to.equal(false);
    expect(getSessionInfo(greeting.sessionId!)).to.not.equal(undefined);
  });

  it("refuses to end a session through another connection", async () => {
    const connectionId = await openConnection(createFakeStream());
    const otherConnectionId = await openConnection(createFakeStream());
    const greeting = await openSession(connectionId);

    const ack = await controller.closeSession.call(
      undefined,
      otherConnectionId,
      greeting.sessionId!,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The realtime fixture supplies identity fields only, not a complete stored user instance.
      USER as User,
    );

    expect(ack.ok).to.equal(false);
    expect(getSessionInfo(greeting.sessionId!)).to.not.equal(undefined);
  });

  it("ends every session on it when the browser drops the stream", async () => {
    const stream = createFakeStream();
    const connectionId = await openConnection(stream);
    const sessions = [
      await openSession(connectionId),
      await openSession(connectionId),
    ];

    stream.ctx.rawRequest.emit("close");
    await settle();

    for (const { sessionId } of sessions) {
      expect(getSessionInfo(sessionId!)).to.equal(undefined);
    }
    expect((await openSession(connectionId)).ok).to.equal(false);
  });

  it("answers no session on a connection it does not know", async () => {
    expect((await openSession("unknown-connection")).ok).to.equal(false);
    expect((await openSession("")).ok).to.equal(false);
  });

  it("refuses another user a session on the connection", async () => {
    const connectionId = await openConnection(createFakeStream());
    let status: number | undefined;
    try {
      await openSession(connectionId, OTHER_USER);
    } catch (error: PromiseRejectedResult["reason"]) {
      status = error.status;
    }
    expect(status).to.equal(403);
  });

  it("carries the dev reload signal once per connection, as its sessions say", async () => {
    const stream = createFakeStream();
    const connectionId = await openConnection(stream);
    const greetings = [
      await openSession(connectionId),
      await openSession(connectionId),
    ];
    setSlugProvider(() => ["/orders"]);

    scheduleBroadcast();
    await new Promise((resolve) => setTimeout(resolve, BROADCAST_SETTLE_MS));

    expect(greetings.map((greeting) => greeting.devReloadTopic)).to.deep.equal([
      DEV_RELOAD_TOPIC,
      DEV_RELOAD_TOPIC,
    ]);
    const reloads = parseFrames(stream).filter(
      (frame) => frame.event === DEV_RELOAD_TOPIC,
    );
    expect(reloads).to.have.length(1);
    expect(reloads[0]!.data).to.include({
      topic: DEV_RELOAD_TOPIC,
      type: "resync",
    });
    cancelScheduledBroadcast();
    setSlugProvider(() => []);
  });

  it("ends a shared connection on stop, sessions or not", async () => {
    const idle = createFakeStream();
    await openConnection(idle);
    const busy = createFakeStream();
    const greeting = await openSession(await openConnection(busy));

    await stopRealtime();

    expect(idle.isEnded()).to.equal(true);
    expect(busy.isEnded()).to.equal(true);
    expect(getSessionInfo(greeting.sessionId!)).to.equal(undefined);
  });
});
