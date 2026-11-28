import { expect } from "chai";
import { z } from "zod";
import { bindVerifiedRequestPrincipal } from "@antelopejs/interface-dms/auth/internal/request-authenticators";
import { PublishMessage } from "../../../implementations/dms/realtime";
import {
  getPresenceTracker,
  InMemoryBroker,
  setRealtimeBroker,
  stopRealtime,
} from "../../../realtime";
import { RealtimeController } from "../../../routes";
import { recordedSseStream } from "../../helpers/recorded-sse-stream";
import { helloConnectionId, parseFrameData } from "../../helpers/sse-frames";
import { userFixture } from "../../helpers/user-fixture";
import { defined } from "../../helpers/defined";

const USER = userFixture({
  _id: "greeting-topics-user",
  email: "g@example.com",
});
const TENANT = "greeting-topics-tenant";

const SessionFrameSchema = z.object({
  sessionId: z.string(),
  event: z.string(),
});

describe("[unit] realtime — a session's topics before its greeting", () => {
  let releaseSnapshots: () => void = () => undefined;

  beforeEach(() => {
    setRealtimeBroker(new InMemoryBroker());
    const held = new Promise<void>((resolve) => {
      releaseSnapshots = resolve;
    });
    const tracker = getPresenceTracker();
    const snapshotForTopic = tracker.snapshotForTopic.bind(tracker);
    tracker.snapshotForTopic = async (...args) => {
      await held;
      return snapshotForTopic(...args);
    };
  });

  afterEach(async () => {
    releaseSnapshots();
    await stopRealtime();
    setRealtimeBroker(new InMemoryBroker());
  });

  it("delivers a menu-changed event published right after the greeting while the presence snapshots are still loading (catches a session subscribed to its menu topics only after a snapshot await, whose menu check then misses the event)", async () => {
    const stream = recordedSseStream(`Bearer greeting-topics-${TENANT}`);
    bindVerifiedRequestPrincipal(stream.ctx, {
      userId: USER._id,
      tenantId: TENANT,
    });
    await RealtimeController.prototype.connectionStream.call(
      undefined,
      stream.ctx,
      USER,
    );
    const greeting = await RealtimeController.prototype.openSession.call(
      undefined,
      stream.ctx,
      helloConnectionId(stream.frames),
      USER,
    );
    const menuTopics = defined(greeting.menuTopics);

    for (const topic of menuTopics) {
      await PublishMessage(topic, "menu-changed", { tenantId: TENANT });
    }

    const delivered = stream.frames
      .filter((frame) => frame.startsWith("event: session\n"))
      .map((frame) => parseFrameData(SessionFrameSchema, frame).event);
    expect(delivered).to.include.members(menuTopics);
  });
});
