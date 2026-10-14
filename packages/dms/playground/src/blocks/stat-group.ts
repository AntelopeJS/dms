import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { PeriodSelector, StatGroup } from "@antelopejs/interface-dms/base";
import { blocksCategory } from "./category";

const LIVE_PERIOD_SCOPE = "blocks-stat-group-period";

@RegisterPage()
export class PageBlocksStatGroup extends PageController("blocks-stat-group", {
  displayName: "Stat group",
  icon: "i-ph-squares-four",
  category: blocksCategory,
  order: 0,
  description:
    "StatGroup block: a joined strip, summary cards, every well tone, figures following a period selector, then the error (Retry), not-found and empty states. Change the period to see the cards reload.",
}) {
  static joined = StatGroup({
    layout: "joined",
    label: "Security status",
    items: [
      {
        icon: "i-ph-shield-check",
        tone: "success",
        eyebrow: "Two-factor",
        value: "On",
        detail: "Authenticator app",
        to: "#two-factor",
      },
      {
        icon: "i-ph-key",
        tone: "warning",
        eyebrow: "Backup codes",
        value: "3 of 10 left",
        detail: "Not downloaded yet",
        detailTone: "warning",
        to: "#backup-codes",
      },
      {
        icon: "i-ph-password",
        eyebrow: "Password",
        value: "Changed 12 days ago",
        detail: "Sep 19, 2026",
        to: "#password",
      },
      {
        icon: "i-ph-devices",
        eyebrow: "Sessions",
        value: "3 active",
        detail: "This device + 2 others",
        to: "#sessions",
      },
    ],
  });

  static cards = StatGroup({
    layout: "cards",
    items: [
      {
        id: "installed",
        icon: "i-ph-squares-four",
        eyebrow: "Installed",
        value: 11,
      },
      {
        id: "updates",
        icon: "i-ph-arrow-circle-up",
        tone: "warning",
        eyebrow: "Updates available",
        value: 2,
      },
      {
        id: "attention",
        icon: "i-ph-warning-circle",
        tone: "error",
        eyebrow: "Need attention",
        value: 2,
      },
      {
        id: "available",
        icon: "i-ph-package",
        tone: "neutral",
        eyebrow: "Available",
        value: 4,
      },
    ],
  });

  // The well tones the other groups leave out. A long detail wraps to a
  // second line rather than being cut.
  static tones = StatGroup({
    layout: "cards",
    label: "Well tones",
    items: [
      {
        icon: "i-ph-info",
        tone: "info",
        eyebrow: "Tone info",
        value: "Sync queued",
        detail:
          "The next run starts at 10:30 and imports every order placed since the last run",
        detailTone: "info",
      },
      {
        icon: "i-ph-sparkle",
        tone: "secondary",
        eyebrow: "Tone secondary",
        value: "3 suggestions",
        detail: "From the assistant",
      },
      {
        icon: "i-ph-star",
        tone: "primary",
        eyebrow: "Tone primary",
        value: "Business",
        detail: "Current plan",
        detailTone: "primary",
      },
      {
        icon: "i-ph-moon",
        tone: "muted",
        eyebrow: "Tone muted",
        value: "Archived",
        detail: "Read-only since Sep 1",
      },
    ],
  });

  static workspace = StatGroup({
    layout: "joined",
    columns: 3,
    items: [
      {
        eyebrow: "Members",
        value: "8 / 10 seats",
        detail: "6 members · 2 pending invites",
        to: "/settings/workspace/members",
      },
      {
        eyebrow: "Plan",
        value: "Business",
        detail: "€49 / seat / month · renews Oct 31",
      },
      {
        eyebrow: "Owner",
        value: "Camille Laurent",
        detail: "Created acme on Mar 12, 2025",
      },
    ],
  });

  static livePeriod = PeriodSelector({
    id: LIVE_PERIOD_SCOPE,
    align: "right",
    presets: ["last-7-days", "last-30-days", "this-month", "this-quarter"],
    comparisons: ["none"],
    defaultPreset: "this-month",
  });

  // Follows the selector above: the route scales its figures to the period.
  // Its first cell composes its eyebrow, value and detail in the reader's
  // language (a money amount, a long date).
  static live = StatGroup({
    layout: "cards",
    fetchUrl: "/api/blocks/stats",
    periodScope: LIVE_PERIOD_SCOPE,
    // The route answers 5 figures: the skeleton draws as many cells.
    skeletonCount: 5,
  });

  // The route answers 503: the block draws its load error with Retry.
  static failing = StatGroup({
    layout: "joined",
    columns: 2,
    fetchUrl: "/api/blocks/broken",
  });

  // The route answers 404 with `{ message, emptyState }`: "Not found", with
  // the route's title, icon and link laid over it.
  static notFound = StatGroup({
    layout: "joined",
    columns: 2,
    fetchUrl: "/api/blocks/gone",
  });

  static empty = StatGroup({
    layout: "cards",
    fetchUrl: "/api/blocks/empty",
    empty: { title: "No invoices this month" },
  });
}
