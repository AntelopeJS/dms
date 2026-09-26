import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import type { BaseComponentProps } from "./types/base-component-props";
import type { EnumOption } from "./types/enum-option";
import { Color } from "./types/color";
import { AxeOrientation } from "./types/orientation";
import { Size } from "./types/size";

export namespace TabEvents {
  export const TAB_CHANGE = "DmsComponent.Tab.Change";
}

export enum TabVariant {
  pill = "pill",
  link = "link",
}

export interface BadgeProps {
  label?: string | number;
  color?: string;
  variant?: "solid" | "outline" | "soft" | "subtle";
  size?: EnumOption<Size>;
}

export interface TabItem {
  label: string;
  slot: string;
  icon?: string;
  badge?: string | number | BadgeProps;
  disabled?: boolean;
  shortcut?: string;
  avatar?: {
    src?: string;
    alt?: string;
    size?: EnumOption<Size>;
  };
}

export interface TabProps extends BaseComponentProps {
  items: TabItem[];
  color?: EnumOption<Color>;
  size?: EnumOption<Size>;
  variant?: EnumOption<TabVariant>;
  orientation?: EnumOption<AxeOrientation>;
  unmountOnHide?: boolean;
  persistState?: boolean;
  stateKey?: string;
}

const TAB_COMPONENT_NAME = "dms-tab";

/**
 * `options` is optional because a page is written as it is built: the editor
 * places a block before anything is configured, and writes that as the bare
 * call `Tab()`. A page under construction has to compile — it is typechecked
 * on every edit — so a block with nothing set yet has to be a legal call.
 */
export const Tab = (options?: TabProps): ComponentBuilder<TabProps> => {
  return new ComponentBuilder<TabProps>(TAB_COMPONENT_NAME)
    .options({ ...options } as TabProps)
    .meta({
      name: "Tabs",
      icon: "i-ph-tabs",
    });
};

const BadgeSchema = z.object({
  label: z.union([z.string(), z.number()]).optional(),
  color: ui(z.string().optional(), { widget: "color" }),
  variant: z.enum(["solid", "outline", "soft", "subtle"]).optional(),
  size: z.nativeEnum(Size).optional(),
}) satisfies BlockOptionsFor<BadgeProps>;

const TabItemSchema = z.object({
  label: ui(z.string().describe("Tab label."), { label: "Label" }),
  slot: ui(z.string().describe("Slot id the tab renders its children into."), {
    label: "Slot",
  }),
  icon: ui(z.string().optional(), { widget: "icon" }),
  badge: z.union([z.string(), z.number(), BadgeSchema]).optional(),
  disabled: ui(z.boolean().optional(), { widget: "switch" }),
  shortcut: z.string().optional(),
  avatar: z
    .object({
      src: z.string().optional(),
      alt: z.string().optional(),
      size: z.nativeEnum(Size).optional(),
    })
    .optional(),
}) satisfies BlockOptionsFor<TabItem>;

/** The options `Tab` accepts. */
export const TabSchema = z.object({
  items: ui(z.array(TabItemSchema).describe("The tabs, in display order."), {
    label: "Tabs",
    group: "content",
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
  variant: ui(z.nativeEnum(TabVariant).optional(), {
    label: "Variant",
    group: "appearance",
    widget: "segmented",
  }),
  orientation: ui(z.nativeEnum(AxeOrientation).optional(), {
    label: "Orientation",
    group: "layout",
    widget: "segmented",
  }),
  unmountOnHide: ui(z.boolean().optional(), {
    label: "Unmount hidden tabs",
    group: "behavior",
    widget: "switch",
  }),
  persistState: ui(
    z.boolean().optional().describe("Remember the open tab across visits."),
    { label: "Remember the open tab", group: "behavior", widget: "switch" },
  ),
  stateKey: ui(z.string().optional(), {
    label: "State key",
    group: "behavior",
  }),
}) satisfies BlockOptionsFor<TabProps>;

RegisterBlockType({
  type: "Tab",
  componentName: TAB_COMPONENT_NAME,
  schema: TabSchema,
  container: true,
  dynamicSlots: { optionPath: "items", idKey: "slot", labelKey: "label" },
  meta: {
    name: "Tabs",
    icon: "i-ph-tabs",
    description: "Tabbed container; each tab renders its own slot.",
    group: "layout",
  },
});
