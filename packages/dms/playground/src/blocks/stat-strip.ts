import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { StatStrip } from "@antelopejs/interface-dms/base";
import { blocksCategory } from "./category";

@RegisterPage()
export class PageBlocksStatStrip extends PageController("blocks-stat-strip", {
  displayName: "Stat strip",
  icon: "i-ph-squares-four",
  category: blocksCategory,
  order: 0,
  description:
    "StatStrip block: joined status strip, summary cards, live data, loading, error and empty states",
}) {
  static joined = StatStrip({
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

  static cards = StatStrip({
    layout: "cards",
    items: [
      { icon: "i-ph-squares-four", eyebrow: "Installed", value: 11 },
      {
        icon: "i-ph-arrow-circle-up",
        tone: "warning",
        eyebrow: "Updates available",
        value: 2,
      },
      {
        icon: "i-ph-warning-circle",
        tone: "error",
        eyebrow: "Need attention",
        value: 2,
      },
      {
        icon: "i-ph-package",
        tone: "neutral",
        eyebrow: "Available",
        value: 4,
      },
    ],
  });

  static workspace = StatStrip({
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

  static live = StatStrip({
    layout: "cards",
    fetchUrl: "/api/blocks/stats",
    // The route answers 4 figures: the skeleton draws as many cells.
    skeletonCount: 4,
  });

  static failing = StatStrip({
    layout: "joined",
    columns: 2,
    fetchUrl: "/api/blocks/missing",
  });

  static empty = StatStrip({
    layout: "cards",
    fetchUrl: "/api/blocks/empty",
    empty: { title: "No invoices this month" },
  });
}
