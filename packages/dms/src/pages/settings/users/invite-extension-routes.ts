import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import {
  type DataControllerCallback,
  DefaultRoutes,
} from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  InviteResolutionsModel,
  type UserInvite,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  CollectInviteExtensionEdits,
  NotifyInviteExtensionUpdates,
  ReadInviteExtensionFields,
} from "@antelopejs/interface-dms/invite-extensions";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TableViewRoutes } from "@antelopejs/interface-dms/base";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

function parseEditBody(body: Buffer): unknown {
  return JSON.parse(body.toString());
}

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
    this: unknown,
    ctx: RequestContext,
    params: Parameters.GetParameters,
    ...rest: unknown[]
  ) {
    const row = await TableViewRoutes.Get.func.call(this, ctx, params, ...rest);
    const invite = await GetModel(UserInviteModel, getRequestTenantId(ctx)).get(
      String(params.id),
    );
    return { ...row, ...ReadInviteExtensionFields(invite?.extensions) };
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
  body: unknown,
  writeRow: () => Promise<unknown>,
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
    this: unknown,
    ctx: RequestContext,
    params: Parameters.EditParameters,
    body: Buffer,
  ) {
    return editPendingInvite(
      getRequestTenantId(ctx),
      String(params.id),
      parseEditBody(body),
      () => DefaultRoutes.Edit.func.call(this, ctx, params, body),
    );
  },
};

export const inviteEditRoute = TableViewRoutes.EditWith(
  editInviteWithExtensions,
);
