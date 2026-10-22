// The builder schema of a table view's row actions, each a switch that may
// carry a rule.
//
// Split out of table-view/schema.ts.

import { z } from "zod";
import { type BlockOptionsFor, opaqueOption, ui } from "../../block-registry";
import type { CustomRowAction, RowActionRule } from "../../types/row-action";
import type { TableViewRowActionOptions } from "../options";

const rowActionConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  rule: ui(opaqueOption<RowActionRule>().optional(), {
    label: "Rule",
    widget: "json",
  }),
});

interface RowActionDefaults {
  /**
   * Whether the table offers the action when nothing turns it off, to whoever
   * holds its permission. The factory reads an absent action as on, and says so
   * here so an editor's switch does not show a feature the table has as off.
   */
  offered?: boolean;
  /** When the action is offered at all, for one that depends on another. */
  note?: string;
}

const rowActionOption = (
  label: string,
  order: number,
  { offered = true, note }: RowActionDefaults = {},
) => {
  const action = z.union([z.boolean(), rowActionConfigSchema]);
  const described = note ? action.describe(note) : action;
  return ui(offered ? described.default(true) : described.optional(), {
    label,
    order,
    group: "features",
    widget: "switch",
  });
};

/** @internal The builder schema of a table view's `rowActions`. */
export const rowActionsSchema = z.object({
  add: rowActionOption("Adding data", 1),
  edit: rowActionOption("Editing data", 2),
  delete: rowActionOption("Deleting data", 3),
  // Turned off whenever editing is on without a rule: editing opens the row
  // already, so the factory drops the second way in.
  details: rowActionOption("View details", 6, {
    offered: false,
    note: "Offered while editing is off: editing already opens the row.",
  }),
  duplicate: rowActionOption("Duplicate", 7),
  archive: rowActionOption("Archive", 8, {
    note: "Offered while ghost delete is on.",
  }),
  restore: rowActionOption("Restore", 9, {
    note: "Offered while ghost delete is on.",
  }),
  copyLink: rowActionOption("Copy link", 10),
  hasSelection: ui(z.boolean().optional(), {
    label: "Row selection",
    order: 11,
    group: "features",
    widget: "switch",
  }),
  custom: ui(opaqueOption<CustomRowAction[]>().optional(), {
    label: "Custom actions",
    hidden: true,
  }),
  menuLabel: ui(
    z
      .string()
      .optional()
      .describe("Accessible name of a row's ⋯ menu, e.g. Actions for {name}."),
    { label: "Row menu label", order: 12, group: "features", advanced: true },
  ),
}) satisfies BlockOptionsFor<TableViewRowActionOptions>;
