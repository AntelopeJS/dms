import { EventEmitter } from "node:events";
import type { RequestContext } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import { PublishMessage } from "../../../implementations/dms/realtime";
import {
  clearPageTopics,
  InMemoryBroker,
  PresenceTracker,
  registerPageTopic,
  setRealtimeBroker,
  stopRealtime,
} from "../../../realtime";
import { getSessionInfo } from "../../../realtime/sessions";
import {
  ensureSessionOnPage,
  RealtimeController,
} from "../../../routes/realtime";

const USER = { _id: "tenant-topics-user", email: "u@example.com" };
const PAGE_ID = "tenant-topics-page";
const TOPIC = "tenant-topics:orders";
const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const EVENT_TYPE = "changed";

interface FakeStream {
  ctx: RequestContext;
  frames: string[];
  isEnded: () => boolean;
}

const encodeSegment = (value: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

// Without a bound principal the tenant is decoded, not verified, from the
// bearer token: an unsigned one is enough to open a stream in a tenant.
const bearerFor = (tenantId: string): string =>
  `Bearer ${encodeSegment({ alg: "none" })}.${encodeSegment({ tenantId })}.`;

const createFakeStream = (tenantId: string): FakeStream => {
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
  const rawRequest = Object.assign(new EventEmitter(), {
    headers: { authorization: bearerFor(tenantId) },
  });
  const ctx = {
    rawRequest,
    response: { addHeader: () => {}, getWriteStream: () => writer },
  } as unknown as RequestContext;
  return { ctx, frames, isEnded: () => isEnded };
};

const readSessionId = (stream: FakeStream): string => {
  const hello = stream.frames.find((frame) => frame.startsWith("event: hello"));
  const data = hello?.split("\ndata: ")[1] ?? "{}";
  return (JSON.parse(data) as { sessionId: string }).sessionId;
};

const topicFrames = (stream: FakeStream): string[] =>
  stream.frames.filter((frame) => frame.startsWith(`event: ${TOPIC}\n`));

/** Opens a stream in `tenantId` and puts its session on the page. */
const openOnPage = async (tenantId: string): Promise<FakeStream> => {
  const stream = createFakeStream(tenantId);
  await RealtimeController.prototype.userStream.call(
    undefined,
    stream.ctx,
    USER as unknown as User,
  );
  const isOnPage = await ensureSessionOnPage(readSessionId(stream), PAGE_ID, {
    userId: USER._id,
    tenantId,
  });
  expect(isOnPage).to.equal(true);
  return stream;
};

describe("[unit] realtime — tenant-scoped page topics", () => {
  beforeEach(() => {
    setRealtimeBroker(new InMemoryBroker());
    registerPageTopic(PAGE_ID, TOPIC);
  });

  afterEach(async () => {
    await stopRealtime();
    clearPageTopics(PAGE_ID);
    setRealtimeBroker(new InMemoryBroker());
  });

  it("delivers a message published for a tenant to that tenant's sessions only", async () => {
    const streamA = await openOnPage(TENANT_A);
    const streamB = await openOnPage(TENANT_B);

    await PublishMessage(TOPIC, EVENT_TYPE, {
      payload: { count: 1 },
      tenantId: TENANT_A,
    });

    expect(topicFrames(streamA)).to.have.length(1);
    expect(topicFrames(streamB)).to.have.length(0);
  });

  it("still delivers a message published without a tenant to every session", async () => {
    const streamA = await openOnPage(TENANT_A);
    const streamB = await openOnPage(TENANT_B);

    await PublishMessage(TOPIC, EVENT_TYPE);

    expect(topicFrames(streamA)).to.have.length(1);
    expect(topicFrames(streamB)).to.have.length(1);
  });

  it("ends a stream whose page request comes from another workspace", async () => {
    const stream = await openOnPage(TENANT_A);
    const sessionId = readSessionId(stream);

    // The browser switched to tenant B; the stream still belongs to tenant A.
    const isOnPage = await ensureSessionOnPage(sessionId, PAGE_ID, {
      userId: USER._id,
      tenantId: TENANT_B,
    });

    expect(isOnPage).to.equal(false);
    expect(stream.isEnded()).to.equal(true);
    expect(getSessionInfo(sessionId)).to.equal(undefined);
  });

  it("ends a stream whose page request comes from another account", async () => {
    const stream = await openOnPage(TENANT_A);
    const sessionId = readSessionId(stream);

    const isOnPage = await ensureSessionOnPage(sessionId, PAGE_ID, {
      userId: "another-user",
      tenantId: TENANT_A,
    });

    expect(isOnPage).to.equal(false);
    expect(stream.isEnded()).to.equal(true);
  });

  it("reaches the new workspace once the client reconnects after a switch", async () => {
    const stale = await openOnPage(TENANT_A);
    await ensureSessionOnPage(readSessionId(stale), PAGE_ID, {
      userId: USER._id,
      tenantId: TENANT_B,
    });
    const current = await openOnPage(TENANT_B);

    await PublishMessage(TOPIC, EVENT_TYPE, { tenantId: TENANT_A });
    await PublishMessage(TOPIC, EVENT_TYPE, { tenantId: TENANT_B });

    expect(topicFrames(stale)).to.have.length(0);
    expect(topicFrames(current)).to.have.length(1);
  });
});

interface SharedFrame {
  sessionId: string;
  event: string;
}

/** The session frames a shared connection's stream carried. */
const sharedFrames = (stream: FakeStream): SharedFrame[] =>
  stream.frames
    .filter((frame) => frame.startsWith("event: session\n"))
    .map(
      (frame) => JSON.parse(frame.split("\ndata: ")[1] ?? "{}") as SharedFrame,
    );

/** Opens a browser's shared connection and returns its id. */
const openSharedConnection = async (stream: FakeStream): Promise<string> => {
  await RealtimeController.prototype.connectionStream.call(
    undefined,
    stream.ctx,
    USER as unknown as User,
  );
  const hello = stream.frames.find((frame) => frame.startsWith("event: hello"));
  const data = hello?.split("\ndata: ")[1] ?? "{}";
  return (JSON.parse(data) as { connectionId: string }).connectionId;
};

/** Opens a tab's session on the connection, in `tenantId`, on the page. */
const openTabOnPage = async (
  connectionId: string,
  tenantId: string,
): Promise<string> => {
  const greeting = await RealtimeController.prototype.openSession.call(
    undefined,
    createFakeStream(tenantId).ctx,
    { connectionId },
    USER as unknown as User,
  );
  const sessionId = greeting.sessionId!;
  await ensureSessionOnPage(sessionId, PAGE_ID, { userId: USER._id, tenantId });
  return sessionId;
};

describe("[unit] realtime — tenant scoping on a connection shared by tabs", () => {
  beforeEach(() => {
    setRealtimeBroker(new InMemoryBroker());
    registerPageTopic(PAGE_ID, TOPIC);
  });

  afterEach(async () => {
    await stopRealtime();
    clearPageTopics(PAGE_ID);
    setRealtimeBroker(new InMemoryBroker());
  });

  it("delivers each tab's session the messages of its own workspace", async () => {
    const stream = createFakeStream(TENANT_A);
    const connectionId = await openSharedConnection(stream);
    const tabA = await openTabOnPage(connectionId, TENANT_A);
    const tabB = await openTabOnPage(connectionId, TENANT_B);

    await PublishMessage(TOPIC, EVENT_TYPE, { tenantId: TENANT_A });

    const topicSessions = sharedFrames(stream)
      .filter((frame) => frame.event === TOPIC)
      .map((frame) => frame.sessionId);
    expect(topicSessions).to.deep.equal([tabA]);
    expect(topicSessions).not.to.include(tabB);
  });

  it("ends only the session whose page request comes from another workspace, and tells its tab", async () => {
    const stream = createFakeStream(TENANT_A);
    const connectionId = await openSharedConnection(stream);
    const stale = await openTabOnPage(connectionId, TENANT_A);
    const other = await openTabOnPage(connectionId, TENANT_A);

    const isOnPage = await ensureSessionOnPage(stale, PAGE_ID, {
      userId: USER._id,
      tenantId: TENANT_B,
    });

    expect(isOnPage).to.equal(false);
    expect(stream.isEnded()).to.equal(false);
    expect(getSessionInfo(stale)).to.equal(undefined);
    expect(getSessionInfo(other)).not.to.equal(undefined);
    expect(
      sharedFrames(stream).filter((frame) => frame.event === "session-ended"),
    ).to.deep.equal([
      { sessionId: stale, event: "session-ended", data: { sessionId: stale } },
    ]);

    await PublishMessage(TOPIC, EVENT_TYPE, { tenantId: TENANT_A });
    const topicSessions = sharedFrames(stream)
      .filter((frame) => frame.event === TOPIC)
      .map((frame) => frame.sessionId);
    expect(topicSessions).to.deep.equal([other]);
  });
});

describe("[unit] realtime — tenant-scoped presence", () => {
  const PRESENCE_TOPIC = "tenant-topics:presence";
  const ACTOR = { id: "actor-1", displayName: "Actor" };

  it("shows a tenant's presence to that tenant only, and an unscoped one to all", async () => {
    const broker = new InMemoryBroker();
    const tracker = new PresenceTracker(broker, "instance-1");
    const received: Array<string | undefined> = [];
    broker.subscribe(PRESENCE_TOPIC, (event) => received.push(event.tenantId));

    await tracker.acquire("session-a", PRESENCE_TOPIC, "row-1", {
      actor: ACTOR,
      tenantId: TENANT_A,
    });
    await tracker.acquire("session-x", PRESENCE_TOPIC, "row-2", {
      actor: { id: "actor-2" },
    });

    const rowsSeenBy = async (tenantId: string): Promise<string[]> =>
      (await tracker.snapshotForTopic(PRESENCE_TOPIC, tenantId)).map(
        (entry) => entry.rowId,
      );
    expect(await rowsSeenBy(TENANT_A)).to.deep.equal(["row-1", "row-2"]);
    expect(await rowsSeenBy(TENANT_B)).to.deep.equal(["row-2"]);
    expect(received).to.deep.equal([TENANT_A, undefined]);
  });
});
