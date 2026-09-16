interface TreeComponentProps {
  componentId: string;
  pageId: string;
  routeParams?: Record<string, string>;
  watchActions?: WatchAction[];
  childCount?: number;
}

export enum TreeSelectionBehavior {
  toggle = "toggle",
  replace = "replace",
}

export interface TreeProps extends TreeComponentProps {
  title?: string;
  description?: string;
  color?: Color;
  size?: Size;
  trailingIcon?: string;
  expandedIcon?: string;
  collapsedIcon?: string;
  multiple?: boolean;
  defaultExpanded?: string[];
  disabled?: boolean;
  selectionBehavior: TreeSelectionBehavior;
  propagateSelect?: boolean;
  fetchUrl?: string;
  fetchUrlMethod?: HttpMethod;
  staticNodes?: TreeNode[];
  lazyLoad?: boolean;
  nodeToggleFunctionId?: string;
  nodeSelectFunctionId?: string;
  modelValue?: TreeNode | TreeNode[];
}
