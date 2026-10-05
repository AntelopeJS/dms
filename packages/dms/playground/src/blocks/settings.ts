import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ActivityFeed,
  Banner,
  FieldRow,
  Meter,
  Section,
} from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
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
      "A settings-like page composed from the backend: header actions, Section, FieldRow, a Form with the sticky save bar, a danger zone",
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
        target: { type: "page", url: "/settings/user/roles" },
        permission: "playground.never-granted",
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
          actions: [{ label: "Manage members", to: "/settings/user/members" }],
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

  static profile = Section({
    title: "Workspace profile",
    description:
      "Edit a field: the save bar sticks to the bottom until you save or discard.",
  }).child(
    "form",
    Form({
      fetchUrl: "/api/blocks-feed/workspace",
      submitUrl: "/api/blocks-feed/workspace",
      saveBar: true,
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
    }),
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
