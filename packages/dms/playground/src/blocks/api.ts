import { Controller, Get, Parameter, Post } from "@antelopejs/interface-api";
import type {
  BannerAction,
  BannerContent,
} from "@antelopejs/interface-dms/base";
import type { StatGroupItem } from "@antelopejs/interface-dms/base/stat-group";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";
import { notFound, serviceUnavailable } from "./demo-errors";

const DEMO_LATENCY_MS = 900;
const MINUTE_MS = 60 * 1000;

interface BumpFactsResponse {
  ok: boolean;
}

/** Published on each bump of the live facts, which the KeyValueList follows. */
export const FACTS_DEMO_TOPIC = "blocks:facts-demo";
/** Published when the mail provider goes down or comes back. */
export const PROVIDER_STATUS_TOPIC = "blocks:provider-status";
const FACTS_DEMO_EVENT_TYPE = "facts.update";
const PROVIDER_STATUS_EVENT_TYPE = "provider.status";
const OUTSTANDING_STEP = 125;
const BACKGROUND_JOB_DELAY_MS = 2_000;
let factsRevision = 1;
let outstanding = 4890;

/**
 * Runs `job` a moment later, as a background job would: the header button's
 * own page refresh has come and gone, so only the realtime event shows it.
 */
function inBackground(job: () => Promise<void>): void {
  setTimeout(() => {
    job().catch((error: unknown) => {
      console.warn("[playground] background demo job failed", error);
    });
  }, BACKGROUND_JOB_DELAY_MS);
}

async function bumpFactsAndPublish(): Promise<void> {
  factsRevision += 1;
  outstanding += OUTSTANDING_STEP;
  await PublishMessage(FACTS_DEMO_TOPIC, FACTS_DEMO_EVENT_TYPE);
}

const DEFAULT_PERIOD = "this-month";
// oxlint-disable-next-line anti-slop/no-known-value-widening -- Arbitrary period query strings require an indexed lookup with the existing fallback.
const PERIOD_SCALES: Record<string, number> = {
  "last-7-days": 0.25,
  "last-30-days": 1,
  "this-month": 1,
  "last-month": 1.1,
  "last-90-days": 3,
  "this-quarter": 3,
};
// oxlint-disable-next-line anti-slop/no-known-value-widening -- Arbitrary period query strings require an indexed lookup with the existing fallback.
const PERIOD_LABELS: Record<string, string> = {
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  "last-90-days": "Last 90 days",
  "this-quarter": "This quarter",
};
const MRR_CENTS = 92200;
const MRR_RENEWAL = "2026-10-31T09:00:00Z";
const CONVERSION_RATIO = 0.253;
const CONVERSION_SESSIONS = 18420;
const QUEUED_EMAILS = 1284;
const OUTAGE_STARTED_MINUTES_AGO = 42;

const PROVIDER_STATUS_URL = "/api/blocks/provider-status";

let isProviderDown = false;
let outageStartedAt = Date.now();

async function setProviderDown(isDown: boolean): Promise<void> {
  isProviderDown = isDown;
  outageStartedAt = Date.now() - OUTAGE_STARTED_MINUTES_AGO * MINUTE_MS;
  await PublishMessage(PROVIDER_STATUS_TOPIC, PROVIDER_STATUS_EVENT_TYPE);
}

const PROVIDER_OUTAGE_ACTIONS: BannerAction[] = [
  { label: "Status page", to: "https://status.brevo.com" },
  {
    label: "Replay the queue",
    icon: "i-ph-arrow-clockwise",
    target: {
      type: "api",
      method: "POST",
      url: `${PROVIDER_STATUS_URL}/replay`,
      successMessage: "1,284 emails replayed",
    },
    confirm: {
      title: "Replay 1,284 queued emails?",
      description: "They are sent again through Brevo, oldest first.",
      confirmLabel: "Replay",
    },
  },
];

function providerOutage(): BannerContent {
  return {
    tone: "error",
    title: {
      key: "demo.blocks.banner.outage",
      params: {
        since: {
          type: "relative",
          value: new Date(outageStartedAt).toISOString(),
        },
      },
    },
    description: {
      key: "demo.blocks.banner.queued",
      plural: "queued",
      params: {
        queued: { type: "count", value: QUEUED_EMAILS },
        provider: {
          key: "demo.blocks.banner.provider",
          params: { name: "Brevo" },
        },
      },
    },
    actions: PROVIDER_OUTAGE_ACTIONS,
  };
}

function later<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS),
  );
}

function mrrStat(): StatGroupItem {
  return {
    icon: "i-ph-currency-eur",
    tone: "primary",
    eyebrow: "$demo.blocks.stats.mrr_label",
    value: {
      key: "demo.blocks.stats.mrr",
      params: {
        amount: { type: "money", value: MRR_CENTS, currency: "EUR" },
      },
    },
    detail: {
      key: "demo.blocks.stats.renews",
      params: {
        at: { type: "datetime", value: MRR_RENEWAL, format: "long" },
      },
    },
  };
}

function invoiceStats(scale: number, period: string): StatGroupItem[] {
  const scaled = (value: number) => Math.round(value * scale);
  return [
    {
      icon: "i-ph-receipt",
      eyebrow: "Invoices sent",
      value: scaled(1284),
      detail: period,
    },
    {
      icon: "i-ph-hourglass-medium",
      tone: "warning",
      eyebrow: "Awaiting payment",
      value: scaled(37),
      detail: `€${scaled(48210).toLocaleString("en-US")} outstanding`,
      detailTone: "warning",
    },
    {
      icon: "i-ph-warning-octagon",
      tone: "error",
      eyebrow: "Overdue",
      value: scaled(6),
      detail: "Oldest 41 days",
      detailTone: "error",
    },
    {
      icon: "i-ph-check-circle",
      tone: "success",
      eyebrow: "Paid",
      value: scaled(1241),
      detail: "96.6% on time",
    },
  ];
}

export class BlocksDemoApiController extends Controller("/api/blocks") {
  @Get("stats")
  getStats(@Parameter("preset", "query") preset?: string) {
    const scale = PERIOD_SCALES[preset ?? DEFAULT_PERIOD] ?? 1;
    const period = PERIOD_LABELS[preset ?? DEFAULT_PERIOD] ?? "Selected period";
    return later({ items: [mrrStat(), ...invoiceStats(scale, period)] });
  }

  @Get("facts")
  getFacts() {
    return later({
      items: [
        { label: "Customer", value: "Acme Logistics SA" },
        {
          label: "VAT number",
          value: "BE0478.123.456",
          type: "mono",
          copy: true,
        },
        { label: "Status", value: "Past due", type: "status", tone: "error" },
        { label: "Outstanding", value: outstanding, type: "money" },
        { label: "Last payment", value: "2026-08-14", type: "date" },
        {
          label: "$demo.blocks.facts.conversion",
          value: {
            key: "demo.blocks.facts.ratio",
            params: {
              ratio: {
                type: "number",
                value: CONVERSION_RATIO,
                format: "percent",
              },
              sessions: {
                type: "number",
                value: CONVERSION_SESSIONS,
                format: "compact",
              },
            },
          },
        },
        { label: "Revision", value: factsRevision, type: "mono" },
      ],
    });
  }

  @Get("period-facts")
  getPeriodFacts(@Parameter("preset", "query") preset?: string) {
    const scale = PERIOD_SCALES[preset ?? DEFAULT_PERIOD] ?? 1;
    const period = PERIOD_LABELS[preset ?? DEFAULT_PERIOD] ?? "Selected period";
    return later({
      items: [
        { label: "Period", value: period },
        { label: "Orders", value: Math.round(1284 * scale), type: "mono" },
        { label: "Revenue", value: Math.round(238052 * scale), type: "money" },
        { label: "Refunds", value: Math.round(1890 * scale), type: "money" },
      ],
    });
  }

  @Post("facts/bump")
  bumpFacts(): BumpFactsResponse {
    inBackground(bumpFactsAndPublish);
    return { ok: true };
  }

  @Get("shortcuts")
  getShortcuts() {
    return later({
      items: [
        {
          id: "members",
          icon: "i-ph-users",
          title: "Members",
          description:
            "People with access to this workspace and pending invitations.",
          to: "/settings/workspace/members",
          state: {
            key: "demo.blocks.nav.seats_used",
            params: { used: 8, total: 10 },
          },
        },
        {
          id: "billing",
          icon: "i-ph-credit-card",
          title: "$demo.blocks.nav.billing",
          description: "Payment method, plan and the last 24 invoices.",
          to: "#billing",
          state: {
            key: "demo.blocks.nav.payment_failed",
            params: {
              date: { type: "date", value: "2026-09-28", format: "day" },
            },
          },
          stateTone: "error",
          tag: "SaaS",
        },
        {
          id: "integrations",
          icon: "i-ph-plugs-connected",
          title: "Integrations",
          description: "Stripe, Shopify and outgoing webhooks.",
          to: "#integrations",
          state: {
            key: "demo.blocks.nav.connectors_degraded",
            params: { count: { type: "count", value: 1 } },
          },
          stateTone: "warning",
        },
        {
          id: "facts",
          icon: "i-ph-broadcast",
          title: "Live facts",
          description: "Re-read when the header button bumps the facts.",
          to: "/blocks/blocks-key-value",
          state: `Revision ${factsRevision}`,
          stateTone: "info",
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
    throw notFound("This report was archived on Sep 30.", {
      title: "Report archived",
      icon: "i-ph-archive",
      actions: [{ label: "Open the archive", to: "#archive" }],
    });
  }

  @Get("code")
  getCode() {
    const preset = {
      id: "thumbnail",
      format: "webp",
      quality: 82,
      resize: { width: 480, height: 480, fit: "cover" },
      generatedAt: new Date().toISOString(),
    };
    return later({ code: JSON.stringify(preset, null, 2), language: "json" });
  }

  @Get("provider-status")
  getProviderStatus() {
    return later(isProviderDown ? providerOutage() : null);
  }

  @Post("provider-status/outage")
  simulateOutage() {
    inBackground(() => setProviderDown(true));
    return { ok: true };
  }

  @Post("provider-status/replay")
  async replayQueue() {
    await setProviderDown(false);
    return { isProviderDown };
  }
}
