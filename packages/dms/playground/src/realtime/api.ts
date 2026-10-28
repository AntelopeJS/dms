import { Controller, Get, Post } from "@antelopejs/interface-api";
import type {
  ActivityFeedItem,
  ActivityFeedResponse,
} from "@antelopejs/interface-dms/base";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  PublishMessage,
  type RealtimeMessage,
  SubscribeMessage,
} from "@antelopejs/interface-dms/realtime";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

export const REALTIME_DEMO_API = "/api/playground/realtime";
/** Bound to the realtime page with RegisterPageTopic, read by a Vue component. */
export const PINGS_TOPIC = "playground:pings";
/** Published by the backend subscriber, read by the page's activity feed. */
export const RECEIVED_TOPIC = "playground:pings-received";
const PING_TYPE = "ping";
const RECEIVED_SIZE = 20;

const received: ActivityFeedItem[] = [];

function onPing(message: RealtimeMessage): void {
  received.unshift({
    id: String(message.ts),
    icon: "i-ph-ear",
    title: `${message.type} on ${message.topic}`,
    detail: `actorId ${message.actorId ?? "none"}, payload ${JSON.stringify(message.payload ?? {})}`,
    date: new Date(message.ts).toISOString(),
  });
  received.splice(RECEIVED_SIZE);
  fireAndForget(
    PublishMessage(RECEIVED_TOPIC, PING_TYPE),
    "realtime demo refresh",
  );
}

SubscribeMessage(PINGS_TOPIC, onPing);

interface PingResult {
  published: boolean;
}

export class RealtimeDemoController extends Controller(REALTIME_DEMO_API) {
  @Post("ping")
  async ping(@AuthUser() user: User): Promise<PingResult> {
    await PublishMessage(PINGS_TOPIC, PING_TYPE, {
      payload: { at: Date.now(), from: user.name },
      actorId: user._id,
    });
    return { published: true };
  }

  @Get("received")
  list(@AuthUser() _user: User): ActivityFeedResponse {
    return { items: received, count: received.length };
  }
}
