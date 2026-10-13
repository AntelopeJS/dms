import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ActivityFeed,
  HStack,
  KeyValueList,
  LiveToggle,
  PeriodSelector,
  StatGroup,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { blocksCategory } from "./category";
import { LIVE_DEMO_TOPIC } from "./live-api";

const LIVE_SCOPE = "blocks-live";
const LIVE_API = "/api/blocks/live";
/** Shared with the chart-realtime page: one remembered Live / Pause choice. */
export const PLAYGROUND_LIVE_KEY = "playground-live";
const MAX_RATE_SECONDS = 2;
const SLOW_RATE_SECONDS = 30;
const FEED_VISIBLE_ITEMS = 5;
const FEED_MAX_ITEMS = 20;
const IDLE_REFRESH_SECONDS = 30;

@RegisterPage()
export class PageBlocksLive extends PageController(
  "blocks-live",
  {
    displayName: "Live mode",
    icon: "i-ph-broadcast",
    category: blocksCategory,
    order: 80,
    description:
      'A page declared live: every block following a topic refetches at most every 2 s, or not at all while paused. Pause, then press "Send a burst" to see "120 new requests · 6 in 5xx", and resume to catch up.',
    live: {
      maxRate: MAX_RATE_SECONDS,
      slowRateAfter: { period: "7d", maxRate: SLOW_RATE_SECONDS },
      rememberKey: PLAYGROUND_LIVE_KEY,
    },
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
      {
        id: "rows",
        label: "Touch 3 rows",
        icon: "i-ph-rows",
        target: {
          type: "api",
          method: "POST",
          url: `${LIVE_API}/rows`,
          successMessage: "Published with payload.ids",
        },
      },
    ],
  }),
) {
  static toolbar = HStack({
    distribution: "space-between",
    alignment: "center",
    wrap: true,
  })
    .child(
      "period",
      PeriodSelector({
        id: LIVE_SCOPE,
        variant: "segmented",
        size: "xs",
        presets: ["last-hour", "last-24h", "last-7-days", "last-30-days"],
        comparisons: ["none"],
        defaultPreset: "last-hour",
      }),
    )
    .child(
      "live",
      LiveToggle({
        variant: "pill",
        align: "right",
        missedLabel: "$demo.blocks.live.new_requests",
      }),
    );

  static stats = StatGroup({
    layout: "cards",
    columns: 3,
    fetchUrl: `${LIVE_API}/stats`,
    periodScope: LIVE_SCOPE,
    realtimeTopic: LIVE_DEMO_TOPIC,
    skeletonCount: 3,
  });

  static panels = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "requests",
        ActivityFeed({
          title: "Requests",
          fetchUrl: `${LIVE_API}/requests`,
          realtimeTopic: LIVE_DEMO_TOPIC,
          groupByDay: false,
          mono: true,
          maxItems: FEED_MAX_ITEMS,
          visibleItems: FEED_VISIBLE_ITEMS,
          empty: { title: "No request yet", description: "Send a burst." },
        }),
      )
      .child(
        // A module's own component kept in step with the page through
        // usePageLiveRefresh and usePageLive.
        "health",
        CustomComponent("LiveHealthDemo").options({
          healthUrl: `${LIVE_API}/health`,
          realtimeTopic: LIVE_DEMO_TOPIC,
          idleRefresh: IDLE_REFRESH_SECONDS,
        }),
      ),
  );

  // The default segmented toggle, without the "updated N s ago" text.
  static plainToggle = LiveToggle({ align: "left", showUpdatedAt: false });

  static howItWorks = KeyValueList({
    title: "What to try",
    items: [
      {
        label: "Pause",
        value:
          "Press Pause or the L key: blocks stop reading, the toggle counts what they missed",
      },
      {
        label: "payload.count",
        value: "Each burst batch counts as 40 requests, not 1",
      },
      {
        label: "payload.ids",
        value: "Touch 3 rows twice while paused: each row counts once",
      },
      {
        label: "slowRateAfter",
        value: "Pick 7 days or more: the 2 s cadence becomes 30 s",
      },
      {
        label: "rememberKey",
        value:
          "Pause here, open Charts > Realtime Updates: it opens paused too",
        type: "link",
        to: "/charts/chart-realtime",
      },
      {
        label: "?live=0",
        value: "Opens the page paused",
        type: "link",
        to: "/blocks/blocks-live?live=0",
      },
      {
        label: "Hidden tab",
        value: "Switch browser tabs: the page pauses until you come back",
      },
      {
        label: "Hold",
        value:
          "Type in the note field of the health card: the page holds, paused, while it has the focus",
      },
    ],
  });
}
