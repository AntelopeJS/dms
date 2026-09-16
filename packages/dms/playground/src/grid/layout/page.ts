import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { Tab } from "@antelopejs/interface-dms/base/tab";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

const defaultTreeProps = {
  fetchUrl: "/api/layout-grid/files",
  color: Color.primary,
  size: Size.medium,
  selectionBehavior: TreeSelectionBehavior.toggle,
  multiple: false,
};

@RegisterPage()
export class PageLayoutGridSimple extends PageController("layout-grid-simple", {
  displayName: "Simple Grid Layout",
  icon: "i-ph-grid-four",
  category: pageCategory,
  order: 0,
  description: "Grid layout with FileTree on the left and Tabs on the right",
}) {
  static grid = Grid({ gap: "1rem" }).child(
    "row1",
    GridRow()
      .child(
        "fileTree",
        Tree({
          title: "File Explorer",
          description: "Browse project files and folders",
          ...defaultTreeProps,
        }),
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
          .child(
            "projectTree",
            Tree({
              title: "Project Structure",
              description: "Navigate through project components",
              ...defaultTreeProps,
            }),
            { slot: "overview" },
          )
          .child(
            "configTree",
            Tree({
              title: "Configuration Files",
              description: "View and manage configuration files",
              ...defaultTreeProps,
            }),
            { slot: "settings" },
          )
          .child(
            "docsTree",
            Tree({
              title: "Docs Structure",
              description: "Browse documentation files",
              ...defaultTreeProps,
            }),
            { slot: "documentation" },
          ),
      ),
  );
}
