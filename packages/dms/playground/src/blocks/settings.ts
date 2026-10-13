import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ActivityFeed,
  Banner,
  BlockFunctions,
  FieldRow,
  KeyValueList,
  Meter,
  Section,
} from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form, FormEvents } from "@antelopejs/interface-dms/base/form";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { blocksCategory } from "./category";

@RegisterPage()
export class PageBlocksSettings extends PageController(
  "blocks-settings",
  {
    displayName: "Settings sections",
    icon: "i-ph-sliders-horizontal",
    category: blocksCategory,
    order: 60,
    description:
      "A settings-like page composed from the backend: Section, FieldRow (form, stack, required, disabled, no label), a Form with the sticky save bar, a danger zone. Save the workspace name: the summary above it reads it again through BlockFunctions.REFRESH_PAGE.",
  },
  DefaultLayout({
    fullWidth: false,
    headerActions: [
      {
        id: "docs",
        label: "Documentation",
        icon: "i-ph-book-open",
        target: {
          type: "external",
          url: "https://antelopejs.com/docs",
          newTab: true,
        },
      },
      // Lends its label and icon; hidden for users it is not served to.
      {
        id: "new-task",
        label: "",
        color: "primary",
        target: { type: "quickAction", id: "playground:new-task" },
      },
      // Nobody holds this permission: the button never reaches the client.
      {
        id: "audit",
        label: "Audit log",
        icon: "i-ph-scroll",
        target: { type: "page", url: "/settings/workspace/roles" },
        permissionId: "playground.never-granted",
      },
    ],
  }),
) {
  static plan = Section({
    title: "Plan & usage",
    description: "Seats, storage and API calls of the acme workspace.",
  })
    .child(
      "seats",
      FieldRow({
        label: "Seats",
        description: "Billed monthly, per active member.",
        layout: "form",
      }).child(
        "meter",
        Meter({
          max: 10,
          hint: "8 in use · 2 free",
          segments: [
            { value: 6, label: "6 members" },
            { value: 2, tone: "soft", label: "2 pending invites" },
          ],
          legend: true,
          actions: [
            { label: "Manage members", to: "/settings/workspace/members" },
          ],
        }),
      ),
    )
    .child(
      "storage",
      FieldRow({
        label: "Storage",
        description: "Files, images and exports.",
        layout: "form",
      }).child(
        "meter",
        Meter({
          value: 38.2,
          max: 50,
          valueLabel: "38.2 / 50 GB",
          warnAt: 75,
          errorAt: 95,
        }),
      ),
    );

  static rows = Section({
    title: "Field rows",
    description: "The states a FieldRow takes besides its layout.",
  })
    .child(
      "billingEmail",
      FieldRow({
        label: "Billing email",
        description: "required: true marks the label.",
        required: true,
        layout: "form",
      }).child(
        "value",
        KeyValueList({
          card: false,
          items: [{ label: "Current", value: "billing@acme.io", copy: true }],
        }),
      ),
    )
    .child(
      "sso",
      FieldRow({
        label: "Single sign-on",
        description: "disabled: true dims the row: Enterprise plan only.",
        disabled: true,
        layout: "form",
      }).child(
        "upgrade",
        Banner({
          size: "sm",
          tone: "primary",
          title: "Upgrade to Enterprise",
          actions: [{ label: "Compare plans", to: "#plans", variant: "link" }],
        }),
      ),
    )
    .child(
      "unlabelled",
      FieldRow({ layout: "form" }).child(
        "note",
        Banner({
          size: "sm",
          tone: "info",
          title: "A FieldRow without a label",
          description: "Its content spans both columns of the form layout.",
        }),
      ),
    );

  static profile = Section({
    title: "Workspace profile",
    description:
      "Edit a field: the save bar sticks to the bottom until you save or discard. The summary reads the saved values once the form succeeds.",
  })
    .child(
      "summary",
      KeyValueList({
        title: "Saved values",
        dense: true,
        fetchUrl: "/api/blocks-feed/workspace/summary",
        skeletonCount: 3,
      }),
    )
    .child(
      "form",
      Form({
        fetchUrl: "/api/blocks-feed/workspace",
        submitUrl: "/api/blocks-feed/workspace",
        fields: [
          {
            id: "name",
            label: "Name",
            description: "Shown in the sidebar and in emails.",
            type: new DefaultDataTypes.StringType({ maxLength: 60 }),
            required: true,
          },
          {
            id: "slug",
            label: "URL",
            description: "app.antelopejs.com/<slug>",
            type: new DefaultDataTypes.StringType({ maxLength: 32 }),
          },
          {
            id: "language",
            label: "Default language",
            type: new DefaultDataTypes.SelectType({
              items: [
                { label: "English (UK)", value: "en-GB" },
                { label: "Français", value: "fr-FR" },
                { label: "Nederlands", value: "nl-BE" },
              ],
            }),
          },
          {
            id: "description",
            label: "Description",
            type: new DefaultDataTypes.StringType({ textarea: true, rows: 3 }),
          },
        ],
      }).watch(FormEvents.SUBMIT_SUCCESS, BlockFunctions.REFRESH_PAGE),
    );

  static activity = Section({
    title: "Recent activity",
    card: false,
  }).child(
    "feed",
    ActivityFeed({
      title: "Workspace",
      fetchUrl: "/api/blocks-feed/activity",
      maxItems: 5,
    }),
  );

  static danger = Section({
    title: "Danger zone",
    description: "These actions cannot be undone.",
    danger: true,
  }).child(
    "delete",
    FieldRow({
      label: "Delete workspace",
      description: "Removes 42 tables, 1.9 GB of files and every member.",
      layout: "stack",
    }).child(
      "warning",
      Banner({
        tone: "error",
        size: "sm",
        title: "Owner only",
        description: "Transfer ownership first if you want to keep the data.",
        actions: [{ label: "Delete acme…", to: "#delete" }],
      }),
    ),
  );
}
