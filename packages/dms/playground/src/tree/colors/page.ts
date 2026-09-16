import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTreeColors extends PageController("tree-colors", {
  displayName: "Tree Colors",
  icon: "i-ph-palette",
  category: pageCategory,
  order: 10,
  description: "Tree component with different color variants",
}) {
  static primaryTree = Tree({
    title: "Primary Theme",
    description: "Tree with primary color scheme",
    fetchUrl: "/api/tree/data",
    color: Color.primary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static secondaryTree = Tree({
    title: "Secondary Theme",
    description: "Tree with secondary color scheme",
    fetchUrl: "/api/tree/data",
    color: Color.secondary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static successTree = Tree({
    title: "Success Theme",
    description: "Tree with success color scheme",
    fetchUrl: "/api/tree/data",
    color: Color.success,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static infoTree = Tree({
    title: "Info Theme",
    description: "Tree with info color scheme",
    fetchUrl: "/api/tree/data",
    color: Color.info,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static warningTree = Tree({
    title: "Warning Theme",
    description: "Tree with warning color scheme",
    fetchUrl: "/api/tree/data",
    color: Color.warning,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static errorTree = Tree({
    title: "Error Theme",
    description: "Tree with error color scheme",
    fetchUrl: "/api/tree/data",
    color: Color.error,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static neutralTree = Tree({
    title: "Neutral Theme",
    description: "Tree with neutral color scheme",
    fetchUrl: "/api/tree/data",
    color: Color.neutral,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });
}
