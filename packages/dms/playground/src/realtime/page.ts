import {
  GetPermissionId,
  PageController,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { ActivityFeed } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { RegisterPageTopic } from "@antelopejs/interface-dms/realtime";
import { systemSection } from "../sections";
import { PINGS_TOPIC, REALTIME_DEMO_API, RECEIVED_TOPIC } from "./api";

@RegisterPage()
export class RealtimePage extends PageController(
  "realtime",
  {
    displayName: "Realtime",
    icon: "i-ph-broadcast",
    category: systemSection,
    order: 20,
    description:
      "Demonstrates: PublishMessage (payload, actorId), RegisterPageTopic, SubscribeMessage and useRealtimeTopic. Press Ping: the browser and the backend subscriber both receive it.",
  },
  DefaultLayout({
    headerActions: [
      {
        id: "ping",
        label: "Ping",
        icon: "i-ph-broadcast",
        color: "primary",
        target: {
          type: "api",
          method: "POST",
          url: `${REALTIME_DEMO_API}/ping`,
          successMessage: "Published",
        },
      },
    ],
  }),
) {
  static browser = CustomComponent("RealtimePingFeed")
    .options({ topic: PINGS_TOPIC })
    .meta({ name: "Received by the browser", icon: "i-ph-browser" });

  static backend = ActivityFeed({
    title: "Received by SubscribeMessage on the backend",
    fetchUrl: `${REALTIME_DEMO_API}/received`,
    realtimeTopic: RECEIVED_TOPIC,
    empty: { title: "Press Ping in the header" },
  });
}

const realtimePageId = GetPermissionId(RealtimePage);
if (realtimePageId) RegisterPageTopic(realtimePageId, PINGS_TOPIC);
