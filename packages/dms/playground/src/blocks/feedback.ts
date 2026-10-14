import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner, Card, EmptyState } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { PROVIDER_STATUS_TOPIC } from "./api";
import { blocksCategory } from "./category";

@RegisterPage()
export class PageBlocksFeedback extends PageController(
  "blocks-feedback",
  {
    displayName: "Banner & empty state",
    icon: "i-ph-megaphone",
    category: blocksCategory,
    order: 30,
    description:
      'Banner block (tones, sizes, link actions and their variants, remembered dismiss, content fetched from a route) and EmptyState block (every variant, sizes, actions, inside a card). Press "Simulate an outage": the fetched banner appears 2 s later over realtime.',
  },
  DefaultLayout({
    headerActions: [
      {
        id: "outage",
        label: "Simulate an outage",
        icon: "i-ph-lightning",
        target: {
          type: "api",
          method: "POST",
          url: "/api/blocks/provider-status/outage",
          successMessage: "Brevo goes down in 2 s",
        },
      },
    ],
  }),
) {
  // Nothing until the route answers a banner. The outage lands after the
  // header's own refresh, so only the realtime event brings it in.
  static providerStatus = Banner({
    fetchUrl: "/api/blocks/provider-status",
    fetchUrlMethod: HttpMethod.get,
    realtimeTopic: PROVIDER_STATUS_TOPIC,
  });

  static beta = Banner({
    tone: "warning",
    title: "Sales analytics is in beta",
    description:
      "Numbers refresh every 15 minutes and may differ from your accounting exports.",
    actions: [
      { label: "Read the changelog", to: "https://antelopejs.com/docs" },
      {
        label: "Send feedback",
        to: "#feedback",
        icon: "i-ph-chat-circle-text",
      },
    ],
    dismissible: true,
    dismissKey: "playground-blocks-beta",
  });

  // Dismissible without a dismissKey: the block id is the remembered key.
  static failure = Banner({
    tone: "error",
    title: "Sync failed",
    description:
      "Pennylane rejected the API key on Sep 30 at 10:05. Invoices since then are not exported.",
    actions: [
      { label: "View log", to: "#log", variant: "link", color: "error" },
      {
        label: "Update the key",
        to: "/settings/user/profile",
        icon: "i-ph-key",
        variant: "solid",
        color: "error",
      },
    ],
    dismissible: true,
  });

  static compacts = Grid({ gap: "0.75rem", minColumnWidth: "320px" })
    .child(
      "row1",
      GridRow()
        .child(
          "info",
          Banner({
            tone: "info",
            size: "sm",
            icon: "i-ph-clock",
            title: "Read-only",
            description: "Maintenance until 02:30 UTC.",
          }),
        )
        .child(
          "success",
          Banner({
            tone: "success",
            size: "sm",
            title: "Synced",
            description: "1,284 charges imported from Stripe.",
            dismissible: true,
            dismissKey: "playground-blocks-synced",
          }),
        ),
    )
    .child(
      "row2",
      GridRow()
        .child(
          "primary",
          Banner({
            tone: "primary",
            size: "sm",
            title: "New",
            description: "Saved views are shared with your team.",
            actions: [
              {
                label: "Learn more",
                to: "https://antelopejs.com/docs",
                variant: "soft",
                color: "primary",
              },
            ],
          }),
        )
        .child(
          "warning",
          Banner({
            tone: "warning",
            size: "sm",
            title: "Beta",
            description: "Numbers refresh every 15 minutes.",
            actions: [{ label: "Details", to: "#beta", variant: "subtle" }],
          }),
        ),
    );

  static empties = Grid({ gap: "1rem", minColumnWidth: "280px" })
    .child(
      "row",
      GridRow()
        .child(
          "noData",
          EmptyState({
            title: "No invoices yet",
            description: "Invoices appear here once a customer is billed.",
            actions: [
              {
                label: "Create an invoice",
                to: "#new-invoice",
                icon: "i-ph-plus",
              },
              { label: "Import", to: "#import", icon: "i-ph-upload-simple" },
            ],
          }),
        )
        .child(
          "noResult",
          EmptyState({
            variant: "no-result",
            title: "No match for “acme”",
            description: "Try another spelling, or clear the filters.",
            hatched: true,
            actions: [
              {
                label: "Clear filters",
                to: "#clear",
                variant: "outline",
                color: "neutral",
              },
            ],
          }),
        )
        .child(
          "noAccess",
          EmptyState({
            variant: "no-access",
            size: "sm",
            title: "Billing is managed by the owner",
            description: "Ask Camille Laurent for access to invoices.",
          }),
        ),
    )
    .child(
      "row2",
      GridRow()
        .child(
          "error",
          EmptyState({
            variant: "error",
            title: "Could not load invoices",
            description: "The billing service did not answer in time.",
            actions: [
              {
                label: "Retry",
                to: "#retry",
                icon: "i-ph-arrow-clockwise",
                variant: "solid",
                color: "error",
              },
            ],
          }),
        )
        .child(
          "inCard",
          Card({ title: "Invoices", count: 0 }).child(
            "empty",
            EmptyState({
              card: false,
              size: "sm",
              title: "No invoice yet",
              description: "card: false lets the Card draw the frame.",
            }),
          ),
        )
        .child(
          "offline",
          EmptyState({
            icon: "i-ph-wifi-slash",
            tone: "warning",
            size: "sm",
            title: "You are offline",
            description: "icon and tone override the variant's own.",
          }),
        ),
    );

  static firstRun = EmptyState({
    size: "lg",
    icon: "i-ph-rocket-launch",
    tone: "primary",
    title: "Set up your first pipeline",
    description:
      "Connect a source, pick what to sync, and the first run starts within a minute.",
    actions: [
      {
        label: "Connect a source",
        to: "#connect",
        icon: "i-ph-plugs-connected",
      },
      { label: "Read the guide", to: "https://antelopejs.com/docs" },
    ],
  });
}
