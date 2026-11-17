import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view";
import {
  type Action,
  ComponentBuilder,
} from "@antelopejs/interface-dms/component";
import { StampedAction } from "./stamped-action";

/**
 * A table view builder as a page leaves it once mounted: each action in
 * `stamps` carries the permission id of its entry, or none when the entry is
 * `undefined`, as an action of a table view no page mounted does. Any other
 * action id is not declared.
 */
export class StampedTableViewBuilder extends ComponentBuilder<TableViewOptionsSerialized> {
  private readonly stampedActions: ReadonlyMap<string, StampedAction>;

  constructor(stamps: Readonly<Record<string, string | undefined>> = {}) {
    super("TableView");
    this.stampedActions = new Map(
      Object.entries(stamps).map(([id, stamp]) => [
        id,
        new StampedAction(id, stamp, this),
      ]),
    );
  }

  override getAction(id: string): Action | undefined {
    return this.stampedActions.get(id);
  }
}
