import { randomUUID } from "node:crypto";
import { ok, rejects } from "node:assert/strict";
import { ImplementInterface } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { z } from "zod";
import {
  RoleModel,
  type TenantMember,
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  ExecuteHooks,
  Hook,
  type InviteDeletedReason,
} from "@antelopejs/interface-dms/hooks";
import {
  type InviteCleanupContext,
  type InviteExtensionOptions,
  RegisterInviteExtension,
} from "@antelopejs/interface-dms/invite-extensions";
import { sendAdminInviteEmail } from "@antelopejs/interface-dms/auth";
import {
  GetPageLayoutBySlug,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { TableViewOptionsSerialized } from "@antelopejs/interface-dms/base/table-view";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  type FormBuilder,
  type FormFieldOrGroupSerialized,
  type FormPropsSerialized,
  isFieldGroupSerialized,
} from "@antelopejs/interface-dms/base/form";
import { captureWarnings } from "../../../helpers/logging";
import {
  createUser,
  directAdd,
  editPendingInvite,
  pendingInvite,
  readPendingInvite,
  submitInvite,
  TENANT,
} from "../../../helpers/invite-entry-fixtures";

let admin: User;

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function textField(id: string, required = false) {
  return {
    id,
    label: id,
    type: new DefaultDataTypes.StringType({}),
    required,
  };
}

/**
 * Stands in for the DMS invite modal: a form that opens the invite slot, its
 * addresses field under its real id (`member-invite-form.ts`).
 */
function inviteHostForm(): FormBuilder {
  return Form({
    fields: [textField("emails", true), textField("roles")],
    slotId: "dms.invite-form",
  });
}

/**
 * Stands in for the edit form of a pending invitation, which lists the
 * invitation's own columns — its address and roles under their stored names.
 */
function inviteEditHostForm(): FormBuilder {
  return Form({
    fields: [
      textField("email"),
      textField("firstname"),
      textField("roles_ids"),
    ],
    slotId: "dms.invite-edit-form",
  });
}

function extensionForm(fieldId: string): FormBuilder {
  return Form({ fields: [textField(fieldId, true)] });
}

const disposers: Array<() => void> = [];

function register<T>(options: InviteExtensionOptions<T>): () => void {
  const dispose = RegisterInviteExtension(options);
  disposers.push(dispose);
  return dispose;
}

interface Recorded {
  accepted: Array<{ payload: unknown; member: TenantMember }>;
  cleaned: InviteCleanupContext[];
}

/** A contributor that records what it was handed, with a one-string payload. */
function recordingExtension(key: string, fieldId = "note") {
  const recorded: Recorded = { accepted: [], cleaned: [] };
  const options: InviteExtensionOptions<{ [k: string]: string }> = {
    key,
    component: extensionForm(fieldId),
    schema: z.object({ [fieldId]: z.string().min(1) }),
    onAccept: (payload, member) => {
      recorded.accepted.push({ payload, member });
    },
    onCleanup: (_payload, context) => {
      recorded.cleaned.push(context);
    },
  };
  return { recorded, options };
}

async function hostLayout(slug: string) {
  const handler = GetPageLayoutBySlug(slug);
  if (!handler) throw new Error(`No layout handler registered for ${slug}`);
  return handler({
    user: admin,
    memberModel: GetModel(TenantMemberModel, TENANT),
    roleModel: GetModel(RoleModel, TENANT),
    tenantId: TENANT,
  });
}

async function hostLayoutFields(
  slug: string,
): Promise<FormFieldOrGroupSerialized[]> {
  const layout = await hostLayout(slug);
  const options = layout.components.invite
    .options as unknown as FormPropsSerialized;
  return options.fields;
}

async function registerHostPage(
  slug: string,
  hostForm: () => FormBuilder = inviteHostForm,
): Promise<void> {
  class Host extends PageController(slug, {
    displayName: `Invite host ${slug}`,
    category: pagesCategory,
    publicAccess: true,
  }) {
    static invite = hostForm();
  }
  RegisterPage()(Host);
  await settle();
}

function fieldIds(fields: FormFieldOrGroupSerialized[]): string[] {
  return fields.flatMap((item) =>
    isFieldGroupSerialized(item)
      ? item.fields.map((field) => field.id)
      : [item.id],
  );
}

function topLevelIds(fields: FormFieldOrGroupSerialized[]): string[] {
  return fields.map((item) => item.id);
}

async function registrationHostCommand(userId: string): Promise<void> {
  await ExecuteHooks(Hook.MEMBER_BEING_ADDED, {
    tenantId: "ie-registration-command",
    userId,
    isTenantOwner: false,
  });
}

describe("[unit] interfaces/dms/invite-extensions — RegisterInviteExtension", () => {
  before(async () => {
    ImplementInterface(
      { sendAdminInviteEmail },
      {
        sendAdminInviteEmail: async () => undefined,
      },
    );
    admin = await createUser();
  });

  afterEach(async () => {
    for (const dispose of disposers.splice(0)) dispose();
    await registrationHostCommand("dispose");
  });

  describe("injection into the invite modal", () => {
    it("merges the contributed fields into the form, namespaced by key", async () => {
      register(recordingExtension("billing", "costCenter").options);
      await registerHostPage("ie-merge");

      expect(fieldIds(await hostLayoutFields("/ie-merge"))).to.deep.equal([
        "emails",
        "roles",
        "billing__costCenter",
      ]);
    });

    it("reaches a page that registered before the extension did", async () => {
      await registerHostPage("ie-late");
      expect(fieldIds(await hostLayoutFields("/ie-late"))).to.deep.equal([
        "emails",
        "roles",
      ]);

      register(recordingExtension("late", "answer").options);

      expect(fieldIds(await hostLayoutFields("/ie-late"))).to.deep.equal([
        "emails",
        "roles",
        "late__answer",
      ]);
    });

    it("places a block before the field it anchors on", async () => {
      const { options } = recordingExtension("onboarding", "track");
      register({
        ...options,
        placement: { side: "before", anchorField: "roles" },
      });
      await registerHostPage("ie-anchored");

      expect(topLevelIds(await hostLayoutFields("/ie-anchored"))).to.deep.equal(
        ["emails", "onboarding", "roles"],
      );
    });

    it("orders competing blocks by order then key, never by registration order", async () => {
      const zulu = recordingExtension("zulu", "a");
      const alpha = recordingExtension("alpha", "b");
      const first = recordingExtension("first", "c");
      register(zulu.options);
      register(alpha.options);
      register({ ...first.options, placement: { order: -1 } });
      await registerHostPage("ie-order");

      expect(topLevelIds(await hostLayoutFields("/ie-order"))).to.deep.equal([
        "emails",
        "roles",
        "first",
        "alpha",
        "zulu",
      ]);
    });

    it("carries the contributed fields into the form's validation schema", async () => {
      register(recordingExtension("billing", "costCenter").options);
      await registerHostPage("ie-schema");

      const layout = await hostLayout("/ie-schema");
      const schema = (
        layout.components.invite.options as unknown as FormPropsSerialized
      ).schema as { properties: Record<string, unknown>; required: string[] };

      expect(Object.keys(schema.properties)).to.include("billing__costCenter");
      expect(schema.required).to.include("billing__costCenter");
    });

    it("takes the fields back out when the extension goes away", async () => {
      const dispose = register(recordingExtension("billing").options);
      await registerHostPage("ie-teardown");
      expect(fieldIds(await hostLayoutFields("/ie-teardown"))).to.have.length(
        3,
      );

      dispose();

      expect(fieldIds(await hostLayoutFields("/ie-teardown"))).to.deep.equal([
        "emails",
        "roles",
      ]);
    });
  });

  describe("edit form of a pending invitation", () => {
    function contributedFields(fields: FormFieldOrGroupSerialized[]) {
      return fields
        .filter(isFieldGroupSerialized)
        .flatMap((group) => group.fields);
    }

    it("merges the contributed fields, editable unless the extension opts out", async () => {
      register(recordingExtension("billing", "costCenter").options);
      register({
        ...recordingExtension("frozen", "value").options,
        editable: false,
      });
      await registerHostPage("ie-edit", inviteEditHostForm);

      const fields = contributedFields(await hostLayoutFields("/ie-edit"));

      expect(
        fields.map((field) => [field.id, field.disabled === true]),
      ).to.deep.equal([
        ["billing__costCenter", false],
        ["frozen__value", true],
      ]);
    });

    it("anchors a block placed by the roles field on the stored roles column", async () => {
      register({
        ...recordingExtension("scope", "access").options,
        placement: { side: "after", anchorField: "roles" },
      });
      await registerHostPage("ie-edit-anchor", inviteEditHostForm);

      expect(
        topLevelIds(await hostLayoutFields("/ie-edit-anchor")),
      ).to.deep.equal(["email", "firstname", "roles_ids", "scope"]);
    });

    it("anchors a block placed after the addresses on the stored email column", async () => {
      register({
        ...recordingExtension("team", "name").options,
        placement: { side: "after", anchorField: "emails" },
      });
      await registerHostPage("ie-edit-addresses", inviteEditHostForm);
      await registerHostPage("ie-invite-addresses");
      const warnings = captureWarnings();
      try {
        expect(
          topLevelIds(await hostLayoutFields("/ie-edit-addresses")),
        ).to.deep.equal(["email", "team", "firstname", "roles_ids"]);
        expect(
          topLevelIds(await hostLayoutFields("/ie-invite-addresses")),
        ).to.deep.equal(["emails", "team", "roles"]);
      } finally {
        warnings.restore();
      }
      expect(warnings.messages).to.deep.equal([]);
    });

    it("leaves the invite modal's own blocks editable", async () => {
      register({
        ...recordingExtension("frozen", "value").options,
        editable: false,
      });
      await registerHostPage("ie-edit-modal");

      const fields = contributedFields(
        await hostLayoutFields("/ie-edit-modal"),
      );

      expect(fields.map((field) => field.disabled === true)).to.deep.equal([
        false,
      ]);
    });

    it("reaches the edit form the invitations table opens in a modal", async () => {
      register(recordingExtension("billing", "costCenter").options);

      const layout = await hostLayout("/settings/workspace/invites");
      // SAFETY: The registered invitations page builds this component with TableView.
      const table = layout.components.table
        .options as TableViewOptionsSerialized;
      const editForm = table.formComponents.edit?.options;
      ok(editForm);

      expect(table.formContainer?.type).to.equal("modal");
      expect(table.formPages).to.equal(undefined);
      expect(fieldIds(editForm.fields)).to.include("billing__costCenter");
    });

    it("prefills the fields with the stored payloads, under their prefixed ids", async () => {
      register(recordingExtension("billing", "costCenter").options);

      const id = await pendingInvite({
        billing: { costCenter: "CC-42" },
        gone: { value: "orphan" },
      });
      const row = await readPendingInvite(id, admin);
      expect(row).to.have.property("billing__costCenter", "CC-42");
      expect(row).not.to.have.property("gone__value");
    });

    it("prefills nothing for an invitation without payloads", async () => {
      register(recordingExtension("billing", "costCenter").options);

      const id = await pendingInvite(null);
      const row = await readPendingInvite(id, admin);
      expect(row).to.have.property("_id", id);
      expect(
        Object.keys(row).filter((key) => key.includes("__")),
      ).to.deep.equal([]);
    });
  });

  describe("payload edited on a pending invitation", () => {
    it("tells an extension its payload changed, parsed, with the previous one", async () => {
      const updates: unknown[][] = [];
      register({
        key: "capacity",
        component: extensionForm("seats"),
        schema: z.object({ seats: z.string().transform(Number) }),
        onAccept: () => undefined,
        onUpdate: (payload, previous, updateContext) => {
          updates.push([payload, previous, updateContext]);
        },
      });

      const id = await pendingInvite({ capacity: { seats: "3" } });
      await editPendingInvite(id, { capacity__seats: "5" }, admin);

      const stored = await GetModel(UserInviteModel, TENANT).get(id);
      expect(updates).to.deep.equal([
        [
          { seats: 5 },
          { seats: 3 },
          {
            tenantId: TENANT,
            email: stored?.email,
            inviteId: id,
          },
        ],
      ]);
      expect(stored?.extensions).to.deep.equal({ capacity: { seats: "5" } });
    });

    it("stays quiet when the payload did not change", async () => {
      let calls = 0;
      register({
        ...recordingExtension("billing", "costCenter").options,
        onUpdate: () => {
          calls += 1;
        },
      });

      const id = await pendingInvite({ billing: { costCenter: "CC-42" } });
      await editPendingInvite(id, { billing__costCenter: "CC-43" }, admin);
      expect(calls).to.equal(1);
      calls = 0;
      await editPendingInvite(id, { billing__costCenter: "CC-43" }, admin);

      expect(calls).to.equal(0);
    });

    it("keeps notifying after a handler throws", async () => {
      const seen: string[] = [];
      register({
        ...recordingExtension("failing", "value").options,
        onUpdate: () => {
          throw new Error("update boom");
        },
      });
      register({
        ...recordingExtension("billing", "costCenter").options,
        onUpdate: (payload) => {
          seen.push(payload.costCenter);
        },
      });

      const id = await pendingInvite(null);
      await editPendingInvite(
        id,
        { failing__value: "x", billing__costCenter: "CC-43" },
        admin,
      );

      expect(seen).to.deep.equal(["CC-43"]);
    });
  });

  describe("payload collected at submit", () => {
    it("splits each extension's slice out of the submitted body", async () => {
      register(recordingExtension("billing", "costCenter").options);
      register(recordingExtension("onboarding", "track").options);

      const response = await submitInvite(
        {
          billing__costCenter: "CC-42",
          onboarding__track: "sales",
        },
        admin,
      );
      const stored = await GetModel(UserInviteModel, TENANT).getByEmail(
        response.results[0].email,
      );
      expect(stored?.extensions).to.deep.equal({
        billing: { costCenter: "CC-42" },
        onboarding: { track: "sales" },
      });
    });

    it("refuses a body that does not satisfy an extension's schema", async () => {
      register(recordingExtension("billing", "costCenter").options);

      const email = `${randomUUID()}@acme.dev`;
      await rejects(submitInvite({ emails: [email] }, admin));
      expect(
        await GetModel(UserInviteModel, TENANT).getByEmail(email),
      ).to.equal(undefined);
    });

    it("drops keys of an extension that is no longer registered", async () => {
      const dispose = register(recordingExtension("gone", "value").options);
      dispose();

      const response = await submitInvite({ gone__value: "orphan" }, admin);
      const stored = await GetModel(UserInviteModel, TENANT).getByEmail(
        response.results[0].email,
      );
      expect(stored?.extensions).to.deep.equal({});
    });
  });

  describe("delivery on direct add", () => {
    it("hands each extension its own payload and the new member", async () => {
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      const member = await directAdd({ billing: { costCenter: "CC-42" } });

      expect(billing.recorded.accepted).to.deep.equal([
        { payload: { costCenter: "CC-42" }, member },
      ]);
    });

    it("skips a payload the schema no longer accepts", async () => {
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await directAdd({ billing: { costCenter: 42 } });

      expect(billing.recorded.accepted).to.have.length(0);
    });

    it("hands a transforming schema's output to the contributor", async () => {
      const seen: Array<{ seats: number }> = [];
      register({
        key: "capacity",
        component: extensionForm("seats"),
        schema: z.object({ seats: z.string().transform(Number) }),
        onAccept: (payload) => {
          seen.push(payload);
        },
      });

      const user = await createUser();
      await submitInvite(
        {
          emails: [user.email],
          capacity__seats: "3",
        },
        admin,
      );

      expect(seen).to.deep.equal([{ seats: 3 }]);
    });

    it("keeps delivering after a contributor throws", async () => {
      const failing = recordingExtension("failing", "value");
      register({
        ...failing.options,
        onAccept: () => {
          throw new Error("contributor boom");
        },
      });
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await directAdd({
        failing: { value: "x" },
        billing: { costCenter: "CC-42" },
      });

      expect(billing.recorded.accepted).to.have.length(1);
    });
  });

  describe("cleanup", () => {
    async function fireDeleted(
      reason: InviteDeletedReason,
      extensions: Record<string, unknown> | null,
    ): Promise<void> {
      await ExecuteHooks(Hook.INVITE_DELETED, {
        tenantId: TENANT,
        inviteId: "invite-1",
        email: "someone@acme.dev",
        reason,
        extensions,
      });
    }

    it("runs when the invitation is cancelled, with the payload it carried", async () => {
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await fireDeleted("cancelled", { billing: { costCenter: "CC-42" } });

      expect(billing.recorded.cleaned).to.deep.equal([
        {
          reason: "invite-deleted",
          tenantId: TENANT,
          inviteId: "invite-1",
          email: "someone@acme.dev",
        },
      ]);
    });

    it("runs when the invitation is replaced by a different one", async () => {
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await fireDeleted("replaced", { billing: { costCenter: "CC-42" } });

      expect(billing.recorded.cleaned).to.have.length(1);
    });

    it("does not run on acceptance, which also deletes the invitation", async () => {
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await fireDeleted("accepted", { billing: { costCenter: "CC-42" } });

      expect(billing.recorded.cleaned).to.have.length(0);
    });

    it("does not run when the same invitation is resent", async () => {
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await fireDeleted("resent", { billing: { costCenter: "CC-42" } });

      expect(billing.recorded.cleaned).to.have.length(0);
    });

    it("runs once per removed member, skipping extensions without cleanup", async () => {
      register({
        ...recordingExtension("no-cleanup", "value").options,
        onCleanup: undefined,
      });
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await ExecuteHooks(Hook.MEMBER_REMOVED, {
        tenantId: TENANT,
        userIds: ["user-1", "user-2"],
      });

      expect(billing.recorded.cleaned).to.deep.equal([
        { reason: "member-removed", tenantId: TENANT, userId: "user-1" },
        { reason: "member-removed", tenantId: TENANT, userId: "user-2" },
      ]);
    });
  });

  describe("registration", () => {
    it("refuses a key that would collide with the field separator", () => {
      expect(() =>
        register(recordingExtension("bad__key", "value").options),
      ).to.throw(/__/);
    });

    it("lets a re-registration under the same key take over", async () => {
      const first = recordingExtension("billing", "a");
      const disposeFirst = register(first.options);
      await registerHostPage("ie-reload");
      expect(fieldIds(await hostLayoutFields("/ie-reload"))).to.deep.equal([
        "emails",
        "roles",
        "billing__a",
      ]);
      const second = recordingExtension("billing", "b");
      const warnings = captureWarnings();
      try {
        register(second.options);
        disposeFirst();
      } finally {
        warnings.restore();
      }

      expect(warnings.messages).to.deep.equal([]);
      expect(fieldIds(await hostLayoutFields("/ie-reload"))).to.deep.equal([
        "emails",
        "roles",
        "billing__b",
      ]);
    });

    it("warns when a different module claims a key already held", async () => {
      await registrationHostCommand("held");
      await registerHostPage("ie-ownership");
      expect(fieldIds(await hostLayoutFields("/ie-ownership"))).to.deep.equal([
        "emails",
        "roles",
        "billing__held",
      ]);
      const warnings = captureWarnings();
      try {
        register(recordingExtension("billing", "claimed").options);
      } finally {
        warnings.restore();
        await registrationHostCommand("dispose");
      }

      expect(warnings.messages).to.have.length(1);
      expect(warnings.messages[0]).to.include('"billing"');
      expect(fieldIds(await hostLayoutFields("/ie-ownership"))).to.deep.equal([
        "emails",
        "roles",
        "billing__claimed",
      ]);
    });

    it("keeps registrations by the same real module quiet", async () => {
      await registrationHostCommand("first");
      const warnings = captureWarnings();
      try {
        await registrationHostCommand("second");
        await registerHostPage("ie-owned");
        expect(fieldIds(await hostLayoutFields("/ie-owned"))).to.deep.equal([
          "emails",
          "roles",
          "billing__second",
        ]);
      } finally {
        warnings.restore();
        await registrationHostCommand("dispose");
      }

      expect(warnings.messages).to.deep.equal([]);
      expect(fieldIds(await hostLayoutFields("/ie-owned"))).to.deep.equal([
        "emails",
        "roles",
      ]);
    });

    it("delivers to the registration that currently owns the key", async () => {
      const first = recordingExtension("billing", "a");
      const disposeFirst = register(first.options);
      const second = recordingExtension("billing", "b");
      register(second.options);
      disposeFirst();

      await directAdd({ billing: { b: "value" } });

      expect(first.recorded.accepted).to.have.length(0);
      expect(second.recorded.accepted).to.have.length(1);
    });
  });
});
