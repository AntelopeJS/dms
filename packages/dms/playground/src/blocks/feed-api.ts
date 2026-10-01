import { Controller, Get, JSONBody, Put } from "@antelopejs/interface-api";

// Live payloads for the list / feed / settings block demos.
const DEMO_LATENCY_MS = 700;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function later<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), DEMO_LATENCY_MS),
  );
}

/** An ISO date `ago` milliseconds before now. */
function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

interface WorkspaceSettings {
  name: string;
  slug: string;
  language: string;
  description: string;
}

const WORKSPACE_KEYS = ["name", "slug", "language", "description"] as const;

// In memory: the demo form saves here and reads it back.
const workspace: WorkspaceSettings = {
  name: "Acme Logistics",
  slug: "acme",
  language: "en-GB",
  description: "Shipping, inventory and invoicing for the Benelux depots.",
};

export class BlocksFeedApiController extends Controller("/api/blocks-feed") {
  @Get("activity")
  getActivity() {
    return later({
      items: [
        {
          id: "a1",
          icon: "i-ph-sparkle",
          tone: "secondary",
          title: "Assistant added Top customers to Sales overview",
          meta: ["1 file changed", "safe mode", "requested by Camille"],
          date: ago(12 * MINUTE_MS),
          unread: true,
          to: "/chart/chart-dashboard",
        },
        {
          id: "a2",
          icon: "i-ph-check-circle",
          tone: "success",
          title: "Order #10481 paid",
          meta: ["Globex Logistics", "€860.50", "Stripe"],
          date: ago(36 * MINUTE_MS),
          unread: true,
        },
        {
          id: "a3",
          icon: "i-ph-rocket-launch",
          tone: "accent",
          title: "Release v2.14 promoted",
          meta: ["staging → production", "42 s"],
          date: ago(2 * HOUR_MS),
        },
        {
          id: "a4",
          icon: "i-ph-translate",
          tone: "warning",
          title: "12 translation keys missing",
          meta: ["Français", "checkout"],
          date: ago(DAY_MS + 3 * HOUR_MS),
        },
        {
          id: "a5",
          icon: "i-ph-user-plus",
          title: "Hugo Martin joined as Editor",
          meta: ["Invited by Camille Laurent"],
          date: ago(DAY_MS + 7 * HOUR_MS),
        },
        {
          id: "a6",
          icon: "i-ph-x-circle",
          tone: "error",
          title: "Payment for #10478 failed",
          meta: ["Stark Industries", "card declined"],
          date: ago(3 * DAY_MS + 2 * HOUR_MS),
        },
        {
          id: "a7",
          icon: "i-ph-upload-simple",
          tone: "info",
          title: "Imported 1,204 customers",
          meta: ["customers-2026-09.csv", "3 skipped"],
          date: ago(3 * DAY_MS + 8 * HOUR_MS),
        },
        {
          id: "a8",
          icon: "i-ph-database",
          title: "Nightly backup completed",
          meta: ["1.9 GB", "eu-west-3"],
          date: ago(9 * DAY_MS),
        },
      ],
    });
  }

  @Get("seats")
  getSeats() {
    return later({
      max: 10,
      hint: "8 in use · 2 free",
      segments: [
        { value: 6, label: "6 members" },
        { value: 2, tone: "soft", label: "2 pending invites" },
      ],
    });
  }

  @Get("empty")
  getEmpty() {
    return later({ items: [] });
  }

  @Get("workspace")
  getWorkspace() {
    return { ...workspace };
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
