import type { ConfigObject } from "@antelopejs/interface-dms-builder";
import { InvalidValueError } from "./value";

/** The two options a TableView takes its tabs from, of which it holds one at most. */
export const TABS_SOURCES = [
  ["tabs", "tabsFrom"],
  ["tabsFrom", "tabs"],
] as const;

/**
 * Refuses the config or patch of a block of type `type` that sets both of a TableView's tabs
 * sources, which registration refuses.
 */
export function assertOneTabsSource(
  type: string | undefined,
  config: ConfigObject,
): void {
  if (
    type === "TableView" &&
    TABS_SOURCES.every(([key]) => config[key] !== undefined)
  ) {
    throw new InvalidValueError(
      "a TableView lists its tabs or reads them from a column, not both: send `tabs` or `tabsFrom`",
    );
  }
}
