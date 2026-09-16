import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Tree,
  TreeSelectionBehavior,
} from "@antelopejs/interface-dms/base/tree";
import { Color, Size } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageTreeDefault extends PageController("tree-default", {
  displayName: "Default Tree",
  icon: "i-ph-tree-structure",
  category: pageCategory,
  order: 0,
  description: "Basic tree component with default settings",
}) {
  static basicTree = Tree({
    title: "Basic File Explorer",
    description: "Simple tree with default settings",
    fetchUrl: "/api/tree/data",
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static treeWithTitleAndDescription = Tree({
    title: "Project Structure",
    description: "Navigate through your project files and folders",
    fetchUrl: "/api/tree/data",
    color: Color.primary,
    size: Size.medium,
    selectionBehavior: TreeSelectionBehavior.toggle,
  });

  static staticDataTree = Tree({
    title: "Static Data Tree",
    description: "Tree component using static data instead of API",
    staticNodes: [
      {
        label: "Documents",
        value: "documents",
        icon: "i-ph-folder",
        expandable: true,
        children: [
          {
            label: "Projects",
            value: "projects",
            icon: "i-ph-folder",
            expandable: true,
            children: [
              {
                label: "Project A",
                value: "project-a",
                icon: "i-ph-file-text",
                selectable: true,
              },
              {
                label: "Project B",
                value: "project-b",
                icon: "i-ph-file-text",
                selectable: true,
              },
            ],
          },
          {
            label: "Notes.txt",
            value: "notes",
            icon: "i-ph-note",
            selectable: true,
          },
        ],
      },
      {
        label: "Images",
        value: "images",
        icon: "i-ph-folder",
        expandable: true,
        children: [
          {
            label: "photo1.jpg",
            value: "photo1",
            icon: "i-ph-image",
            selectable: true,
          },
          {
            label: "photo2.png",
            value: "photo2",
            icon: "i-ph-image",
            selectable: true,
          },
        ],
      },
      {
        label: "config.json",
        value: "config",
        icon: "i-ph-gear",
        selectable: true,
      },
    ],
    selectionBehavior: TreeSelectionBehavior.toggle,
  });
}
