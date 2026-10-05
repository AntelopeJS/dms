import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner, EmptyState } from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { blocksCategory } from "./category";

@RegisterPage()
export class PageBlocksFeedback extends PageController("blocks-feedback", {
  displayName: "Banner & empty state",
  icon: "i-ph-megaphone",
  category: blocksCategory,
  order: 30,
  description:
    "Banner block (tones, compact size, link actions, remembered dismiss) and EmptyState block (variants, sizes, actions)",
}) {
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

  static failure = Banner({
    tone: "error",
    title: "Sync failed",
    description:
      "Pennylane rejected the API key on Sep 30 at 10:05. Invoices since then are not exported.",
    actions: [
      { label: "View log", to: "#log" },
      {
        label: "Update the key",
        to: "/settings/user/profile",
        icon: "i-ph-key",
      },
    ],
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
              { label: "Learn more", to: "https://antelopejs.com/docs" },
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
          }),
        ),
    );

  static empties = Grid({ gap: "1rem", minColumnWidth: "280px" }).child(
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
