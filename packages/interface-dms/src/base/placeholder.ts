import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";

const PLACEHOLDER_COMPONENT_NAME = "dms-placeholder";

/**
 * Options for Placeholder component
 */
export interface PlaceholderOptions {
  /**
   * Label text to display in the box
   */
  label?: string;

  /**
   * Height of the box (CSS unit)
   * @default undefined (fills its cell, never under 120px)
   */
  height?: string;

  /**
   * Width of the box (CSS unit)
   * @default undefined (auto)
   */
  width?: string;
}

/** The options `Placeholder` accepts. */
export const PlaceholderSchema = z.object({
  label: ui(z.string().optional().describe("Text shown inside the box."), {
    label: "Label",
    group: "content",
  }),
  height: ui(
    z
      .string()
      .optional()
      .describe(
        "How tall the box is, such as 200px; left empty, it fills its place.",
      ),
    { label: "Height", group: "appearance", advanced: true },
  ),
  width: ui(
    z
      .string()
      .optional()
      .describe(
        "How wide the box is, such as 300px; left empty, it fills its column.",
      ),
    { label: "Width", group: "appearance", advanced: true },
  ),
}) satisfies BlockOptionsFor<PlaceholderOptions>;

/**
 * Placeholder - Development Placeholder Component
 *
 * A visual placeholder component for demonstrations and examples.
 * Shows a bordered box with a pattern background and optional label.
 *
 * @example
 * ```typescript
 * Placeholder({ label: 'Item 1', height: '200px' })
 * ```
 */
export function Placeholder(
  options?: PlaceholderOptions,
): ComponentBuilder<PlaceholderOptions> {
  return new ComponentBuilder<PlaceholderOptions>(PLACEHOLDER_COMPONENT_NAME)
    .options({ ...options })
    .meta({
      name: "Placeholder",
      icon: "i-ph-selection",
    });
}

RegisterBlockType({
  type: "Placeholder",
  componentName: PLACEHOLDER_COMPONENT_NAME,
  schema: PlaceholderSchema,
  meta: {
    name: "Placeholder",
    icon: "i-ph-selection",
    description: "Empty box standing in for content still to come.",
    group: "layout",
  },
});
