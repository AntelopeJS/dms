import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { demoGuide } from "../guide";
import { cellAccountDataAPI } from "./data-api";

@RegisterPage()
export class PageTableViewCellDisplays extends PageController(
  "table-view-cell-displays",
  {
    displayName: "Cell displays",
    icon: "i-ph-text-columns",
    category: tableViewCategory,
    order: 35,
    description:
      "Every built-in cell display and its options, one column each, plus a module's own display (country flags). Scroll the grid sideways and read the guide for each column.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Account",
      text: 'IdentityDisplay: avatarField, a composed subtitleField, badges (Partner, Trial) and selfField / selfLabel: "Make it mine" from a row\'s menu tags it "You".',
    },
    {
      label: "Issued by, Kind",
      text: "IdentityDisplay emptyLabel / emptyIcon (an empty identity reads Automatic) and iconField (the tile icon follows the row's kind).",
    },
    {
      label: "Country",
      text: 'A module display: @RegisterDisplay("playground:flag") on the backend, registerDataType on the frontend (plugins/flag-display.ts). @Searchable("is"): search "FR".',
    },
    {
      label: "Plan, Renews",
      text: "TwoLineDisplay: a ComposedText sub-line (price per seat), a primaryField and a CellSubline whose tone the row picks (a suspended account in red).",
    },
    {
      label: "Invoice, SSO, Online",
      text: "StatusPillDisplay with subField / subTone, IndicatorDisplay, and a StatusType column.",
    },
    {
      label: "Last seen, Trial ends",
      text: 'RelativeDateDisplay: "Active now" window, "· by" author, empty label, soon and past tones, day style.',
    },
    {
      label: "p95, Uptime, Last error",
      text: 'DurationDisplay format "ms" with toneField, unit "s"; TextDisplay with toneField.',
    },
    {
      label: "Teams, Tags, Brand, Signups",
      text: "PillsDisplay labelKey / exclusive (the owner's crown) / emptyLabel, a TagsType and a ColorType column, a toned SparklineDisplay.",
    },
  ]);

  static accounts = TableView(cellAccountDataAPI, {
    caption: "Accounts",
    labelKey: "name",
    rowActions: {
      add: false,
      duplicate: false,
      edit: false,
      delete: false,
      custom: [
        {
          label: "Make it mine",
          icon: "i-ph-user-plus",
          target: {
            type: "api",
            url: "/api/playground/cell-accounts/assign-to-me?id={{row._id}}",
            successMessage: "Account assigned to you",
          },
        },
      ],
    },
  });
}
