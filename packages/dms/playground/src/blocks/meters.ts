import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Meter, PeriodSelector } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { blocksCategory } from "./category";
import { QUOTA_DEMO_TOPIC } from "./feed-api";

const QUOTA_SCOPE = "blocks-meters";
const QUOTA_MAX = 100_000;
const WARN_PERCENT = 75;
const ERROR_PERCENT = 95;

@RegisterPage()
export class PageBlocksMeters extends PageController(
  "blocks-meters",
  {
    displayName: "Meter",
    icon: "i-ph-gauge",
    category: blocksCategory,
    order: 50,
    description:
      'Meter block: stacked and toned segments with a legend, value formats, tones, warning and error thresholds, sizes, live figures. Press "Use 5,000 API calls" to watch the period-bound quota meter move over realtime and cross its thresholds.',
  },
  DefaultLayout({
    headerActions: [
      {
        id: "use-quota",
        label: "Use 5,000 API calls",
        icon: "i-ph-lightning",
        target: {
          type: "api",
          method: "POST",
          url: "/api/blocks-feed/quota/use",
          successMessage: "5,000 calls used",
        },
      },
      {
        id: "reset-quota",
        label: "Reset the quota",
        icon: "i-ph-arrow-counter-clockwise",
        target: {
          type: "api",
          method: "POST",
          url: "/api/blocks-feed/quota/reset",
          successMessage: "Quota reset",
        },
      },
    ],
  }),
) {
  static quotaPeriod = PeriodSelector({
    id: QUOTA_SCOPE,
    presets: ["this-month", "last-month"],
    comparisons: ["none"],
    defaultPreset: "this-month",
    align: "right",
  });

  static usage = Grid({ gap: "1rem", minColumnWidth: "300px" })
    .child(
      "row1",
      GridRow()
        .child(
          "seats",
          Meter({
            card: true,
            label: "Seats",
            hint: "8 in use · 2 free",
            max: 10,
            segments: [
              { value: 6, label: "6 members" },
              { value: 2, tone: "soft", label: "2 pending invites" },
            ],
            legend: true,
            actions: [
              { label: "Manage members", to: "/settings/workspace/members" },
            ],
          }),
        )
        .child(
          "live",
          Meter({
            card: true,
            label: "Seats (live)",
            fetchUrl: "/api/blocks-feed/seats",
            fetchUrlMethod: HttpMethod.get,
            legend: true,
          }),
        )
        .child(
          // Reads `{ value }` for the period of the selector above, again on
          // each event of the quota topic.
          "periodQuota",
          Meter({
            card: true,
            label: "API calls (selected period)",
            fetchUrl: "/api/blocks-feed/quota",
            periodScope: QUOTA_SCOPE,
            realtimeTopic: QUOTA_DEMO_TOPIC,
            max: QUOTA_MAX,
            warnAt: WARN_PERCENT,
            errorAt: ERROR_PERCENT,
            format: "percent",
          }),
        ),
    )
    .child(
      "row2",
      GridRow()
        .child(
          "storage",
          Meter({
            card: true,
            label: "Storage",
            hint: {
              key: "demo.blocks.meter.storage_hint",
              params: {
                used: { type: "number", value: 38.2 },
                total: { type: "number", value: 50 },
              },
            },
            value: 76.4,
            max: 100,
            format: "percent",
            warnAt: WARN_PERCENT,
            errorAt: ERROR_PERCENT,
          }),
        )
        .child(
          "quota",
          Meter({
            card: true,
            label: "API calls this month",
            value: 98200,
            max: QUOTA_MAX,
            warnAt: WARN_PERCENT,
            errorAt: ERROR_PERCENT,
            size: "md",
          }),
        )
        .child(
          "coverage",
          Meter({
            card: true,
            label: "Permission coverage",
            hint: "of 669 permissions",
            value: 42,
            max: 669,
            format: "value",
            size: "xs",
          }),
        ),
    )
    .child(
      "row3",
      GridRow()
        .child(
          "uptime",
          Meter({
            card: true,
            label: "Uptime (format none)",
            hint: "99.2% · 30 days",
            value: 99.2,
            max: 100,
            tone: "success",
            format: "none",
          }),
        )
        .child(
          "checks",
          Meter({
            card: true,
            label: "Health checks · toned segments",
            max: 40,
            segments: [
              { value: 31, tone: "success", label: "31 passing" },
              { value: 6, tone: "warning", label: "6 degraded" },
              { value: 3, tone: "error", label: "3 failing" },
            ],
            legend: true,
          }),
        ),
    );
}
