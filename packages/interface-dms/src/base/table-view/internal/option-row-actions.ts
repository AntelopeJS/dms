/** @internal @packageDocumentation */
import type {
  BulkRowActionConfig,
  RowActionConfig,
  AddRowActionConfig,
  CustomRowAction,
  RowActionConfigSerialized,
  CustomRowActionSerialized,
} from "../../types/row-action";

export interface TableViewRowActionOptions<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published default accepts module-owned rows.
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Delete action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'status', notEquals: 'completed' } }
   */
  delete?: boolean | BulkRowActionConfig<T>;
  /**
   * Archive action configuration
   */
  archive?: boolean | BulkRowActionConfig<T>;
  /**
   * Restore action configuration
   */
  restore?: boolean | BulkRowActionConfig<T>;
  /**
   * Duplicate action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'template', equals: true } }
   */
  duplicate?: boolean | RowActionConfig<T>;
  /**
   * Details/view action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'published', equals: true } }
   */
  details?: boolean | RowActionConfig<T>;
  /**
   * Edit action configuration
   * @example true
   * @example { isEnabled: true, rule: { field: 'locked', equals: false } }
   */
  edit?: boolean | RowActionConfig<T>;
  /**
   * Copy link action configuration
   */
  copyLink?: boolean | RowActionConfig<T>;
  /**
   * Add/new row action configuration; `placement: "header"` draws its button
   * in the page header instead of the toolbar.
   */
  add?: boolean | AddRowActionConfig<T>;
  /**
   * Enable the row selection feature
   */
  hasSelection?: boolean;
  /**
   * Custom row actions. A label may name the row's fields in braces
   * (`"Translate {name}"`), as a translation's parameters; a `$` key's
   * translation receives them as parameters.
   */
  custom?: CustomRowAction<T>[];
  /**
   * Accessible name of the ⋯ button opening a row's menu of actions, its
   * `{field}` braces filled from the row (`"Actions for {name}"`). `$`: an
   * i18n key, whose translation receives the row's fields as parameters.
   * Defaults to "Actions for <label>" with `labelKey`, "Row actions" without.
   */
  menuLabel?: string;
}

export interface TableViewRowActionOptionsSerialized {
  delete?: boolean | RowActionConfigSerialized;
  archive?: boolean | RowActionConfigSerialized;
  restore?: boolean | RowActionConfigSerialized;
  showArchived?: boolean;
  duplicate?: boolean | RowActionConfigSerialized;
  details?: boolean | RowActionConfigSerialized;
  edit?: boolean | RowActionConfigSerialized;
  copyLink?: boolean | RowActionConfigSerialized;
  add?: boolean | RowActionConfigSerialized;
  hasSelection?: boolean;
  custom?: CustomRowActionSerialized[];
  menuLabel?: string;
}
