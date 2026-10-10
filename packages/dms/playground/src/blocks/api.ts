import { Controller, Get } from "@antelopejs/interface-api";

// Live payloads for the display-block demos. Each answers `{ items }` in the
// block's own item shape after a short delay, so the loading state shows.
const DEMO_LATENCY_MS = 900;

function later<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS),
  );
}

export class BlocksDemoApiController extends Controller("/api/blocks") {
  @Get("stats")
  getStats() {
    return later({
      items: [
        {
          icon: "i-ph-receipt",
          eyebrow: "Invoices sent",
          value: 1284,
          detail: "This month",
        },
        {
          icon: "i-ph-hourglass-medium",
          tone: "warning",
          eyebrow: "Awaiting payment",
          value: 37,
          detail: "€48,210 outstanding",
          detailTone: "warning",
        },
        {
          icon: "i-ph-warning-octagon",
          tone: "error",
          eyebrow: "Overdue",
          value: 6,
          detail: "Oldest 41 days",
          detailTone: "error",
        },
        {
          icon: "i-ph-check-circle",
          tone: "success",
          eyebrow: "Paid",
          value: 1241,
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
        {
          label: "VAT number",
          value: "BE0478.123.456",
          type: "mono",
          copy: true,
        },
        { label: "Status", value: "Past due", type: "status", tone: "error" },
        { label: "Outstanding", value: 4890, type: "money" },
        { label: "Last payment", value: "2026-08-14", type: "date" },
      ],
    });
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
          state: {
            key: "demo.blocks.nav.seats_used",
            params: { used: 8, total: 10 },
          },
        },
        {
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
      ],
    });
  }

  @Get("empty")
  getEmpty() {
    return later({ items: [] });
  }

  // The CodeBlock demo reads one snippet, `{ code, language? }`, not `{ items }`.
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
}
