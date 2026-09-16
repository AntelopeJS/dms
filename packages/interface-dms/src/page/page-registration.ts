// What a page registration created and how to undo it: the route callback
// context and the registry of layouts to replay.
//
// Split out of metadata.ts.

import { Logging } from "@antelopejs/interface-core/logging";
import type { User } from "../auth/db";
// Import from the defining leaf, not the dms-base barrel: the barrel pulls in
// table-view, which imports the page interface back — entering through the
// barrel would then call DefaultLayout() while the barrel is still
// mid-evaluation.
import { RoleModel, TenantMemberModel } from "../db";
// Deliberate and documented above: categories resolve controller
// classes through PageMetadata, and metadata registers pages
// through the proxies declared in categories. Neither module
// dereferences the other while it evaluates.
// oxlint-disable-next-line import/no-cycle
export interface RouteCallbackContext {
  user: User;
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
  tenantId: string;
}

/**
 * What one registration of a page created, and how to take it back down.
 *
 * Registering scatters state across the page registry, the navigation tree,
 * the permission tree, the layout handlers, the API routes and the realtime
 * topics. Holding the undo of each next to the thing that made it turns
 * teardown from a list somebody has to remember into a loop — and makes it
 * impossible to add a registry to the path without saying how it is released.
 */
export class PageRegistration {
  private readonly disposers: Array<() => void> = [];

  public track(dispose: () => void): void {
    this.disposers.push(dispose);
  }

  /**
   * Undo in reverse, and keep going when one step throws: a teardown that
   * stops halfway leaves more behind than the error it reported.
   */
  public dispose(): void {
    for (const dispose of this.disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch (error) {
        Logging.Warn(`[DMS] Page teardown step failed: ${String(error)}`);
      }
    }
  }
}
