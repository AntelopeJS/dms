import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTreeSizes extends PageController("tree-sizes", {
  displayName: "Tree Sizes",
  icon: "i-ph-ruler",
  category: pageCategory,
  order: 20,
  description: "Tree component with different size variants",
}) {
  static xsTree = Tree({
    title: "Extra Small (xs)",
    description: "Compact tree for tight spaces",
    fetchUrl: "/api/tree/data",
    size: Size.tiny,
    color: Color.primary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static smTree = Tree({
    title: "Small (sm)",
    description: "Small tree with reduced padding",
    fetchUrl: "/api/tree/data",
    size: Size.small,
    color: Color.primary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static mdTree = Tree({
    title: "Medium (md)",
    description: "Default medium size tree",
    fetchUrl: "/api/tree/data",
    size: Size.medium,
    color: Color.primary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static lgTree = Tree({
    title: "Large (lg)",
    description: "Large tree with increased padding",
    fetchUrl: "/api/tree/data",
    size: Size.large,
    color: Color.primary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static xlTree = Tree({
    title: "Extra Large (xl)",
    description: "Extra large tree for better visibility",
    fetchUrl: "/api/tree/data",
    size: Size.huge,
    color: Color.primary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });
}
