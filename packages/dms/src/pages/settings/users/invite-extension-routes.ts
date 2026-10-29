import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import {
  type DataControllerCallback,
  type DataControllerInstance,
  DefaultRoutes,
} from "@antelopejs/interface-data-api";
import {
  type Parameters,
  Validation,
} from "@antelopejs/interface-data-api/components";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { InviteResolutionsModel } from "@antelopejs/interface-dms/db/internal/inviteResolutions.model";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  CollectInviteExtensionEdits,
  NotifyInviteExtensionUpdates,
  ReadInviteExtensionFields,
} from "@antelopejs/interface-dms/invite-extensions/internal/edit";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TableViewRoutes } from "@antelopejs/interface-dms/base";
import { changeTenantMembers } from "@antelopejs/interface-dms/tenant-members";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/**
 * The invitation about to be edited. One with a decision already taken is
 * delivered from the snapshot that decision holds, so an edit landing now
 * would be silently lost.
 */
async function loadPendingInvite(
  tenantId: string,
  inviteId: string,
): Promise<UserInvite> {
  const invite = await GetModel(UserInviteModel, tenantId).get(inviteId);
  assert(invite, HTTP_NOT_FOUND, "$page.settings.invites.error.not_found");
  const resolution = await GetModel(
    InviteResolutionsModel,
    tenantId,
  ).getForInvite(tenantId, inviteId);
  assert(!resolution, HTTP_CONFLICT, "$page.settings.invites.error.resolved");
  return invite;
}

/** The invitation's row, with its extension payloads as edit-form values. */
export const inviteGetRoute: DataControllerCallback = {
  ...TableViewRoutes.Get,
  func: async function (
    this: DataControllerInstance,
    ctx: RequestContext,
    params: Parameters.GetParameters,
    ...rest: unknown[]
  ) {
    const row = await TableViewRoutes.Get.func.call(this, ctx, params, ...rest);
    const invite = await GetModel(UserInviteModel, getRequestTenantId(ctx)).get(
      String(params.id),
    );
    return {
      ...row,
      ...ReadInviteExtensionFields(invite?.extensions),
    };
  },
};

/**
 * Edit a pending invitation: `writeRow` stores its own columns, then the
 * extension payloads the form changed are stored over the old ones and their
 * extensions told. The payloads are validated before anything is written, so a
 * refused one leaves the invitation untouched.
 */
export async function editPendingInvite(
  tenantId: string,
  inviteId: string,
  body: Parameters<typeof CollectInviteExtensionEdits>[0],
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The row callback result is awaited and discarded, matching the data controller's unconstrained result contract.
  writeRow: () => Promise<unknown>,
): Promise<void> {
  return changeTenantMembers(tenantId, async () => ({
    changes: [],
    write: () => editAdmittedPendingInvite(tenantId, inviteId, body, writeRow),
  }));
}

async function editAdmittedPendingInvite(
  tenantId: string,
  inviteId: string,
  body: Parameters<typeof CollectInviteExtensionEdits>[0],
  writeRow: Parameters<typeof editPendingInvite>[3],
): Promise<void> {
  const edits = CollectInviteExtensionEdits(body);
  const invite = await loadPendingInvite(tenantId, inviteId);

  await writeRow();
  if (Object.keys(edits).length === 0) return;

  await GetModel(UserInviteModel, tenantId).update(inviteId, {
    extensions: { ...invite.extensions, ...edits },
  });
  await NotifyInviteExtensionUpdates(invite.extensions, edits, {
    tenantId,
    email: invite.email,
    inviteId,
  });
}

const editInviteWithExtensions: DataControllerCallback = {
  ...DefaultRoutes.Edit,
  func: function (
    this: DataControllerInstance,
    ctx: RequestContext,
    params: Parameters.EditParameters,
    body: Buffer,
  ) {
    return editAdmittedPendingInvite(
      getRequestTenantId(ctx),
      String(params.id),
      Validation.ParseBody(body),
      () => DefaultRoutes.Edit.func.call(this, ctx, params, body),
    );
  },
};

const guardedInviteEditRoute = TableViewRoutes.EditWith(
  editInviteWithExtensions,
);

export const inviteEditRoute: DataControllerCallback = {
  ...guardedInviteEditRoute,
  func(...args: Parameters<DataControllerCallback["func"]>) {
    return changeTenantMembers(getRequestTenantId(args[0]), async () => ({
      changes: [],
      write: () => guardedInviteEditRoute.func.apply(this, args),
    }));
  },
};
