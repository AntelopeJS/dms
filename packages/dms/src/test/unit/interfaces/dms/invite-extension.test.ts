import { ok } from "node:assert/strict";
import { ImplementInterface } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { ExecuteHooks, Hook } from "@antelopejs/interface-dms/hooks";
import { sendAdminInviteEmail } from "@antelopejs/interface-dms/auth";
import {
  GetPageLayoutBySlug,
  PageController,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import {
  type FormBuilder,
  type FormFieldOrGroupSerialized,
  isFieldGroupSerialized,
} from "@antelopejs/interface-dms/base/form";
import { captureWarnings } from "../../../helpers/logging";
import {
  createUser,
  directAdd,
  pendingInvite,
  readPendingInvite,
  TENANT,
} from "../../../helpers/invite-entry-fixtures";
import {
  fieldIds,
  inviteEditHostForm,
  inviteHostForm,
  recordingExtension,
  topLevelIds,
} from "../../../helpers/invite-extensions";
import { registerInviteExtensionPayloadCases } from "./invite-extension-payload.cases";
import {
  admin,
  disposers,
  register,
  setAdmin,
} from "./invite-extension.helpers";
import {
  formOptionsOf,
  tableViewOptionsOf,
} from "../../../helpers/serialized-options";

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
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

async function hostLayoutFields(slug: string) {
  const layout = await hostLayout(slug);
  return formOptionsOf(layout.components.invite).fields;
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
    setAdmin(await createUser());
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
      const { schema } = formOptionsOf(layout.components.invite);

      expect(schema)
        .to.have.own.property("properties")
        .that.has.own.property("billing__costCenter");
      expect(schema)
        .to.have.own.property("required")
        .that.includes("billing__costCenter");
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
      const table = tableViewOptionsOf(layout.components.table);
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

  registerInviteExtensionPayloadCases();

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
