import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** An ISO date `ago` milliseconds before now. */
export function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/** An entry of the workspace feed, dated `agoMs` before the request. */
interface DatedEntry extends Omit<ActivityFeedItem, "date"> {
  agoMs: number;
}

const WORKSPACE_ENTRIES: DatedEntry[] = [
  {
    id: "a1",
    icon: "i-ph-sparkle",
    tone: "secondary",
    title: "Assistant added Top customers to Sales overview",
    meta: [
      {
        key: "demo.blocks.activity.files_changed",
        params: { count: { type: "count", value: 1 } },
      },
      "safe mode",
      "requested by Camille",
    ],
    agoMs: 12 * MINUTE_MS,
    unread: true,
    to: "/charts/chart-dashboard",
  },
  {
    id: "a2",
    icon: "i-ph-check-circle",
    tone: "success",
    title: {
      key: "demo.blocks.activity.order_paid",
      params: { order: "#10481" },
    },
    meta: [
      "Globex Logistics",
      {
        key: "demo.blocks.activity.amount",
        params: {
          amount: { type: "money", value: 86050, currency: "EUR" },
        },
      },
      "Stripe",
    ],
    agoMs: 36 * MINUTE_MS,
    unread: true,
  },
  {
    id: "a3",
    icon: "i-ph-rocket-launch",
    tone: "primary",
    title: "Release v2.14 promoted",
    meta: ["staging → production", "42 s"],
    agoMs: 2 * HOUR_MS,
  },
  {
    id: "a4",
    icon: "i-ph-translate",
    tone: "warning",
    title: "$demo.blocks.activity.missing_keys",
    params: { count: { type: "count", value: 12 } },
    meta: ["Français", "checkout"],
    agoMs: DAY_MS + HOUR_MS,
  },
  {
    id: "a5",
    icon: "i-ph-user-plus",
    title: "Hugo Martin joined as Editor",
    meta: ["Invited by Camille Laurent"],
    agoMs: DAY_MS + 3 * HOUR_MS,
  },
  {
    id: "a6",
    icon: "i-ph-paper-plane-tilt",
    tone: "info",
    title: "Invoice INV-2026-0942 sent",
    meta: ["Stark Industries", "€490.00"],
    agoMs: DAY_MS + 5 * HOUR_MS,
  },
  {
    id: "a7",
    icon: "i-ph-x-circle",
    tone: "error",
    title: "Payment for #10478 failed",
    meta: ["Stark Industries", "card declined"],
    agoMs: 3 * DAY_MS + HOUR_MS,
  },
  {
    id: "a8",
    icon: "i-ph-upload-simple",
    tone: "info",
    title: "Imported 1,204 customers",
    meta: ["customers-2026-09.csv", "3 skipped"],
    agoMs: 3 * DAY_MS + 3 * HOUR_MS,
  },
  {
    id: "a9",
    icon: "i-ph-webhooks-logo",
    tone: "warning",
    title: "Webhook endpoint paused",
    meta: ["hooks.acme.io", "5 failures"],
    agoMs: 3 * DAY_MS + 5 * HOUR_MS,
  },
  {
    id: "a10",
    icon: "i-ph-database",
    title: "Nightly backup completed",
    meta: ["1.9 GB", "eu-west-3"],
    agoMs: 9 * DAY_MS + HOUR_MS,
  },
  {
    id: "a11",
    icon: "i-ph-key",
    title: "API key rotated",
    meta: ["Production", "by Camille Laurent"],
    agoMs: 9 * DAY_MS + 3 * HOUR_MS,
  },
];

export function workspaceActivity(): ActivityFeedItem[] {
  return WORKSPACE_ENTRIES.map(({ agoMs, ...entry }) => ({
    ...entry,
    date: ago(agoMs),
  }));
}

export function attentionEntries(): ActivityFeedItem[] {
  return [
    {
      icon: "i-ph-warning",
      tone: "error",
      title: "Checkout rejects empty carts",
      detail:
        'POST /api/v2/storefront/checkout/sessions → 400 "Cart is empty" × 16',
      date: ago(4 * MINUTE_MS),
      unread: true,
    },
    {
      icon: "i-ph-clock-countdown",
      tone: "warning",
      title: "Slow export",
      detail: "GET /api/v2/reports/exports/2026-09/invoices.csv → 200 in 8.4 s",
      date: ago(25 * MINUTE_MS),
    },
    {
      icon: "i-ph-lock",
      tone: "warning",
      title: "Token refused",
      detail: "GET /api/v2/customers?include=orders,invoices → 401 × 3",
      date: ago(HOUR_MS),
    },
    {
      icon: "i-ph-plugs",
      tone: "error",
      title: "Shopify webhook failing",
      detail: "POST https://hooks.acme.io/shopify/orders/create → 502 × 5",
      date: ago(3 * HOUR_MS),
    },
    {
      icon: "i-ph-hourglass",
      title: "Queue backlog",
      detail: "mail.send · 1,284 jobs waiting · oldest 42 min",
      date: ago(5 * HOUR_MS),
    },
  ];
}
