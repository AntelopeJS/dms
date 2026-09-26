import { strict as assert } from "node:assert";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { z } from "zod";
import { UserInviteModel } from "@antelopejs/interface-dms/db";
import { decideInvite } from "@antelopejs/interface-dms/invite-resolution";
import type { InviteExtensionContext } from "@antelopejs/interface-dms/invite-extensions";
import { internal as extensions } from "@antelopejs/interface-dms/invite-extensions/registry";
import { Form } from "@antelopejs/interface-dms/base/form";
import { editPendingInvite } from "../../pages/settings/users/invite-extension-routes";
import { resetDatabase } from "../helpers/db";

const TENANT = "invite-extension-edit-tenant";
const INVITE_ID = "pending-invite";
const FUTURE_MS = 60_000;

interface ScopeSlice {
  access: string;
}

interface RecordedUpdate {
  payload: unknown;
  previous: unknown;
  context: InviteExtensionContext;
}

// Plain data: the payload reaches the extension as a per-context view.
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("Pending invite edit with extension payloads (MongoDB adapter)", () => {
  let invites: UserInviteModel;
  let updates: RecordedUpdate[];
  let rowWrites: number;

  const writeRow = async () => {
    rowWrites += 1;
  };

  async function storedExtensions(): Promise<unknown> {
    return plain((await invites.get(INVITE_ID))?.extensions);
  }

  beforeEach(async () => {
    await resetDatabase();
    extensions.clearInviteExtensions();
    updates = [];
    rowWrites = 0;
    extensions.applyInviteExtension({
      key: "scope",
      component: Form({ fields: [] }),
      schema: z.object({ access: z.enum(["all", "some"]) }),
      placement: { side: "end", order: 0 },
      onAccept: () => undefined,
      onUpdate: (payload, previous, context) => {
        updates.push({
          payload: plain(payload),
          previous: plain(previous),
          context: plain(context) as InviteExtensionContext,
        });
      },
    });
    extensions.applyInviteExtension({
      key: "frozen",
      component: Form({ fields: [] }),
      schema: z.object({ value: z.string() }),
      placement: { side: "end", order: 0 },
      editable: false,
      onAccept: () => undefined,
    });
    invites = GetModel(UserInviteModel, TENANT);
    await invites.insert({
      _id: INVITE_ID,
      token: "pending-token",
      email: "pending@example.test",
      firstname: null,
      lastname: null,
      language: "en",
      roles_ids: [],
      asTenantOwner: false,
      expiresAt: new Date(Date.now() + FUTURE_MS),
      skipEmailValidation: false,
      extensions: {
        scope: { access: "all" } satisfies ScopeSlice,
        frozen: { value: "kept" },
      },
    });
  });

  afterEach(() => extensions.clearInviteExtensions());

  it("stores the edited payload and tells its extension", async () => {
    await editPendingInvite(
      TENANT,
      INVITE_ID,
      { firstname: "Ada", scope__access: "some", frozen__value: "changed" },
      writeRow,
    );

    assert.equal(rowWrites, 1);
    assert.deepEqual(await storedExtensions(), {
      scope: { access: "some" },
      frozen: { value: "kept" },
    });
    assert.deepEqual(updates, [
      {
        payload: { access: "some" },
        previous: { access: "all" },
        context: {
          tenantId: TENANT,
          email: "pending@example.test",
          inviteId: INVITE_ID,
        },
      },
    ]);
  });

  it("leaves the payloads alone when the submission carries none", async () => {
    await editPendingInvite(TENANT, INVITE_ID, { firstname: "Ada" }, writeRow);

    assert.equal(rowWrites, 1);
    assert.deepEqual(await storedExtensions(), {
      scope: { access: "all" },
      frozen: { value: "kept" },
    });
    assert.deepEqual(updates, []);
  });

  it("refuses an invalid payload before writing anything", async () => {
    await assert.rejects(
      editPendingInvite(TENANT, INVITE_ID, { scope__access: "none" }, writeRow),
    );

    assert.equal(rowWrites, 0);
    assert.deepEqual(await storedExtensions(), {
      scope: { access: "all" },
      frozen: { value: "kept" },
    });
  });

  it("refuses an invitation already decided", async () => {
    const invite = await invites.get(INVITE_ID);
    assert.ok(invite);
    await decideInvite({ tenantId: TENANT, invite, reason: "cancelled" });

    await assert.rejects(
      editPendingInvite(TENANT, INVITE_ID, { scope__access: "some" }, writeRow),
    );
    assert.equal(rowWrites, 0);
  });

  it("refuses an invitation that does not exist", async () => {
    await assert.rejects(
      editPendingInvite(TENANT, "missing", { scope__access: "some" }, writeRow),
    );
    assert.equal(rowWrites, 0);
  });
});
