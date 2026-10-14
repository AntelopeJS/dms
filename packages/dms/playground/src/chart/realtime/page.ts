import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { ChartArea, LiveToggle } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Color, HttpMethod } from "@antelopejs/interface-dms/base/types";
import { PLAYGROUND_LIVE_KEY } from "../../blocks/live";
import { REALTIME_DEMO_TOPIC } from "../api/realtime";
import { pageCategory } from "../category";

@RegisterPage()
export class PageChartRealtime extends PageController(
  "chart-realtime",
  {
    displayName: "Realtime Updates",
    icon: "i-ph-broadcast",
    category: pageCategory,
    order: 30,
    description:
      'Press "Append a point": the chart refetches over SSE, at most every 2 s, and not at all while the page is paused. Its Live / Pause choice is shared with Blocks > Live mode (same rememberKey).',
    live: { maxRate: 2, rememberKey: PLAYGROUND_LIVE_KEY },
  },
  DefaultLayout({
    headerActions: [
      {
        id: "bump",
        label: "Append a point",
        icon: "i-ph-plus",
        target: {
          type: "api",
          method: "POST",
          url: "/api/dashboard/realtime/bump",
          successMessage: "Point appended; the chart should refresh.",
        },
      },
    ],
  }),
) {
  static liveToggle = LiveToggle();

  static live = ChartArea({
    title: "Live counter",
    description:
      "Each point appended publishes a stats.update event on the chart's realtimeTopic.",
    fetchUrl: "/api/dashboard/realtime/data",
    fetchUrlMethod: HttpMethod.get,
    realtimeTopic: REALTIME_DEMO_TOPIC,
    color: Color.primary,
    smooth: true,
    height: "320px",
  });
}
