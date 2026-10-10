import { Controller, Get, Parameter, Post } from "@antelopejs/interface-api";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";

// Live payloads for the display-block demos. Each answers `{ items }` in the
// block's own item shape after a short delay, so the loading state shows.
const DEMO_LATENCY_MS = 900;

/** Published on each bump of the live facts, which the KeyValueList follows. */
export const FACTS_DEMO_TOPIC = "blocks:facts-demo";
const FACTS_DEMO_EVENT_TYPE = "facts.update";
const OUTSTANDING_STEP = 125;
let factsRevision = 1;
let outstanding = 4890;

// The live StatGroup follows a PeriodSelector: its figures scale with the
// length of the selected period, so a change of preset shows in the numbers.
const DEFAULT_PERIOD = "this-month";
const PERIOD_SCALES: Record<string, number> = {
  "last-7-days": 0.25,
  "last-30-days": 1,
  "this-month": 1,
  "last-month": 1.1,
  "last-90-days": 3,
  "this-quarter": 3,
};
const PERIOD_LABELS: Record<string, string> = {
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  "last-90-days": "Last 90 days",
  "this-quarter": "This quarter",
};

function later<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS),
  );
}

export class BlocksDemoApiController extends Controller("/api/blocks") {
  @Get("stats")
  getStats(@Parameter("preset", "query") preset?: string) {
    const scale = PERIOD_SCALES[preset ?? DEFAULT_PERIOD] ?? 1;
    const period = PERIOD_LABELS[preset ?? DEFAULT_PERIOD] ?? "Selected period";
    const scaled = (value: number) => Math.round(value * scale);
    return later({
      items: [
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
      ],
    });
  }

  @Get("facts")
  getFacts() {
    return later({
      items: [
        { label: "Customer", value: "Acme Logistics SA" },
        { label: "VAT number", value: "BE0478.123.456", type: "mono" },
        { label: "Status", value: "Past due", type: "status", tone: "error" },
        { label: "Outstanding", value: outstanding, type: "money" },
        { label: "Last payment", value: "2026-08-14", type: "date" },
        { label: "Revision", value: factsRevision, type: "mono" },
      ],
    });
  }

  @Post("facts/bump")
  async bumpFacts(): Promise<{ ok: boolean }> {
    factsRevision += 1;
    outstanding += OUTSTANDING_STEP;
    await PublishMessage(FACTS_DEMO_TOPIC, FACTS_DEMO_EVENT_TYPE);
    return { ok: true };
  }

  @Get("shortcuts")
  getShortcuts() {
    return later({
      items: [
        {
          icon: "i-ph-users",
          title: "Members",
          description:
            "People with access to this workspace and pending invitations.",
          to: "/settings/workspace/members",
          state: "8 of 10 seats used",
        },
        {
          icon: "i-ph-credit-card",
          title: "Billing",
          description: "Payment method, plan and the last 24 invoices.",
          to: "#billing",
          state: "Payment failed on Sep 28",
          stateTone: "error",
          tag: "SaaS",
        },
        {
          icon: "i-ph-plugs-connected",
          title: "Integrations",
          description: "Stripe, Shopify and outgoing webhooks.",
          to: "#integrations",
          state: "1 connector degraded",
          stateTone: "warning",
        },
      ],
    });
  }

  @Get("empty")
  getEmpty() {
    return later({ items: [] });
  }
}
