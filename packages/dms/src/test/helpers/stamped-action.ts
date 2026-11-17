import { Action, type Component } from "@antelopejs/interface-dms/component";

/**
 * An action as a page leaves it once mounted: it carries `stamp` as its
 * permission id, or none when `stamp` is `undefined`, as an action of a
 * component no page mounted does.
 */
export class StampedAction extends Action {
  constructor(
    id: string,
    private readonly stamp: string | undefined,
    owner: Component,
  ) {
    super(id, { title: id }, owner);
  }

  override get permissionId(): string | undefined {
    return this.stamp;
  }
}
