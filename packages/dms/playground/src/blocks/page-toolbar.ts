import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { ActivityFeed, StatGroup } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageToolbar } from "@antelopejs/interface-dms/base/page-toolbar";
import { blocksCategory } from "./category";
import { PLAYGROUND_LIVE_KEY } from "./live";
import { LIVE_DEMO_TOPIC } from "./live-api";

const LIVE_API = "/api/blocks/live";
const TOOLBAR_SCOPE = "toolbar-live";
const REPORT_SCOPE = "toolbar-report";
const MAX_RATE_SECONDS = 2;
const FEED_VISIBLE_ITEMS = 5;

const scopeChip = (label: string) =>
  CustomComponent("ToolbarScopeChip").options({ label });

@RegisterPage()
export class PageToolbarLive extends PageController(
  "blocks-page-toolbar",
  {
    displayName: "Page toolbar",
    icon: "i-ph-sliders-horizontal",
    category: blocksCategory,
    order: 81,
    description:
      'The context bar of a live page, built by pageToolbar(): a scope chip on the left, then "Updated 2 s ago", Live / Pause, the period and its "vs …" comparison menu, on one line at 1440 px, in one order and at one size. Below it, the same toolbar with live data only, at size xs.',
    live: { maxRate: MAX_RATE_SECONDS, rememberKey: PLAYGROUND_LIVE_KEY },
  },
  DefaultLayout({
    headerActions: [
      {
        id: "burst",
        label: "Send a burst",
        icon: "i-ph-lightning",
        target: {
          type: "api",
          method: "POST",
          url: `${LIVE_API}/burst`,
          successMessage: "3 batches of 40 requests, 1.5 s apart",
        },
      },
    ],
  }),
) {
  static toolbar = pageToolbar({
    leading: { scope: scopeChip("All sites") },
    live: { missedLabel: "$demo.blocks.live.new_requests" },
    period: {
      id: TOOLBAR_SCOPE,
      presets: ["last-hour", "last-24h", "last-7-days", "last-30-days", "all"],
      comparisons: ["previous-period", "previous-year", "none"],
    },
  });

  static stats = StatGroup({
    layout: "cards",
    columns: 3,
    fetchUrl: `${LIVE_API}/stats`,
    periodScope: TOOLBAR_SCOPE,
    realtimeTopic: LIVE_DEMO_TOPIC,
    skeletonCount: 3,
  });

  static liveOnly = pageToolbar({
    size: "xs",
    leading: { queue: scopeChip("Request queue") },
    period: false,
  });

  static requests = ActivityFeed({
    title: "Requests",
    fetchUrl: `${LIVE_API}/requests`,
    realtimeTopic: LIVE_DEMO_TOPIC,
    groupByDay: false,
    mono: true,
    visibleItems: FEED_VISIBLE_ITEMS,
    empty: { title: "No request yet", description: "Send a burst." },
  });
}

@RegisterPage()
export class PageToolbarReport extends PageController(
  "blocks-page-toolbar-report",
  {
    displayName: "Page toolbar without live",
    icon: "i-ph-sliders-horizontal",
    category: blocksCategory,
    order: 82,
    description:
      'The same toolbar on a page declared without live: no Live / Pause, but "Updated 12 s ago" counted from the page\'s last read, and a refresh button reading every block again. Its period offers three comparisons, so a "vs …" menu, and a custom range behind the calendar icon.',
  },
  DefaultLayout(),
) {
  static toolbar = pageToolbar({
    live: false,
    period: {
      id: REPORT_SCOPE,
      presets: [
        "last-hour",
        "last-24h",
        "last-7-days",
        "last-30-days",
        "custom",
      ],
      comparisons: ["previous-period", "previous-year", "none"],
    },
  });

  static stats = StatGroup({
    layout: "cards",
    columns: 3,
    fetchUrl: `${LIVE_API}/stats`,
    periodScope: REPORT_SCOPE,
    skeletonCount: 3,
  });
}
