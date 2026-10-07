import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { ChartColumn, ChartLine } from "@antelopejs/interface-dms/base/chart";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import {
  KeyValueList,
  type KeyValueListItem,
} from "@antelopejs/interface-dms/base/key-value-list";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { multiComponentCategory } from "./category";

const PROJECT_FILE_ITEMS: KeyValueListItem[] = [
  { label: "src", value: "Folder", detail: "components, utils, index.ts" },
  { label: "docs", value: "Folder", detail: "guides, reference" },
  { label: "package.json", value: "JSON", type: "mono" },
  { label: "README.md", value: "Markdown", type: "mono" },
];

const DOCUMENTATION_ITEMS: KeyValueListItem[] = [
  {
    label: "Getting started",
    value: "guides/getting-started.md",
    type: "mono",
  },
  { label: "Configuration", value: "guides/configuration.md", type: "mono" },
  { label: "API reference", value: "reference/api.md", type: "mono" },
];

@RegisterPage()
export class PageMultiComponent extends PageController("multi-component", {
  displayName: "Multi Component Page",
  icon: "i-ph-layout",
  category: multiComponentCategory,
  order: 0,
  description:
    "Two key / value lists, two forms and two charts sharing one grid layout",
}) {
  static mainGrid = (() => {
    const fileList = KeyValueList({
      title: "File Explorer",
      items: PROJECT_FILE_ITEMS,
    });

    const profileForm = Form({
      title: "Profile Information",
      description: "Update your profile details",
      fields: [
        {
          id: "fullName",
          label: "Full Name",
          description: "Enter your full name",
          type: new DefaultDataTypes.StringType({
            placeholder: "John Doe",
          }),
        },
        {
          id: "email",
          label: "Email Address",
          description: "Your contact email",
          type: new DefaultDataTypes.EmailType({
            placeholder: "john.doe@example.com",
          }),
        },
        {
          id: "phone",
          label: "Phone Number",
          description: "Your contact number",
          type: new DefaultDataTypes.PhoneType({
            placeholder: "+1 234 567 8900",
          }),
        },
        {
          id: "bio",
          label: "Biography",
          description: "Tell us about yourself",
          type: new DefaultDataTypes.StringType({
            placeholder: "Write your bio here...",
            maxLength: 500,
          }),
        },
      ],
    });

    const settingsForm = Form({
      title: "Application Settings",
      description: "Configure your preferences",
      fields: [
        {
          id: "theme",
          label: "Theme",
          description: "Choose your preferred theme",
          type: new DefaultDataTypes.SelectType({
            items: [
              { label: "Light", value: "light" },
              { label: "Dark", value: "dark" },
              { label: "System", value: "system" },
            ],
            placeholder: "Select theme...",
          }),
        },
        {
          id: "notifications",
          label: "Enable Notifications",
          description: "Receive email notifications",
          type: new DefaultDataTypes.BooleanType(),
        },
        {
          id: "language",
          label: "Language",
          description: "Select your language",
          type: new DefaultDataTypes.SelectType({
            items: [
              { label: "English", value: "en" },
              { label: "French", value: "fr" },
              { label: "Spanish", value: "es" },
            ],
            placeholder: "Select language...",
          }),
        },
      ],
    });

    const chartsGrid = Grid({ gap: "1rem" }).child(
      "chartsRow",
      GridRow()
        .child(
          "lineChart",
          ChartLine({
            title: "Monthly Revenue",
            description: "Revenue trend over the past months",
            fetchUrl: "/api/dashboard/series?seed=30&size=12",
            color: Color.primary,
          }),
        )
        .child(
          "barChart",
          ChartColumn({
            title: "Category Performance",
            description: "Performance by category",
            fetchUrl: "/api/dashboard/series?seed=31&size=6",
            color: Color.success,
            roundedCorners: true,
          }),
        ),
    );

    const documentationList = KeyValueList({
      title: "Documentation",
      items: DOCUMENTATION_ITEMS,
    });

    const tabsComponent = Tab({
      items: [
        {
          label: "Profile",
          icon: "i-ph-user",
          slot: "profile",
        },
        {
          label: "Settings",
          icon: "i-ph-gear",
          slot: "settings",
        },
        {
          label: "Analytics",
          icon: "i-ph-chart-line",
          slot: "analytics",
        },
        {
          label: "Documentation",
          icon: "i-ph-file-text",
          slot: "documentation",
        },
      ],
      color: Color.primary,
      size: Size.medium,
    })
      .child("profileForm", profileForm, { slot: "profile" })
      .child("settingsForm", settingsForm, { slot: "settings" })
      .child("chartsGrid", chartsGrid, { slot: "analytics" })
      .child("documentationList", documentationList, {
        slot: "documentation",
      });

    return Grid({ gap: "1.5rem" }).child(
      "mainRow",
      GridRow().child("fileList", fileList).child("tabs", tabsComponent),
    );
  })();
}
