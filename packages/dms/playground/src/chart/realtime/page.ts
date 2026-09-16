import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { ChartArea } from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
import { Color, HttpMethod } from "@antelopejs/interface-dms/base/types";
import { REALTIME_DEMO_TOPIC } from "../api/realtime";
import { pageCategory } from "../category";

@RegisterPage()
export class PageChartRealtime extends PageController("chart-realtime", {
  displayName: "Realtime Updates",
  icon: "i-ph-broadcast",
  category: pageCategory,
  order: 30,
  description:
    "Submit the form (or POST /api/dashboard/realtime/bump) to mutate the series; the chart refetches automatically over SSE.",
}) {
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
