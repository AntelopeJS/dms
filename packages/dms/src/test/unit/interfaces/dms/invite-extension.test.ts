import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { z } from "zod";
import { registerInviteExtensionCleanup } from "../../../../hooks/invite-extensions";
import * as inviteExtensionsImpl from "../../../../implementations/dms/invite-extensions";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import type {
  RoleModel,
  TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import {
  ExecuteHooks,
  Hook,
  type InviteDeletedReason,
} from "@antelopejs/interface-dms/hooks";
import * as inviteExtensionsInterface from "@antelopejs/interface-dms/invite-extensions";
import {
  INVITE_EDIT_FORM_SLOT_ID,
  INVITE_FORM_SLOT_ID,
  type InviteCleanupContext,
  type InviteExtensionContext,
  type InviteExtensionOptions,
  internal,
  RegisterInviteExtension,
} from "@antelopejs/interface-dms/invite-extensions";
import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  GetPageLayoutBySlug,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  type FormBuilder,
  type FormFieldOrGroupSerialized,
  type FormPropsSerialized,
  isFieldGroupSerialized,
} from "@antelopejs/interface-dms/base/form";

const TENANT = "ie-tenant";
const MEMBER = { _id: "member-1", userId: "user-1" } as TenantMember;

// Registration and extension syncing are promise-chained but do no I/O: one
// macrotask hop is enough for every pending microtask to settle.
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

/** Stands in for the DMS invite modal: a form that opens the invite slot. */
function inviteHostForm(): FormBuilder {
  return Form({
    fields: [textField("email", true), textField("roles")],
    slotId: INVITE_FORM_SLOT_ID,
  });
}

/**
 * Stands in for the edit form of a pending invitation, which lists the
 * invitation's own columns — the roles field under its stored name.
 */
function inviteEditHostForm(): FormBuilder {
  return Form({
    fields: [textField("firstname"), textField("roles_ids")],
    slotId: INVITE_EDIT_FORM_SLOT_ID,
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

async function hostLayoutFields(
  slug: string,
): Promise<FormFieldOrGroupSerialized[]> {
  const handler = GetPageLayoutBySlug(slug);
  expect(handler, `no layout handler registered for ${slug}`).to.not.equal(
    undefined,
  );
  const layout = await (handler as NonNullable<typeof handler>)(
    undefined as unknown as User,
    {} as TenantMemberModel,
    {} as RoleModel,
    TENANT,
  );
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

describe("[unit] interfaces/dms/invite-extensions — RegisterInviteExtension", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(pageInterface, pageImpl);
    ImplementInterface(inviteExtensionsInterface, inviteExtensionsImpl);
    registerInviteExtensionCleanup();
  });

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
  });

  describe("injection into the invite modal", () => {
    it("merges the contributed fields into the form, namespaced by key", async () => {
      register(recordingExtension("billing", "costCenter").options);
      await registerHostPage("ie-merge");

      expect(fieldIds(await hostLayoutFields("/ie-merge"))).to.deep.equal([
        "email",
        "roles",
        "billing__costCenter",
      ]);
    });

    it("reaches a page that registered before the extension did", async () => {
      await registerHostPage("ie-late");
      expect(fieldIds(await hostLayoutFields("/ie-late"))).to.deep.equal([
        "email",
        "roles",
      ]);

      register(recordingExtension("late", "answer").options);

      expect(fieldIds(await hostLayoutFields("/ie-late"))).to.deep.equal([
        "email",
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
        ["email", "onboarding", "roles"],
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
        "email",
        "roles",
        "first",
        "alpha",
        "zulu",
      ]);
    });

    it("carries the contributed fields into the form's validation schema", async () => {
      register(recordingExtension("billing", "costCenter").options);
      await registerHostPage("ie-schema");

      const handler = GetPageLayoutBySlug("/ie-schema");
      const layout = await (handler as NonNullable<typeof handler>)(
        undefined as unknown as User,
        {} as TenantMemberModel,
        {} as RoleModel,
        TENANT,
      );
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
        "email",
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
      ).to.deep.equal(["firstname", "roles_ids", "scope"]);
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

    it("prefills the fields with the stored payloads, under their prefixed ids", () => {
      register(recordingExtension("billing", "costCenter").options);

      expect(
        internal.ReadInviteExtensionFields({
          billing: { costCenter: "CC-42" },
          gone: { value: "orphan" },
        }),
      ).to.deep.equal({ billing__costCenter: "CC-42" });
    });

    it("prefills nothing for an invitation without payloads", () => {
      register(recordingExtension("billing", "costCenter").options);

      expect(internal.ReadInviteExtensionFields(null)).to.deep.equal({});
    });
  });

  describe("payload edited on a pending invitation", () => {
    const context: InviteExtensionContext = {
      tenantId: TENANT,
      email: "someone@acme.dev",
      inviteId: "invite-1",
    };

    it("takes the slices the submission carries", () => {
      register(recordingExtension("billing", "costCenter").options);
      register(recordingExtension("onboarding", "track").options);

      expect(
        internal.CollectInviteExtensionEdits({
          firstname: "Ada",
          billing__costCenter: "CC-43",
        }),
      ).to.deep.equal({ billing: { costCenter: "CC-43" } });
    });

    it("refuses an edited slice its schema rejects", () => {
      register(recordingExtension("billing", "costCenter").options);

      expect(() =>
        internal.CollectInviteExtensionEdits({ billing__costCenter: "" }),
      ).to.throw();
    });

    it("ignores the slice of an extension that is not editable", () => {
      register({
        ...recordingExtension("frozen", "value").options,
        editable: false,
      });

      expect(
        internal.CollectInviteExtensionEdits({ frozen__value: "changed" }),
      ).to.deep.equal({});
    });

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

      await internal.NotifyInviteExtensionUpdates(
        { capacity: { seats: "3" } },
        { capacity: { seats: "5" } },
        context,
      );

      expect(updates).to.deep.equal([[{ seats: 5 }, { seats: 3 }, context]]);
    });

    it("stays quiet when the payload did not change", async () => {
      let calls = 0;
      register({
        ...recordingExtension("billing", "costCenter").options,
        onUpdate: () => {
          calls += 1;
        },
      });

      await internal.NotifyInviteExtensionUpdates(
        { billing: { costCenter: "CC-42" } },
        { billing: { costCenter: "CC-42" } },
        context,
      );

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

      await internal.NotifyInviteExtensionUpdates(
        null,
        { failing: { value: "x" }, billing: { costCenter: "CC-43" } },
        context,
      );

      expect(seen).to.deep.equal(["CC-43"]);
    });
  });

  describe("payload collected at submit", () => {
    it("splits each extension's slice out of the submitted body", () => {
      register(recordingExtension("billing", "costCenter").options);
      register(recordingExtension("onboarding", "track").options);

      expect(
        internal.CollectInviteExtensionPayloads({
          email: "someone@acme.dev",
          billing__costCenter: "CC-42",
          onboarding__track: "sales",
        }),
      ).to.deep.equal({
        billing: { costCenter: "CC-42" },
        onboarding: { track: "sales" },
      });
    });

    it("refuses a body that does not satisfy an extension's schema", () => {
      register(recordingExtension("billing", "costCenter").options);

      expect(() =>
        internal.CollectInviteExtensionPayloads({ email: "someone@acme.dev" }),
      ).to.throw();
    });

    it("drops keys of an extension that is no longer registered", () => {
      const dispose = register(recordingExtension("gone", "value").options);
      dispose();
      disposers.length = 0;

      expect(
        internal.CollectInviteExtensionPayloads({ gone__value: "orphan" }),
      ).to.deep.equal({});
    });
  });

  describe("delivery at acceptance", () => {
    const context: InviteExtensionContext = {
      tenantId: TENANT,
      email: "someone@acme.dev",
      inviteId: "invite-1",
    };

    it("hands each extension its own payload and the new member", async () => {
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await internal.DeliverInviteExtensions(
        { billing: { costCenter: "CC-42" } },
        MEMBER,
        context,
      );

      expect(billing.recorded.accepted).to.deep.equal([
        { payload: { costCenter: "CC-42" }, member: MEMBER },
      ]);
    });

    it("skips a payload the schema no longer accepts", async () => {
      const billing = recordingExtension("billing", "costCenter");
      register(billing.options);

      await internal.DeliverInviteExtensions(
        { billing: { costCenter: 42 } },
        MEMBER,
        context,
      );

      expect(billing.recorded.accepted).to.have.length(0);
    });

    // The stored payload is the submission, not the schema's output: a schema
    // that transforms produces something the same schema would reject on the
    // way back in, and delivery would silently skip it.
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

      const stored = internal.CollectInviteExtensionPayloads({
        capacity__seats: "3",
      });
      await internal.DeliverInviteExtensions(stored, MEMBER, context);

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

      await internal.DeliverInviteExtensions(
        { failing: { value: "x" }, billing: { costCenter: "CC-42" } },
        MEMBER,
        context,
      );

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

    it("runs once per removed member, keyed on the user", async () => {
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

    it("leaves an extension that declared no cleanup handler alone", async () => {
      const { options } = recordingExtension("billing", "costCenter");
      register({ ...options, onCleanup: undefined });

      await internal.CleanupInviteExtensions(null, {
        reason: "member-removed",
        tenantId: TENANT,
        userId: "user-1",
      });
    });
  });

  describe("registration", () => {
    it("refuses a key that would collide with the field separator", () => {
      expect(() =>
        register(recordingExtension("bad__key", "value").options),
      ).to.throw(/__/);
    });

    // A hot reload registers the replacement before the old one unregisters,
    // so reclaiming a key has to be the replacement taking over — and the
    // departing registration's unregister must not then take it back down.
    it("lets a re-registration under the same key take over", async () => {
      const first = recordingExtension("billing", "a");
      const disposeFirst = register(first.options);
      const second = recordingExtension("billing", "b");
      register(second.options);
      disposeFirst();
      await registerHostPage("ie-reload");

      expect(fieldIds(await hostLayoutFields("/ie-reload"))).to.deep.equal([
        "email",
        "roles",
        "billing__b",
      ]);
    });

    it("delivers to the registration that currently owns the key", async () => {
      const first = recordingExtension("billing", "a");
      const disposeFirst = register(first.options);
      const second = recordingExtension("billing", "b");
      register(second.options);
      disposeFirst();

      await internal.DeliverInviteExtensions(
        { billing: { b: "value" } },
        MEMBER,
        {
          tenantId: TENANT,
          email: "someone@acme.dev",
        },
      );

      expect(first.recorded.accepted).to.have.length(0);
      expect(second.recorded.accepted).to.have.length(1);
    });
  });
});
