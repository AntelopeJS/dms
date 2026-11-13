import { ImplementInterface } from "@antelopejs/interface-core";
import type { RequestContext } from "@antelopejs/interface-api";
import { bindVerifiedRequestPrincipal } from "@antelopejs/interface-dms/auth/internal/request-authenticators";
import {
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import { expect } from "chai";
import { internal as pageImplInternal } from "../../../implementations/dms/page";
import * as permissionsImpl from "../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../implementations/dms/tenant-access";
import {
  clearPageTopics,
  getPresenceTracker,
  getSessionInfo,
  InMemoryBroker,
  registerPageTopic,
  setRealtimeBroker,
  stopRealtime,
} from "../../../realtime";
import { RealtimeController } from "../../../routes";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../helpers/page-access";
import { recordedSseStream } from "../../helpers/recorded-sse-stream";
import { helloConnectionId } from "../../helpers/sse-frames";
import { userFixture } from "../../helpers/user-fixture";

const USER = userFixture({
  _id: "session-header-user",
  email: "h@example.com",
});
const TENANT = "session-header-tenant";
const PAGE_ID = "pages.session-header-page";
const TOPIC = "session-header:presence";
const ROW = "row-1";

class SessionHeaderPage extends PageController("session-header-page", {
  displayName: "Session header",
  category: pagesCategory,
}) {}

const controller = RealtimeController.prototype;
const { memberModel, roleModel } = stubPageAccessModels([PAGE_ID]);

/**
 * A request in the tenant, naming `sessionId` in `x-realtime-session` when
 * given, as a repeated header when it is a list.
 */
const tabRequest = (sessionId?: string | string[]): RequestContext => {
  const { ctx } = recordedSseStream("Bearer session-header");
  bindVerifiedRequestPrincipal(ctx, { userId: USER._id, tenantId: TENANT });
  if (sessionId !== undefined) {
    ctx.rawRequest.headers["x-realtime-session"] = sessionId;
  }
  return ctx;
};

/** Opens a browser connection and a tab's session on it. */
const openSession = async (): Promise<string> => {
  const stream = recordedSseStream("Bearer session-header");
  await controller.connectionStream.call(undefined, stream.ctx, USER);
  const greeting = await controller.openSession.call(
    undefined,
    tabRequest(),
    helloConnectionId(stream.frames),
    USER,
  );
  if (greeting.sessionId === undefined) throw new Error("No session opened");
  return greeting.sessionId;
};

const presentRows = async (sessionId: string): Promise<string[]> =>
  (await getPresenceTracker().snapshotForTopic(TOPIC, TENANT))
    .filter((entry) => entry.sessionId === sessionId)
    .map((entry) => entry.rowId);

describe("[unit] realtime — routes read the tab's session from its header", () => {
  let unregisterPage: () => void = () => undefined;

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    unregisterPage = await registerTestPage(SessionHeaderPage);
  });

  after(() => unregisterPage());

  beforeEach(() => {
    setRealtimeBroker(new InMemoryBroker());
    registerPageTopic(PAGE_ID, TOPIC);
  });

  afterEach(async () => {
    await stopRealtime();
    clearPageTopics(PAGE_ID);
    setRealtimeBroker(new InMemoryBroker());
  });

  it("subscribes the session the header names to the page", async () => {
    const sessionId = await openSession();

    const ack = await controller.subscribePage.call(
      undefined,
      tabRequest(sessionId),
      PAGE_ID,
      roleModel,
      memberModel,
      USER,
    );

    expect(ack).to.deep.equal({ ok: true, topics: [TOPIC] });
    expect(getSessionInfo(sessionId)?.pageId).to.equal(PAGE_ID);
  });

  it("subscribes the session a repeated header names first", async () => {
    const sessionId = await openSession();

    const ack = await controller.subscribePage.call(
      undefined,
      tabRequest([sessionId, "other-session"]),
      PAGE_ID,
      roleModel,
      memberModel,
      USER,
    );

    expect(ack).to.deep.equal({ ok: true, topics: [TOPIC] });
    expect(getSessionInfo(sessionId)?.pageId).to.equal(PAGE_ID);
  });

  it("answers a subscription without the header with ok: false", async () => {
    await openSession();

    const ack = await controller.subscribePage.call(
      undefined,
      tabRequest(),
      PAGE_ID,
      roleModel,
      memberModel,
      USER,
    );

    expect(ack).to.deep.equal({ ok: false, topics: [] });
  });

  it("holds and frees a row's presence for the session the header names", async () => {
    const sessionId = await openSession();
    const body = { pageId: PAGE_ID, topic: TOPIC, key: ROW };

    const acquired = await controller.acquire.call(
      undefined,
      tabRequest(sessionId),
      body,
      roleModel,
      memberModel,
      USER,
    );
    const heldRows = await presentRows(sessionId);
    const released = await controller.release.call(
      undefined,
      tabRequest(sessionId),
      body,
      roleModel,
      memberModel,
      USER,
    );

    expect(acquired).to.deep.equal({ ok: true });
    expect(heldRows).to.deep.equal([ROW]);
    expect(released).to.deep.equal({ ok: true });
    expect(await presentRows(sessionId)).to.deep.equal([]);
  });

  it("holds no presence for a request without the header", async () => {
    const sessionId = await openSession();

    const acquired = await controller.acquire.call(
      undefined,
      tabRequest(),
      { pageId: PAGE_ID, topic: TOPIC, key: ROW },
      roleModel,
      memberModel,
      USER,
    );

    expect(acquired).to.deep.equal({ ok: false });
    expect(await presentRows(sessionId)).to.deep.equal([]);
  });
});
