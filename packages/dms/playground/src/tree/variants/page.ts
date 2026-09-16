import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTreeVariants extends PageController("tree-variants", {
  displayName: "Tree Variants",
  icon: "i-ph-sliders",
  category: pageCategory,
  order: 40,
  description: "Tree component advanced features and variants",
}) {
  static lazyLoadTree = Tree({
    title: "Lazy Load Tree",
    description: "Loads child nodes on demand when expanded",
    fetchUrl: "/api/tree/lazy",
    lazyLoad: true,
    color: Color.primary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static lazyLoadTreeWithErrors = Tree({
    title: "Lazy Load Tree with Errors",
    description:
      "Click on folders to test error handling when lazy loading fails",
    fetchUrl: "/api/tree/error-test",
    lazyLoad: true,
    color: Color.error,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static defaultExpandedTree = Tree({
    title: "Pre-expanded Nodes",
    description: "Starts with specific nodes already expanded",
    fetchUrl: "/api/tree/data",
    defaultExpanded: ["root-1", "root-2", "code-src", "media-images"],
    color: Color.secondary,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static customChevronIcons = Tree({
    title: "Chevron Icons",
    description: "Custom expand/collapse icons using chevrons",
    fetchUrl: "/api/tree/data",
    expandedIcon: "i-ph-caret-down",
    collapsedIcon: "i-ph-caret-right",
    color: Color.success,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static customPlusMinusIcons = Tree({
    title: "Plus/Minus Icons",
    description: "Alternative expand/collapse icons",
    fetchUrl: "/api/tree/data",
    expandedIcon: "i-ph-minus-square",
    collapsedIcon: "i-ph-plus-square",
    color: Color.info,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static customFolderIcons = Tree({
    title: "Folder Icons",
    description: "Folder open/closed icons for expansion",
    fetchUrl: "/api/tree/data",
    expandedIcon: "i-ph-folder-open",
    collapsedIcon: "i-ph-folder",
    color: Color.warning,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static trailingIconTree = Tree({
    title: "With Trailing Icons",
    description: "Shows an arrow icon at the end of each item",
    fetchUrl: "/api/tree/data",
    trailingIcon: "i-ph-arrow-right",
    color: Color.error,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static disabledTree = Tree({
    title: "Disabled Tree",
    description: "Entire tree is disabled for interaction",
    fetchUrl: "/api/tree/data",
    disabled: true,
    color: Color.neutral,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static fullFeaturedTree = Tree({
    title: "Combined Features",
    description:
      "Lazy load + multiple selection + custom icons + propagate selection",
    fetchUrl: "/api/tree/data",
    color: Color.primary,
    size: Size.medium,
    lazyLoad: true,
    multiple: true,
    propagateSelect: true,
    selectionBehavior: TreeSelectionBehavior.toggle,
    expandedIcon: "i-ph-folder-open",
    collapsedIcon: "i-ph-folder",
    trailingIcon: "i-ph-arrow-right",
    defaultExpanded: ["root-1", "media-images"],
  });
}
