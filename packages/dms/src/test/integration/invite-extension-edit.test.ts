import { strict as assert } from "node:assert";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { z } from "zod";
import { UserInviteModel } from "@antelopejs/interface-dms/db";
import { decideInvite } from "@antelopejs/interface-dms/invite-resolution";
import {
  type InviteExtensionContext,
  RegisterInviteExtension,
} from "@antelopejs/interface-dms/invite-extensions";
import { Form } from "@antelopejs/interface-dms/base/form";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  createUser,
  editPendingInvite,
  TENANT,
} from "../helpers/invite-entry-fixtures";
import { resetDatabase } from "../helpers/db";

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

function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("Pending invite edit with extension payloads (MongoDB adapter)", () => {
  let invites: UserInviteModel;
  let updates: RecordedUpdate[];
  let admin: User;
  const disposers: Array<() => void> = [];

  async function storedExtensions(): Promise<unknown> {
    return plain((await invites.get(INVITE_ID))?.extensions);
  }

  beforeEach(async () => {
    await resetDatabase();
    admin = await createUser();
    updates = [];
    disposers.push(
      RegisterInviteExtension({
        key: "scope",
        component: Form({ fields: [] }),
        schema: z.object({ access: z.enum(["all", "some"]) }),
        placement: { side: "end", order: 0 },
        onAccept: () => undefined,
        onUpdate: (payload, previous, context) => {
          updates.push({
            payload: plain(payload),
            previous: plain(previous),
            // SAFETY: InviteExtensionContext contains only strings and optional strings, which JSON cloning preserves while removing context wrappers.
            context: plain(context) as InviteExtensionContext,
          });
        },
      }),
    );
    disposers.push(
      RegisterInviteExtension({
        key: "frozen",
        component: Form({ fields: [] }),
        schema: z.object({ value: z.string() }),
        placement: { side: "end", order: 0 },
        editable: false,
        onAccept: () => undefined,
      }),
    );
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
      extensions: {
        scope: { access: "all" } satisfies ScopeSlice,
        frozen: { value: "kept" },
      },
    });
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
  });

  it("stores the edited payload and tells its extension", async () => {
    disposers.push(
      RegisterInviteExtension({
        key: "onboarding",
        component: Form({ fields: [] }),
        schema: z.object({ track: z.string() }),
        placement: { side: "end", order: 0 },
        onAccept: () => undefined,
      }),
    );
    const invite = await invites.get(INVITE_ID);
    assert.ok(invite);
    await invites.update(INVITE_ID, {
      extensions: { ...invite.extensions, onboarding: { track: "sales" } },
    });

    await editPendingInvite(
      INVITE_ID,
      { firstname: "Ada", scope__access: "some", frozen__value: "changed" },
      admin,
    );

    assert.equal((await invites.get(INVITE_ID))?.firstname, "Ada");
    assert.deepEqual(await storedExtensions(), {
      scope: { access: "some" },
      frozen: { value: "kept" },
      onboarding: { track: "sales" },
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
    await editPendingInvite(INVITE_ID, { firstname: "Ada" }, admin);

    assert.equal((await invites.get(INVITE_ID))?.firstname, "Ada");
    assert.deepEqual(await storedExtensions(), {
      scope: { access: "all" },
      frozen: { value: "kept" },
    });
    assert.deepEqual(updates, []);
  });

  it("refuses an invalid payload before writing anything", async () => {
    await assert.rejects(
      editPendingInvite(
        INVITE_ID,
        { firstname: "Rejected", scope__access: "none" },
        admin,
      ),
    );

    assert.equal((await invites.get(INVITE_ID))?.firstname, null);
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
      editPendingInvite(
        INVITE_ID,
        { firstname: "Rejected", scope__access: "some" },
        admin,
      ),
    );
    assert.equal((await invites.get(INVITE_ID))?.firstname, null);
  });

  it("refuses an invitation that does not exist", async () => {
    await assert.rejects(
      editPendingInvite("missing", { scope__access: "some" }, admin),
    );
    assert.equal(await invites.get("missing"), undefined);
  });
});
