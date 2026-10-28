import {
  Controller,
  Get,
  JSONBody,
  Parameter,
  Post,
  Put,
} from "@antelopejs/interface-api";
import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { notFound, serviceUnavailable } from "./demo-errors";
import { ago, attentionEntries, workspaceActivity } from "./feed-data";

const DEMO_LATENCY_MS = 700;

/** Published when an entry is added to the workspace activity. */
export const ACTIVITY_DEMO_TOPIC = "blocks:activity-demo";
/** Published when API calls are used up, which the quota meter follows. */
export const QUOTA_DEMO_TOPIC = "blocks:quota-demo";
const ACTIVITY_EVENT_TYPE = "activity.add";
const QUOTA_EVENT_TYPE = "quota.update";
const MAX_ADDED_ENTRIES = 5;
const QUOTA_STEP = 5_000;
const QUOTA_MAX = 100_000;
const DEFAULT_PERIOD = "this-month";

const QUOTA_BY_PERIOD: Record<string, number> = {
  "this-month": 61_400,
  "last-month": 97_800,
};

const ATTENTION_COUNT_BY_PERIOD: Record<string, number> = {
  "last-24h": 9,
  "last-7-days": 31,
  "last-30-days": 112,
};

let quotaUsedThisMonth = QUOTA_BY_PERIOD[DEFAULT_PERIOD];
const addedEntries: ActivityFeedItem[] = [];
let addedSequence = 0;

function later<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS),
  );
}

function newEntry(): ActivityFeedItem {
  addedSequence += 1;
  return {
    id: `added-${addedSequence}`,
    icon: "i-ph-plus-circle",
    tone: "success",
    title: `Order #${10500 + addedSequence} placed`,
    meta: ["Added from the page header", "realtime"],
    date: ago(0),
    unread: true,
  };
}

interface WorkspaceSettings {
  name: string;
  slug: string;
  language: string;
  description: string;
}

const WORKSPACE_KEYS = ["name", "slug", "language", "description"] as const;

const workspace: WorkspaceSettings = {
  name: "Acme Logistics",
  slug: "acme",
  language: "en-GB",
  description: "Shipping, inventory and invoicing for the Benelux depots.",
};

export class BlocksFeedApiController extends Controller("/api/blocks-feed") {
  @Get("activity")
  getActivity() {
    return later({ items: [...addedEntries, ...workspaceActivity()] });
  }

  @Post("activity/add")
  async addActivity() {
    addedEntries.unshift(newEntry());
    addedEntries.splice(MAX_ADDED_ENTRIES);
    await PublishMessage(ACTIVITY_DEMO_TOPIC, ACTIVITY_EVENT_TYPE);
    return { ok: true };
  }

  @Get("attention")
  getAttention(@Parameter("preset", "query") preset?: string) {
    return later({
      items: attentionEntries(),
      count: ATTENTION_COUNT_BY_PERIOD[preset ?? ""],
    });
  }

  @Get("quota")
  getQuota(@Parameter("preset", "query") preset?: string) {
    const isCurrentMonth = (preset ?? DEFAULT_PERIOD) === DEFAULT_PERIOD;
    const value = isCurrentMonth
      ? quotaUsedThisMonth
      : (QUOTA_BY_PERIOD[preset ?? ""] ?? 0);
    return later({ value });
  }

  @Post("quota/use")
  async useQuota() {
    quotaUsedThisMonth = Math.min(quotaUsedThisMonth + QUOTA_STEP, QUOTA_MAX);
    await PublishMessage(QUOTA_DEMO_TOPIC, QUOTA_EVENT_TYPE);
    return { value: quotaUsedThisMonth };
  }

  @Post("quota/reset")
  async resetQuota() {
    quotaUsedThisMonth = QUOTA_BY_PERIOD[DEFAULT_PERIOD];
    await PublishMessage(QUOTA_DEMO_TOPIC, QUOTA_EVENT_TYPE);
    return { value: quotaUsedThisMonth };
  }

  @Get("seats")
  getSeats() {
    return later({
      max: 10,
      hint: {
        key: "demo.blocks.meter.seats_hint",
        params: { used: 8, free: 2 },
      },
      segments: [
        {
          value: 6,
          label: {
            key: "demo.blocks.meter.members",
            params: { count: { type: "count", value: 6 } },
          },
        },
        {
          value: 2,
          tone: "soft",
          label: {
            key: "demo.blocks.meter.pending_invites",
            params: { count: { type: "count", value: 2 } },
          },
        },
      ],
    });
  }

  @Get("empty")
  getEmpty() {
    return later({ items: [] });
  }

  @Get("broken")
  async getBroken(): Promise<never> {
    await later(null);
    throw serviceUnavailable();
  }

  @Get("gone")
  async getGone(): Promise<never> {
    await later(null);
    throw notFound("The Shopify connector was removed.", {
      title: "Feed removed",
      icon: "i-ph-plugs",
      actions: [{ label: "Reconnect Shopify", to: "#reconnect" }],
    });
  }

  @Get("workspace")
  getWorkspace() {
    return { ...workspace };
  }

  @Get("workspace/summary")
  getWorkspaceSummary() {
    return later({
      items: [
        { label: "Name", value: workspace.name },
        {
          label: "URL",
          value: `app.antelopejs.com/${workspace.slug}`,
          type: "mono",
        },
        { label: "Language", value: workspace.language, type: "mono" },
      ],
    });
  }

  @Put("workspace")
  updateWorkspace(@JSONBody() update: Partial<WorkspaceSettings>) {
    for (const key of WORKSPACE_KEYS) {
      const value = update?.[key];
      if (typeof value === "string") workspace[key] = value;
    }
    return { ...workspace };
  }
}
