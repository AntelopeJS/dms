import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import type { BaseComponentProps } from "./types/base-component-props";
import type { EnumOption } from "./types/enum-option";
import { Color } from "./types/color";
import { HttpMethod } from "./types/http";
import { Size } from "./types/size";

export enum TreeSelectionBehavior {
  toggle = "toggle",
  replace = "replace",
}

export namespace TreeEvents {
  export const NODE_SELECT = "DmsComponent.Tree.NodeSelect";
  export const NODE_TOGGLE = "DmsComponent.Tree.NodeToggle";
  export const NODE_EXPAND = "DmsComponent.Tree.NodeExpand";
  export const NODE_COLLAPSE = "DmsComponent.Tree.NodeCollapse";
  export const LAZY_LOAD = "DmsComponent.Tree.LazyLoad";
  export const LAZY_LOAD_SUCCESS = "DmsComponent.Tree.LazyLoadSuccess";
}

export interface TreeNode {
  label: string;
  value?: string;
  icon?: string;
  children?: TreeNode[];
  expandable?: boolean;
  selectable?: boolean;
  hasChildren?: boolean;
  isLoading?: boolean;
  lazyLoadUrl?: string;
  customData?: unknown;
  hierarchicalPath?: string;
}

export interface TreeProps extends BaseComponentProps {
  title?: string;
  description?: string;
  color?: EnumOption<Color>;
  size?: EnumOption<Size>;
  trailingIcon?: string;
  expandedIcon?: string;
  collapsedIcon?: string;
  multiple?: boolean;
  defaultExpanded?: string[];
  disabled?: boolean;
  expanded?: string[];
  selectionBehavior: EnumOption<TreeSelectionBehavior>;
  propagateSelect?: boolean;
  fetchUrl?: string;
  fetchUrlMethod?: EnumOption<HttpMethod>;
  staticNodes?: TreeNode[];
  lazyLoad?: boolean;
  nodeToggleFunctionId?: string;
  nodeSelectFunctionId?: string;
}

const TREE_COMPONENT_NAME = "dms-tree";

/**
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `Tree()`. A page under construction has to compile — it is typechecked
 * on every edit — so a block with nothing set yet has to be a legal call.
 */
export const Tree = (options?: TreeProps): ComponentBuilder<TreeProps> => {
  return new ComponentBuilder<TreeProps>(TREE_COMPONENT_NAME)
    .options({ ...options } as TreeProps)
    .meta({
      name: options?.title || "Tree",
      icon: "i-ph-tree-structure",
    });
};

const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    label: z.string(),
    value: z.string().optional(),
    icon: ui(z.string().optional(), { widget: "icon" }),
    children: z.array(TreeNodeSchema).optional(),
    expandable: z.boolean().optional(),
    selectable: z.boolean().optional(),
    hasChildren: z.boolean().optional(),
    isLoading: z.boolean().optional(),
    lazyLoadUrl: ui(z.string().optional(), { widget: "url" }),
    customData: z.unknown().optional(),
    hierarchicalPath: z.string().optional(),
  }),
);

/** The options `Tree` accepts. */
export const TreeSchema = z.object({
  title: ui(z.string().optional(), { label: "Title", group: "content" }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  color: ui(z.nativeEnum(Color).optional(), {
    label: "Colour",
    group: "appearance",
    widget: "select",
  }),
  size: ui(z.nativeEnum(Size).optional(), {
    label: "Size",
    group: "appearance",
    widget: "segmented",
  }),
  trailingIcon: ui(z.string().optional(), {
    label: "Trailing icon",
    group: "appearance",
    widget: "icon",
  }),
  expandedIcon: ui(z.string().optional(), {
    label: "Expanded icon",
    group: "appearance",
    widget: "icon",
  }),
  collapsedIcon: ui(z.string().optional(), {
    label: "Collapsed icon",
    group: "appearance",
    widget: "icon",
  }),
  multiple: ui(z.boolean().optional(), {
    label: "Multiple selection",
    group: "behavior",
    widget: "switch",
  }),
  defaultExpanded: ui(z.array(z.string()).optional(), {
    label: "Expanded by default",
    group: "behavior",
  }),
  disabled: ui(z.boolean().optional(), {
    label: "Disabled",
    group: "behavior",
    widget: "switch",
  }),
  expanded: ui(z.array(z.string()).optional(), {
    label: "Expanded nodes",
    group: "behavior",
  }),
  selectionBehavior: ui(
    z
      .nativeEnum(TreeSelectionBehavior)
      .describe("Whether selecting a node toggles or replaces the selection."),
    { label: "Selection behaviour", group: "behavior", widget: "segmented" },
  ),
  propagateSelect: ui(z.boolean().optional(), {
    label: "Propagate to children",
    group: "behavior",
    widget: "switch",
  }),
  fetchUrl: ui(z.string().optional(), {
    label: "Data source",
    group: "data",
    widget: "url",
  }),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "data",
    widget: "select",
  }),
  staticNodes: ui(z.array(TreeNodeSchema).optional(), {
    label: "Static nodes",
    group: "data",
    widget: "json",
  }),
  lazyLoad: ui(z.boolean().optional(), {
    label: "Load children on demand",
    group: "behavior",
    widget: "switch",
  }),
  nodeToggleFunctionId: ui(z.string().optional(), {
    label: "Toggle handler",
    group: "advanced",
  }),
  nodeSelectFunctionId: ui(z.string().optional(), {
    label: "Select handler",
    group: "advanced",
  }),
}) satisfies BlockOptionsFor<TreeProps>;

RegisterBlockType({
  type: "Tree",
  componentName: TREE_COMPONENT_NAME,
  schema: TreeSchema,
  meta: {
    name: "Tree",
    icon: "i-ph-tree-structure",
    description: "Hierarchical list with expandable nodes.",
    group: "data",
  },
});
