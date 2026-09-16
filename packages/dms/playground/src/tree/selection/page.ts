import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTreeSelection extends PageController("tree-selection", {
  displayName: "Tree Selection",
  icon: "i-ph-selection",
  category: pageCategory,
  order: 30,
  description: "Tree component selection modes and behaviors",
}) {
  static singleToggle = Tree({
    title: "Single Toggle Selection",
    description: "Click to toggle selection on/off for single items",
    fetchUrl: "/api/tree/data",
    multiple: false,
    selectionBehavior: TreeSelectionBehavior.toggle,
    color: Color.primary,
  });

  static singleReplace = Tree({
    title: "Single Replace Selection",
    description: "Click to select, automatically replaces previous selection",
    fetchUrl: "/api/tree/data",
    multiple: false,
    selectionBehavior: TreeSelectionBehavior.replace,
    color: Color.secondary,
  });

  static multipleToggle = Tree({
    title: "Multiple Toggle Selection",
    description: "Click to toggle individual items in multi-select mode",
    fetchUrl: "/api/tree/data",
    multiple: true,
    selectionBehavior: TreeSelectionBehavior.toggle,
    color: Color.success,
  });

  static multipleReplace = Tree({
    title: "Multiple Replace Selection",
    description:
      "Use Ctrl/Cmd+Click for multiple selection, click replaces all",
    fetchUrl: "/api/tree/data",
    multiple: true,
    selectionBehavior: TreeSelectionBehavior.replace,
    color: Color.info,
  });

  static propagateSelection = Tree({
    title: "Propagate Selection",
    description: "Selecting a parent automatically selects all children",
    fetchUrl: "/api/tree/data",
    multiple: true,
    propagateSelect: true,
    selectionBehavior: TreeSelectionBehavior.toggle,
    color: Color.warning,
  });

  static noSelection = Tree({
    title: "Display Only Tree",
    description: "Tree without selection capability (display only)",
    fetchUrl: "/api/tree/data",
    disabled: true,
    color: Color.neutral,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });
}
