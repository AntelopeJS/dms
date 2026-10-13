import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { ChartArea, LiveToggle } from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { Color, HttpMethod } from "@antelopejs/interface-dms/base/types";
import { PLAYGROUND_LIVE_KEY } from "../../blocks/live";
import { REALTIME_DEMO_TOPIC } from "../api/realtime";
import { pageCategory } from "../category";

@RegisterPage()
export class PageChartRealtime extends PageController("chart-realtime", {
  displayName: "Realtime Updates",
  icon: "i-ph-broadcast",
  category: pageCategory,
  order: 30,
  description:
    "Submit the form to append a point: the chart refetches over SSE, at most every 2 s, and not at all while the page is paused. Its Live / Pause choice is shared with Blocks > Live mode (same rememberKey).",
  live: { maxRate: 2, rememberKey: PLAYGROUND_LIVE_KEY },
}) {
  static liveToggle = LiveToggle();

  static live = ChartArea({
    title: "Live counter",
    fetchUrl: "/api/dashboard/realtime/data",
    fetchUrlMethod: HttpMethod.get,
    realtimeTopic: REALTIME_DEMO_TOPIC,
    color: Color.primary,
    smooth: true,
    height: "320px",
  });

  static bumpForm = Form({
    title: "Trigger update",
    description:
      "Adds a new random point and publishes a stats.update event on the topic.",
    submitUrl: "/api/dashboard/realtime/bump",
    submitUrlMethod: HttpMethod.post,
    successMessage: "Point appended; the chart should refresh.",
    fields: [
      {
        id: "trigger",
        label: "Action",
        type: new DefaultDataTypes.StringType(),
        defaultValue: "Append point",
      },
    ],
  });
}
