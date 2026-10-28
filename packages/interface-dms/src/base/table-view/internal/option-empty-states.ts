/** @internal @packageDocumentation */
import type { BlockLinkAction } from "../../display";
import type { Component, ComponentInfoSerialized } from "../../../component";

/**
 * What a table's empty body says for one reason it is empty, in place of the
 * built-in texts. Texts are `$`-prefixed i18n keys or literals; both receive
 * `{ search }`, the text searched. Action labels receive no parameter.
 */
export interface TableViewEmptyState {
  title: string;
  description?: string;
  icon?: string;
  /** Link buttons, after the ones the table adds itself. */
  actions?: BlockLinkAction[];
  /**
   * Frontend component drawing the whole state instead (a gallery of
   * templates), resolved by name from the global registry. It receives
   * `state` (`firstRun`, `filtered` or `error`), `search`, `refresh()`, and
   * `clearSearch()` / `clearFilters()` while a search or a filter chip
   * narrows the rows (unset otherwise); `useTableViewEmptyState()` reads the
   * same from deeper in its tree.
   */
  component?: Component;
}

/**
 * The empty states of a table: `firstRun` while it has no row yet (it keeps
 * the add button), `filtered` when its filters or search match nothing (it
 * keeps "Clear search", "Clear filters" or "Clear filters and search"),
 * `error` when the list failed (it keeps "Try again"). The grid and the
 * `cards` display draw them; the kanban board and a module's own display do
 * not.
 */
export interface TableViewEmptyStates {
  firstRun?: TableViewEmptyState;
  filtered?: TableViewEmptyState;
  error?: TableViewEmptyState;
}

/** An empty state as it reaches the client. */
export interface TableViewEmptyStateSerialized extends Omit<
  TableViewEmptyState,
  "component"
> {
  component?: ComponentInfoSerialized;
}

/** The empty states as they reach the client. */
export type TableViewEmptyStatesSerialized = Partial<
  Record<keyof TableViewEmptyStates, TableViewEmptyStateSerialized>
>;
