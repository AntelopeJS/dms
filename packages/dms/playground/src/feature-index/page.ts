import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { StatGroup } from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  DefaultDisplays,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { examplesCategory } from "../examples/category";
import { FEATURE_INDEX_URL } from "./api";
import { FEATURE_AREAS } from "./types";

const AREA_TABS = Object.entries(FEATURE_AREAS).map(([id, label]) => ({
  id,
  label,
  filter: { accessorKey: "area", mode: "is" as const, value: label },
}));

@RegisterPage()
export class PlaygroundFeatureIndexPage extends PageController(
  "features",
  {
    displayName: "Feature index",
    icon: "i-ph-list-checks",
    category: examplesCategory,
    order: 1,
    description:
      "Every DMS feature and the page that shows it. Click a row to open its demo; a demo whose page is gone is flagged missing",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static stats = StatGroup({
    layout: "cards",
    columns: 3,
    fetchUrl: `${FEATURE_INDEX_URL}/stats`,
  });

  static features = TableView.fromSource({
    caption: "Features",
    fetchUrl: FEATURE_INDEX_URL,
    labelKey: "feature",
    pageSize: 50,
    rowClick: "single",
    searchPlaceholder: "Search a feature or an API",
    capabilities: { filter: true },
    tabs: [{ id: "all", label: "All" }, ...AREA_TABS],
    rowActions: {
      custom: [
        {
          label: "Open the demo",
          icon: "i-ph-arrow-right",
          isDefault: true,
          target: { type: "page", url: "{demo}" },
        },
      ],
    },
    columns: {
      area: {
        name: "Area",
        type: new DefaultDataTypes.StringType(),
        isVisible: false,
        filterable: true,
      },
      feature: {
        name: "Feature",
        type: new DefaultDataTypes.StringType(),
        display: new DefaultDisplays.TwoLineDisplay({ subField: "area" }),
        size: 300,
        sortable: true,
      },
      api: {
        name: "API",
        type: new DefaultDataTypes.StringType(),
        display: new DefaultDisplays.MonoDisplay(),
        size: 300,
      },
      demo: {
        name: "Demo",
        type: new DefaultDataTypes.StringType(),
        display: new DefaultDisplays.MonoDisplay({ copy: true }),
        size: 260,
      },
      since: {
        name: "Since",
        type: new DefaultDataTypes.StringType(),
        size: 90,
        sortable: true,
      },
      status: {
        name: "Demo page",
        type: new DefaultDataTypes.StringType(),
        display: new DefaultDisplays.StatusPillDisplay({
          tones: { shown: "success", missing: "error" },
        }),
        size: 130,
        sortable: true,
      },
    },
  });
}
