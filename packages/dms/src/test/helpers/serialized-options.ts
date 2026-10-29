import type { FormPropsSerialized } from "@antelopejs/interface-dms/base/form";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view";

import type { PageHeaderButtonSerialized } from "@antelopejs/interface-dms/base/internal/layouts";

interface ServedComponent {
  options?: unknown;
}

function isFormOptions(value: unknown): value is FormPropsSerialized {
  return (
    value instanceof Object && "fields" in value && Array.isArray(value.fields)
  );
}

function isTableViewOptions(
  value: unknown,
): value is TableViewOptionsSerialized {
  return (
    value instanceof Object &&
    "formComponents" in value &&
    "searchable" in value
  );
}

/** The serialized options of a served form component; throws for any other. */
export function formOptionsOf(
  component: ServedComponent | undefined,
): FormPropsSerialized {
  const options = component?.options;
  if (!isFormOptions(options)) {
    throw new Error("The served component carries no form options");
  }
  return options;
}

/** The serialized options of a served table view; throws for any other. */
export function tableViewOptionsOf(
  component: ServedComponent | undefined,
): TableViewOptionsSerialized {
  const options = component?.options;
  if (!isTableViewOptions(options)) {
    throw new Error("The served component carries no table view options");
  }
  return options;
}

/** What a served `DefaultLayout` says about its header buttons. */
export interface ServedHeaderActions {
  headerActions: PageHeaderButtonSerialized[];
  headerActionsQuery?: Record<string, string>;
}

function isServedHeaderActions(value: unknown): value is ServedHeaderActions {
  return (
    value instanceof Object &&
    "headerActions" in value &&
    Array.isArray(value.headerActions)
  );
}

/** The header buttons of a served `DefaultLayout`; throws without. */
export function headerActionsOf(
  layout: ServedComponent | undefined,
): ServedHeaderActions {
  const options = layout?.options;
  if (!isServedHeaderActions(options)) {
    throw new Error("The served layout declares no header actions");
  }
  return options;
}
