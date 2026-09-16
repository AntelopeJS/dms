import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";

/**
 * Alignment options for stack layouts
 */
export type StackAlignment = "start" | "center" | "end" | "stretch";

/**
 * Distribution options for stack layouts
 */
export type StackDistribution =
  | "start"
  | "center"
  | "end"
  | "space-between"
  | "space-around"
  | "space-evenly";

/**
 * Options for HStack (Horizontal Stack) component
 */
export interface HStackOptions {
  /**
   * Vertical alignment of children
   * @default 'center'
   */
  alignment?: StackAlignment;

  /**
   * Horizontal distribution of children
   * @default 'start'
   */
  distribution?: StackDistribution;

  /**
   * Spacing between children (CSS unit)
   * @default '8px'
   */
  spacing?: string;

  /**
   * Whether to wrap children to next line when space runs out
   * @default false
   */
  wrap?: boolean;
}

/**
 * Options for VStack (Vertical Stack) component
 */
export interface VStackOptions {
  /**
   * Horizontal alignment of children
   * @default 'center'
   */
  alignment?: StackAlignment;

  /**
   * Vertical distribution of children
   * @default 'start'
   */
  distribution?: StackDistribution;

  /**
   * Spacing between children (CSS unit)
   * @default '8px'
   */
  spacing?: string;
}

/**
 * Options for Spacer component
 */
export interface SpacerOptions {
  /**
   * Minimum size of the spacer (CSS unit)
   * @default undefined (no minimum)
   */
  minSize?: string;

  /**
   * Maximum size of the spacer (CSS unit)
   * @default undefined (no maximum)
   */
  maxSize?: string;

  /**
   * Flex grow value
   * @default 1
   */
  grow?: number;
}

const H_STACK_COMPONENT_NAME = "dms-h-stack";
const V_STACK_COMPONENT_NAME = "dms-v-stack";
const SPACER_COMPONENT_NAME = "dms-spacer";

const STACK_DEFAULTS = {
  alignment: "center",
  distribution: "start",
  spacing: "8px",
} as const;
const H_STACK_DEFAULT_WRAP = false;
const SPACER_DEFAULT_GROW = 1;

const ALIGNMENTS = ["start", "center", "end", "stretch"] as const;
const DISTRIBUTIONS = [
  "start",
  "center",
  "end",
  "space-between",
  "space-around",
  "space-evenly",
] as const;

const alignmentOption = () =>
  ui(
    z
      .enum(ALIGNMENTS)
      .default(STACK_DEFAULTS.alignment)
      .describe("Alignment of children across the stack."),
    { label: "Alignment", group: "layout", widget: "segmented" },
  );

const distributionOption = () =>
  ui(
    z
      .enum(DISTRIBUTIONS)
      .default(STACK_DEFAULTS.distribution)
      .describe("Distribution of children along the stack."),
    { label: "Distribution", group: "layout", widget: "select" },
  );

const spacingOption = () =>
  ui(
    z
      .string()
      .default(STACK_DEFAULTS.spacing)
      .describe("Space between children, as a CSS length."),
    { label: "Spacing", group: "layout" },
  );

/** The options `HStack` accepts. */
export const HStackSchema = z.object({
  alignment: alignmentOption(),
  distribution: distributionOption(),
  spacing: spacingOption(),
  wrap: ui(
    z
      .boolean()
      .default(H_STACK_DEFAULT_WRAP)
      .describe(
        "Wrap children onto a new line when the row runs out of space.",
      ),
    { label: "Wrap", group: "layout", widget: "switch" },
  ),
}) satisfies BlockOptionsFor<HStackOptions>;

/** The options `VStack` accepts. */
export const VStackSchema = z.object({
  alignment: alignmentOption(),
  distribution: distributionOption(),
  spacing: spacingOption(),
}) satisfies BlockOptionsFor<VStackOptions>;

/** The options `Spacer` accepts. */
export const SpacerSchema = z.object({
  minSize: ui(
    z.string().optional().describe("Smallest size the spacer shrinks to."),
    { label: "Minimum size", group: "layout" },
  ),
  maxSize: ui(
    z.string().optional().describe("Largest size the spacer grows to."),
    { label: "Maximum size", group: "layout" },
  ),
  grow: ui(
    z
      .number()
      .default(SPACER_DEFAULT_GROW)
      .describe("Share of the leftover space the spacer takes."),
    { label: "Grow", group: "layout", widget: "number", min: 0 },
  ),
}) satisfies BlockOptionsFor<SpacerOptions>;

/**
 * HStack - Horizontal Stack Layout
 *
 * Arranges child components in a horizontal row, similar to SwiftUI's HStack.
 * Supports alignment, distribution, and spacing configuration.
 *
 * @example
 * ```typescript
 * HStack({
 *   alignment: 'center',
 *   spacing: '16px',
 *   distribution: 'space-between'
 * })
 *   .child('item1', someComponent)
 *   .child('item2', anotherComponent)
 * ```
 */
export function HStack(
  options?: HStackOptions,
): ComponentBuilder<HStackOptions> {
  return new ComponentBuilder<HStackOptions>(H_STACK_COMPONENT_NAME)
    .options({
      ...STACK_DEFAULTS,
      wrap: H_STACK_DEFAULT_WRAP,
      ...options,
    })
    .meta({
      name: "HStack",
      icon: "i-ph-rows",
    });
}

/**
 * VStack - Vertical Stack Layout
 *
 * Arranges child components in a vertical column, similar to SwiftUI's VStack.
 * Supports alignment, distribution, and spacing configuration.
 *
 * @example
 * ```typescript
 * VStack({
 *   alignment: 'start',
 *   spacing: '12px',
 *   distribution: 'space-between'
 * })
 *   .child('item1', someComponent)
 *   .child('item2', anotherComponent)
 * ```
 */
export function VStack(
  options?: VStackOptions,
): ComponentBuilder<VStackOptions> {
  return new ComponentBuilder<VStackOptions>(V_STACK_COMPONENT_NAME)
    .options({
      ...STACK_DEFAULTS,
      ...options,
    })
    .meta({
      name: "VStack",
      icon: "i-ph-columns",
    });
}

/**
 * Spacer - Flexible Space Component
 *
 * Fills available space in a stack layout, similar to SwiftUI's Spacer.
 * Useful for pushing components apart or creating dynamic spacing.
 *
 * @example
 * ```typescript
 * // Push components to edges
 * HStack()
 *   .child('left', Text('Left'))
 *   .child('spacer', Spacer())
 *   .child('right', Text('Right'))
 *
 * // Limited spacer
 * VStack()
 *   .child('top', Text('Top'))
 *   .child('spacer', Spacer({ maxSize: '50px' }))
 *   .child('bottom', Text('Bottom'))
 * ```
 */
export function Spacer(
  options?: SpacerOptions,
): ComponentBuilder<SpacerOptions> {
  return new ComponentBuilder<SpacerOptions>(SPACER_COMPONENT_NAME)
    .options({
      grow: SPACER_DEFAULT_GROW,
      ...options,
    })
    .meta({
      name: "Spacer",
      icon: "i-ph-arrow-line-right",
    });
}

RegisterBlockType({
  type: "HStack",
  componentName: H_STACK_COMPONENT_NAME,
  schema: HStackSchema,
  container: true,
  meta: {
    name: "Horizontal stack",
    icon: "i-ph-rows",
    description: "Lays its children out in a row.",
    group: "layout",
  },
});

RegisterBlockType({
  type: "VStack",
  componentName: V_STACK_COMPONENT_NAME,
  schema: VStackSchema,
  container: true,
  meta: {
    name: "Vertical stack",
    icon: "i-ph-columns",
    description: "Lays its children out in a column.",
    group: "layout",
  },
});

RegisterBlockType({
  type: "Spacer",
  componentName: SPACER_COMPONENT_NAME,
  schema: SpacerSchema,
  meta: {
    name: "Spacer",
    icon: "i-ph-arrow-line-right",
    description: "Flexible gap that pushes stack children apart.",
    group: "layout",
  },
});
