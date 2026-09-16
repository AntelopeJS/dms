import type { TreeItem as UiTreeItem } from "@nuxt/ui";

export interface TreeNode<T = unknown> extends UiTreeItem {
  customData?: T;
  children?: TreeNode<T>[];
  expandable?: boolean;
  selectable?: boolean;
  hasChildren?: boolean;
  isLoading?: boolean;
  lazyLoadUrl?: string;
  hierarchicalPath?: string;
}
