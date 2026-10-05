import { ComponentBuilder } from "../component";
import { z } from "zod";
import { type BlockOptionsFor, RegisterBlockType, ui } from "./block-registry";
import { blockCardOption } from "./display";
import type { BaseComponentProps } from "./types";

/** The options `Section` takes. */
export interface SectionProps extends BaseComponentProps {
  /** Heading above the card (i18n key with `$` or literal). */
  title?: string;
  /** One line under the heading. */
  description?: string;
  /** Destructive actions: the frame and the title turn to the error color. */
  danger?: boolean;
  /**
   * The card frame around the children. Defaults to `true`; off for grids
   * and custom layouts.
   */
  card?: boolean;
}

/** How a field row lays its label and control out. */
export const FIELD_ROW_LAYOUTS = ["inline", "form", "stack"] as const;
export type FieldRowLayout = (typeof FIELD_ROW_LAYOUTS)[number];

/** The options `FieldRow` takes. */
export interface FieldRowProps extends BaseComponentProps {
  /** Row label (i18n key with `$` or literal). */
  label?: string;
  /** Help text under the label. */
  description?: string;
  /**
   * `inline` (default): label left, compact control right — switches, selects,
   * buttons. `form`: a 240px label column beside a full-width control. `stack`:
   * the label above the control.
   */
  layout?: FieldRowLayout;
  /** Red asterisk after the label. */
  required?: boolean;
  /** Dims the whole row. */
  disabled?: boolean;
}

const SECTION_COMPONENT_NAME = "dms-section-block";
const FIELD_ROW_COMPONENT_NAME = "dms-field-row-block";
const SECTION_ICON = "i-ph-rows";
const FIELD_ROW_ICON = "i-ph-text-columns";

/**
 * Section - a titled settings block.
 *
 * A heading and a one-line description above a card whose children — field
 * rows, a form, a list — are set apart by hairlines. A `Form` placed in a
 * framed section drops its own card and lays its fields out as the section's
 * rows.
 *
 * @example
 * ```typescript
 * Section({ title: "Workspace", description: "How the workspace appears." })
 *   .child("name", FieldRow({ label: "Name", layout: "form" }).child("v", …))
 *   .child("form", Form({ fields, submitUrl, saveBar: true }))
 * ```
 */
export function Section(
  options?: SectionProps,
): ComponentBuilder<SectionProps> {
  return new ComponentBuilder<SectionProps>(SECTION_COMPONENT_NAME)
    .options({ ...options })
    .meta({
      name: options?.title || "Section",
      icon: SECTION_ICON,
    });
}

/**
 * FieldRow - one row of a section: a label with its help text
 * and the control its child block renders — a button, a status, a meter.
 *
 * Fields that are filled in and submitted belong to a `Form`, which owns their
 * values, validation and submit; a field row holds a block that stands on its
 * own.
 *
 * @example
 * ```typescript
 * FieldRow({ label: "Seats", description: "Billed monthly." })
 *   .child("meter", Meter({ value: 8, max: 10 }))
 * ```
 */
export function FieldRow(
  options?: FieldRowProps,
): ComponentBuilder<FieldRowProps> {
  return new ComponentBuilder<FieldRowProps>(FIELD_ROW_COMPONENT_NAME)
    .options({ ...options })
    .meta({
      name: options?.label || "Field row",
      icon: FIELD_ROW_ICON,
    });
}

/** The options `Section` accepts. */
export const SectionSchema = z.object({
  title: ui(z.string().optional().describe("Heading above the card."), {
    label: "Title",
    group: "content",
  }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  danger: ui(
    z.boolean().optional().describe("Marks a block of destructive actions."),
    { label: "Danger zone", group: "appearance", widget: "switch" },
  ),
  card: blockCardOption(true),
}) satisfies BlockOptionsFor<SectionProps>;

/** The options `FieldRow` accepts. */
export const FieldRowSchema = z.object({
  label: ui(z.string().optional(), { label: "Label", group: "content" }),
  description: ui(z.string().optional(), {
    label: "Help text",
    group: "content",
    widget: "textarea",
  }),
  layout: ui(z.enum(FIELD_ROW_LAYOUTS).optional(), {
    label: "Layout",
    group: "layout",
    widget: "segmented",
  }),
  required: ui(z.boolean().optional(), {
    label: "Required mark",
    group: "appearance",
    widget: "switch",
  }),
  disabled: ui(z.boolean().optional(), {
    label: "Disabled",
    group: "appearance",
    widget: "switch",
  }),
}) satisfies BlockOptionsFor<FieldRowProps>;

RegisterBlockType({
  type: "Section",
  componentName: SECTION_COMPONENT_NAME,
  schema: SectionSchema,
  container: true,
  meta: {
    name: "Section",
    icon: SECTION_ICON,
    description: "Titled card of settings rows, a form or a list.",
    group: "layout",
  },
});

RegisterBlockType({
  type: "FieldRow",
  componentName: FIELD_ROW_COMPONENT_NAME,
  schema: FieldRowSchema,
  container: true,
  meta: {
    name: "Field row",
    icon: FIELD_ROW_ICON,
    description: "Labelled row holding one block, inside a section.",
    group: "layout",
  },
});
