import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import {
  KeyValueList,
  type KeyValueListItem,
} from "@antelopejs/interface-dms/base/key-value-list";
import { Placeholder } from "@antelopejs/interface-dms/base/placeholder";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

const PROJECT_FILE_ITEMS: KeyValueListItem[] = [
  { label: "src", value: "Folder", detail: "components, utils, App.vue" },
  { label: "public", value: "Folder", detail: "images, index.html" },
  { label: "tests", value: "Folder", detail: "unit, e2e" },
  { label: "package.json", value: "JSON", type: "mono" },
  { label: "README.md", value: "Markdown", type: "mono" },
];

@RegisterPage()
export class PageLayoutGridSimple extends PageController("layout-grid-simple", {
  displayName: "Simple Grid Layout",
  icon: "i-ph-grid-four",
  category: pageCategory,
  order: 0,
  description: "Grid layout with a file list on the left and Tabs on the right",
}) {
  static grid = Grid({ gap: "1rem" }).child(
    "row1",
    GridRow()
      .child(
        "fileList",
        KeyValueList({ title: "File Explorer", items: PROJECT_FILE_ITEMS }),
      )
      .child(
        "tabs",
        Tab({
          items: [
            {
              label: "Overview",
              icon: "i-ph-info",
              slot: "overview",
            },
            {
              label: "Settings",
              icon: "i-ph-gear",
              slot: "settings",
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
          .child("overviewPanel", Placeholder({ label: "Project Structure" }), {
            slot: "overview",
          })
          .child(
            "settingsPanel",
            Placeholder({ label: "Configuration Files" }),
            { slot: "settings" },
          )
          .child(
            "documentationPanel",
            Placeholder({ label: "Docs Structure" }),
            { slot: "documentation" },
          ),
      ),
  );
}
