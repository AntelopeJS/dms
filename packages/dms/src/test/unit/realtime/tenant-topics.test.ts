import { EventEmitter } from "node:events";
import type { RequestContext } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import {
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  RegisterModule,
} from "@antelopejs/interface-dms/page";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import { bindVerifiedRequestPrincipal } from "@antelopejs/interface-dms/auth/internal/request-authenticators";
import { internal as pageImplInternal } from "../../../implementations/dms/page";
import { PublishMessage } from "../../../implementations/dms/realtime";
import {
  clearPageTopics,
  getPresenceTracker,
  InMemoryBroker,
  PresenceTracker,
  registerPageTopic,
  setRealtimeBroker,
  stopRealtime,
  getSessionInfo,
} from "../../../realtime";
import { ensureSessionOnPage, RealtimeController } from "../../../routes";

// SAFETY: The realtime controller reads only the user's id, name and email, never stored-user methods; this fixture supplies id and email.
const USER = { _id: "tenant-topics-user", email: "u@example.com" } as User;
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
    headers: { authorization: `Bearer tenant-topics-${tenantId}` },
  });
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The SSE context double supplies headers, lifecycle events and a writer, not the full HTTP context.
  const ctx = {
    rawRequest,
    response: { addHeader: () => {}, getWriteStream: () => writer },
  } as unknown as RequestContext;

  bindVerifiedRequestPrincipal(ctx, { userId: USER._id, tenantId });
  return { ctx, frames, isEnded: () => isEnded };
};

interface SharedFrame {
  sessionId: string;
  event: string;
  data: { topic?: string; entries?: Array<{ rowId: string }> };
}

/** The session frames a shared connection's stream carried. */
const sharedFrames = (stream: FakeStream): SharedFrame[] =>
  stream.frames
    .filter((frame) => frame.startsWith("event: session\n"))
    .map<SharedFrame>((frame) =>
      JSON.parse(frame.split("\ndata: ")[1] ?? "{}"),
    );

/** Opens a browser's shared connection and returns its id. */
const openSharedConnection = async (stream: FakeStream): Promise<string> => {
  await RealtimeController.prototype.connectionStream.call(
    undefined,
    stream.ctx,
    USER,
  );
  const hello = stream.frames.find((frame) => frame.startsWith("event: hello"));
  const data = hello?.split("\ndata: ")[1] ?? "{}";
  return JSON.parse(data).connectionId;
};

/** Opens a tab's session on the connection, in `tenantId`, on the page. */
const openTabOnPage = async (
  connectionId: string,
  tenantId: string,
  pageId = PAGE_ID,
): Promise<string> => {
  const greeting = await RealtimeController.prototype.openSession.call(
    undefined,
    createFakeStream(tenantId).ctx,
    connectionId,
    USER,
  );
  const sessionId = greeting.sessionId!;
  const isOnPage = await ensureSessionOnPage(sessionId, pageId, {
    userId: USER._id,
    tenantId,
  });
  expect(isOnPage).to.equal(true);
  return sessionId;
};

/** A browser in `tenantId`: its connection, and a tab's session on the page. */
interface BrowserTab {
  stream: FakeStream;
  sessionId: string;
}

const openOnPage = async (
  tenantId: string,
  pageId = PAGE_ID,
): Promise<BrowserTab> => {
  const stream = createFakeStream(tenantId);
  const connectionId = await openSharedConnection(stream);
  return {
    stream,
    sessionId: await openTabOnPage(connectionId, tenantId, pageId),
  };
};

/** The topic frames a browser's connection carried for its sessions. */
const topicFrames = (tab: BrowserTab): SharedFrame[] =>
  sharedFrames(tab.stream).filter((frame) => frame.event === TOPIC);

const sessionEndedFrames = (tab: BrowserTab): SharedFrame[] =>
  sharedFrames(tab.stream).filter((frame) => frame.event === "session-ended");

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
    const browserA = await openOnPage(TENANT_A);
    const browserB = await openOnPage(TENANT_B);

    await PublishMessage(TOPIC, EVENT_TYPE, {
      payload: { count: 1 },
      tenantId: TENANT_A,
    });

    expect(topicFrames(browserA)).to.have.length(1);
    expect(topicFrames(browserB)).to.have.length(0);
  });

  it("still delivers a message published without a tenant to every session", async () => {
    const browserA = await openOnPage(TENANT_A);
    const browserB = await openOnPage(TENANT_B);

    await PublishMessage(TOPIC, EVENT_TYPE);

    expect(topicFrames(browserA)).to.have.length(1);
    expect(topicFrames(browserB)).to.have.length(1);
  });

  it("ends a session whose page request comes from another workspace", async () => {
    const browser = await openOnPage(TENANT_A);

    const isOnPage = await ensureSessionOnPage(browser.sessionId, PAGE_ID, {
      userId: USER._id,
      tenantId: TENANT_B,
    });

    expect(isOnPage).to.equal(false);
    expect(getSessionInfo(browser.sessionId)).to.equal(undefined);
    expect(sessionEndedFrames(browser)).to.have.length(1);
    expect(browser.stream.isEnded()).to.equal(false);
  });

  it("ends a session whose page request comes from another account", async () => {
    const browser = await openOnPage(TENANT_A);

    const isOnPage = await ensureSessionOnPage(browser.sessionId, PAGE_ID, {
      userId: "another-user",
      tenantId: TENANT_A,
    });

    expect(isOnPage).to.equal(false);
    expect(getSessionInfo(browser.sessionId)).to.equal(undefined);
    expect(sessionEndedFrames(browser)).to.have.length(1);
  });

  it("reaches the new workspace once the tab opens a new session after a switch", async () => {
    const stale = await openOnPage(TENANT_A);
    await ensureSessionOnPage(stale.sessionId, PAGE_ID, {
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

describe("[unit] realtime — platform pages see every tenant", () => {
  const MODULE_ID = "tenant-topics-mod";
  const PLATFORM_PAGE_ID = `modules.${MODULE_ID}.tenant-topics-platform`;
  const PRESENCE_TOPIC = "tenant-topics:platform-presence";

  before(async () => {
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    RegisterModule({
      id: MODULE_ID,
      title: "Tenant topics module",
      description: "Module holding a platform page",
      icon: "i-ph-cube",
    });
    const platformPage = PageController("tenant-topics-platform", {
      displayName: "Platform page",
      module: MODULE_ID,
    });
    await GetMetadata(platformPage, PageMetadata).Register();
  });

  beforeEach(() => {
    setRealtimeBroker(new InMemoryBroker());
    registerPageTopic(PAGE_ID, TOPIC);
    registerPageTopic(PLATFORM_PAGE_ID, TOPIC);
    registerPageTopic(PLATFORM_PAGE_ID, PRESENCE_TOPIC);
  });

  afterEach(async () => {
    await stopRealtime();
    clearPageTopics(PAGE_ID);
    clearPageTopics(PLATFORM_PAGE_ID);
    setRealtimeBroker(new InMemoryBroker());
  });

  it("delivers another tenant's message on a platform page, not on a workspace page", async () => {
    const platform = await openOnPage(TENANT_A, PLATFORM_PAGE_ID);
    const workspace = await openOnPage(TENANT_A);

    await PublishMessage(TOPIC, EVENT_TYPE, { tenantId: TENANT_B });

    expect(topicFrames(platform)).to.have.length(1);
    expect(topicFrames(workspace)).to.have.length(0);
  });

  it("stops delivering other tenants' messages once the session leaves the platform page", async () => {
    const browser = await openOnPage(TENANT_A, PLATFORM_PAGE_ID);
    await ensureSessionOnPage(browser.sessionId, PAGE_ID, {
      userId: USER._id,
      tenantId: TENANT_A,
    });

    await PublishMessage(TOPIC, EVENT_TYPE, { tenantId: TENANT_B });

    expect(topicFrames(browser)).to.have.length(0);
  });

  it("shows every tenant's presence in a platform page's snapshot", async () => {
    const holder = await openOnPage(TENANT_B, PLATFORM_PAGE_ID);
    await getPresenceTracker().acquire(
      holder.sessionId,
      PRESENCE_TOPIC,
      "row-1",
      {
        actor: { id: USER._id },
        tenantId: TENANT_B,
      },
    );
    const viewer = await openOnPage(TENANT_A, PLATFORM_PAGE_ID);

    const snapshot = sharedFrames(viewer.stream).find(
      (frame) =>
        frame.event === "snapshot" && frame.data.topic === PRESENCE_TOPIC,
    );
    const entries = snapshot?.data.entries;
    expect(entries?.map((entry) => entry.rowId)).to.deep.equal(["row-1"]);
  });
});

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
