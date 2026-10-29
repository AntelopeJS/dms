import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Banner,
  ChartLine,
  Guard,
  KeyValueList,
  KpiCard,
  PeriodSelector,
  StatGroup,
} from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { blocksCategory } from "./category";
import { GUARD_DEMO_TOPIC } from "./guard-api";

const GUARD_SCOPE = "blocks-guard";
const GUARD_API = "/api/blocks/guard";

@RegisterPage()
export class PageBlocksGuard extends PageController(
  "blocks-guard",
  {
    displayName: "Guard",
    icon: "i-ph-shield-check",
    category: blocksCategory,
    order: 75,
    description:
      'Guard block: one empty state in place of its children when a route says there is nothing (an empty value, a 404). Press "Send a test call" on the last hour to bring the charts back over realtime; switch records with the banner links.',
  },
  DefaultLayout({
    headerActions: [
      {
        id: "send",
        label: "Send a test call",
        icon: "i-ph-paper-plane-tilt",
        target: {
          type: "api",
          method: "POST",
          url: `${GUARD_API}/calls/send`,
          successMessage: "Call sent",
        },
      },
      {
        id: "reset",
        label: "Reset the calls",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          method: "POST",
          url: `${GUARD_API}/calls/reset`,
          successMessage: "Calls reset",
        },
      },
    ],
  }),
) {
  static period = PeriodSelector({
    id: GUARD_SCOPE,
    variant: "segmented",
    size: "xs",
    presets: ["last-hour", "last-24h", "last-7-days"],
    comparisons: ["none"],
    defaultPreset: "last-hour",
  });

  static calls = Guard({
    fetchUrl: `${GUARD_API}/calls`,
    fetchUrlMethod: HttpMethod.get,
    periodScope: GUARD_SCOPE,
    realtimeTopic: GUARD_DEMO_TOPIC,
    when: "empty",
    field: "summary.calls",
    fallback: {
      title: "No calls yet",
      icon: "i-ph-moon-stars",
      actions: [
        {
          label: "Pick the last 24 hours",
          to: "/blocks/blocks-guard?blocks-guard.period=last-24h",
        },
      ],
    },
  })
    .child(
      "kpi",
      KpiCard({
        title: "Calls",
        icon: "i-ph-phone-call",
        fetchUrl: `${GUARD_API}/calls/kpi`,
        periodScope: GUARD_SCOPE,
        valueFormat: "number",
        showSparkline: true,
      }),
    )
    .child(
      "chart",
      ChartLine({
        title: "Calls over time",
        fetchUrl: `${GUARD_API}/calls/series`,
        periodScope: GUARD_SCOPE,
        realtimeTopic: GUARD_DEMO_TOPIC,
        height: "220px",
      }),
    );

  static recordSwitch = Banner({
    tone: "info",
    size: "sm",
    title: "when: notFound",
    description:
      "The guard below reads the record named by ?record= in the URL: r1 exists, gone answers 404. Without ?record= nothing is requested and the children show.",
    actions: [
      { label: "Existing record", to: "/blocks/blocks-guard?record=r1" },
      { label: "Deleted record", to: "/blocks/blocks-guard?record=gone" },
      { label: "No record", to: "/blocks/blocks-guard" },
    ],
  });

  static record = Guard({
    fetchUrl: `${GUARD_API}/records/{{query.record}}`,
    when: "notFound",
  }).child(
    "facts",
    KeyValueList({
      title: "Record",
      fetchUrl: `${GUARD_API}/records/{{query.record}}/facts`,
      empty: { title: "Pick a record with the links above" },
    }),
  );

  static alerts = Guard({ fetchUrl: `${GUARD_API}/alerts` }).child(
    "stats",
    StatGroup({
      items: [{ eyebrow: "Open alerts", value: 3, tone: "error" }],
    }),
  );
}
