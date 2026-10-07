import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Card, KeyValueList, StatGroup } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { blocksCategory } from "./category";

@RegisterPage()
export class PageBlocksKeyValue extends PageController("blocks-key-value", {
  displayName: "Key / value & card",
  icon: "i-ph-list-dashes",
  category: blocksCategory,
  order: 10,
  description:
    "KeyValueList block (every value type, columns, dense, live data) and the Card container block",
}) {
  static summaries = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "account",
        KeyValueList({
          title: "Your account",
          items: [
            {
              label: "Two-factor",
              value: "On",
              type: "status",
              tone: "success",
              detail: "Authenticator app",
            },
            {
              label: "Backup codes",
              value: "Not downloaded",
              type: "status",
              tone: "warning",
            },
            { label: "Language", value: "English (UK)" },
          ],
        }),
      )
      .child(
        "subscription",
        KeyValueList({
          title: "Subscription",
          items: [
            { label: "Plan", value: "Business" },
            {
              label: "Next invoice",
              value: 588,
              type: "money",
              detail: "Oct 31",
            },
            {
              label: "Unpaid",
              value: "INV-2026-0942 · €490.00",
              type: "status",
              tone: "error",
              to: "#billing",
            },
            { label: "Customer ID", value: "cus_Q8f2LmXv01", type: "mono" },
          ],
        }),
      )
      .child(
        "live",
        KeyValueList({
          title: "Live facts",
          fetchUrl: "/api/blocks/facts",
          // The route answers 5 rows: the skeleton draws as many.
          skeletonCount: 5,
        }),
      ),
  );

  static columns = KeyValueList({
    title: "Record · two columns",
    columns: 2,
    items: [
      { label: "Created", value: "2026-03-12T09:24:00Z", type: "date" },
      { label: "Updated", value: "2026-09-30T16:02:00Z", type: "date" },
      {
        label: "Owner",
        value: "Camille Laurent",
        type: "link",
        to: "/settings/workspace/members",
      },
      { label: "Region", value: "eu-west-3", type: "mono" },
      { label: "Monthly cost", value: 1240.5, type: "money", currency: "USD" },
      {
        label: "Documentation",
        value: "antelopejs.com",
        type: "link",
        to: "https://antelopejs.com/docs",
      },
    ],
  });

  static card = Card({
    title: "Connectors",
    count: 4,
    description: "Synced every 15 minutes",
    actions: [{ label: "View all", to: "/modules", icon: "i-ph-arrow-right" }],
    footer: "Last sync 10:15 · next at 10:30",
  }).child(
    "list",
    KeyValueList({
      card: false,
      dense: true,
      items: [
        {
          label: "Shopify",
          value: "Degraded",
          type: "status",
          tone: "warning",
          detail: "rate limited",
        },
        {
          label: "Stripe",
          value: "Live",
          type: "status",
          tone: "success",
          detail: "142 ms",
        },
        {
          label: "Brevo",
          value: "Live",
          type: "status",
          tone: "success",
          detail: "96 ms",
        },
        {
          label: "Qonto",
          value: "Live",
          type: "status",
          tone: "success",
          detail: "210 ms",
        },
      ],
    }),
  );

  static cardWithBlocks = Card({
    title: "This month",
    actions: [{ label: "Open sales", to: "/modules", variant: "outline" }],
  })
    .child(
      "stats",
      StatGroup({
        layout: "joined",
        items: [
          { eyebrow: "Orders", value: 1284, detail: "+4% vs August" },
          {
            eyebrow: "Revenue",
            value: "€238,052",
            detail: "-6.4% vs August",
            detailTone: "warning",
          },
          { eyebrow: "Refunds", value: 12, detail: "0.9% of orders" },
        ],
      }),
    )
    .child(
      "facts",
      KeyValueList({
        card: false,
        items: [
          { label: "Best day", value: "2026-09-14", type: "date" },
          { label: "Average basket", value: 185.4, type: "money" },
        ],
      }),
    );
}
