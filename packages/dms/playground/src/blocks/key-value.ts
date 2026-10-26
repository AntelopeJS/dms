import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  CARD_ACTIONS_SLOT,
  CARD_FOOTER_SLOT,
  Card,
  KeyValueList,
  PeriodSelector,
  StatGroup,
} from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { FACTS_DEMO_TOPIC } from "./api";
import { blocksCategory } from "./category";

const CARD_PERIOD_SCOPE = "blocks-key-value-card";
const FOOTER_COLUMNS = 2;

@RegisterPage()
export class PageBlocksKeyValue extends PageController(
  "blocks-key-value",
  {
    displayName: "Key / value & card",
    icon: "i-ph-list-dashes",
    category: blocksCategory,
    order: 10,
    description:
      'KeyValueList block (every value type, copy buttons, 2 and 3 columns, a list currency, dense, composed texts, data read from a route) and the Card container (count, actions, footer, elevated variant, actions and footer slots). Press "Update the live facts": Live facts refreshes 2 s later over realtime.',
  },
  DefaultLayout({
    headerActions: [
      {
        label: "Update the live facts",
        icon: "i-ph-broadcast",
        target: {
          type: "api",
          url: "/api/blocks/facts/bump",
          method: "POST",
          successMessage: "Update started; Live facts refreshes when it lands",
        },
      },
    ],
  }),
) {
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
            {
              label: "Password",
              value: "Expires in 3 days",
              tone: "warning",
            },
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
            {
              label: "Customer ID",
              value: "cus_Q8f2LmXv01",
              type: "mono",
              copy: true,
            },
          ],
        }),
      )
      .child(
        "live",
        KeyValueList({
          title: "Live facts",
          fetchUrl: "/api/blocks/facts",
          fetchUrlMethod: HttpMethod.get,
          realtimeTopic: FACTS_DEMO_TOPIC,
          skeletonCount: 7,
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
      {
        label: "Public endpoint",
        value: "api.example.com/v1",
        type: "mono",
        copyValue: "https://api.example.com/v1",
      },
      { label: "Monthly cost", value: 1240.5, type: "money", currency: "USD" },
      {
        label: "Documentation",
        value: "antelopejs.com",
        type: "link",
        to: "https://antelopejs.com/docs",
      },
    ],
  });

  static threeColumns = KeyValueList({
    title: "Invoice · three columns, list currency EUR",
    columns: 3,
    currency: "EUR",
    items: [
      { label: "Subtotal", value: 490, type: "money" },
      { label: "VAT 21%", value: 102.9, type: "money" },
      { label: "Total", value: 592.9, type: "money" },
      { label: "Paid", value: 0, type: "money" },
      { label: "Converted", value: 641.2, type: "money", currency: "USD" },
      { label: "Due", value: "2026-10-31", type: "date" },
    ],
  });

  static emptyFacts = KeyValueList({
    title: "Facts · empty",
    fetchUrl: "/api/blocks/empty",
    empty: {
      title: "No facts",
      description: "The route answered no item.",
    },
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

  static elevated = Card({
    title: "Sales",
    count: "this workspace",
    description: "variant elevated, a selector in the actions slot",
    variant: "elevated",
  })
    .child(
      "period",
      PeriodSelector({
        id: CARD_PERIOD_SCOPE,
        size: "xs",
        variant: "segmented",
        presets: ["last-7-days", "this-month", "this-quarter"],
        comparisons: ["none"],
        defaultPreset: "this-month",
      }),
      { slot: CARD_ACTIONS_SLOT },
    )
    .child(
      "facts",
      KeyValueList({
        card: false,
        fetchUrl: "/api/blocks/period-facts",
        periodScope: CARD_PERIOD_SCOPE,
        skeletonCount: 4,
      }),
    )
    .child(
      "foot",
      KeyValueList({
        card: false,
        dense: true,
        columns: FOOTER_COLUMNS,
        items: [
          { label: "Last sync", value: "10:15" },
          { label: "Next sync", value: "10:30" },
        ],
      }),
      { slot: CARD_FOOTER_SLOT },
    );

  static cardWithBlocks = Card({
    title: "September 2026",
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
