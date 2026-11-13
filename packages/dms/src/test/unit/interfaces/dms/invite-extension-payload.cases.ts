import { randomUUID } from "node:crypto";
import { rejects } from "node:assert/strict";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { z } from "zod";
import { UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  ExecuteHooks,
  Hook,
  type InviteDeletedHookPayload,
  type InviteDeletedReason,
} from "@antelopejs/interface-dms/hooks";
import {
  createUser,
  directAdd,
  editPendingInvite,
  pendingInvite,
  submitInvite,
  TENANT,
} from "../../../helpers/invite-entry-fixtures";
import {
  extensionForm,
  recordingExtension,
} from "../../../helpers/invite-extensions";
import { httpRejectionOf } from "../../../helpers/http-rejection";
import { captureErrors } from "../../../helpers/logging";
import { admin, register } from "./invite-extension.helpers";

const HTTP_BAD_REQUEST = 400;

function registerPayloadEditCases(): void {
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
}

function registerPayloadSubmitCases(): void {
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

    it("reports a refused slice on the prefixed field id the browser submitted", async () => {
      register(recordingExtension("billing", "costCenter").options);

      const error = await httpRejectionOf(
        submitInvite({ billing__costCenter: "" }, admin),
      );
      expect(error.getStatus()).to.equal(HTTP_BAD_REQUEST);
      const body = z
        .object({
          issues: z.array(z.object({ path: z.array(z.string()) })),
        })
        .parse(JSON.parse(error.getBody()));
      expect(body.issues.map(({ path }) => path)).to.deep.equal([
        ["billing__costCenter"],
      ]);
    });

    it("reports the error text of a schema that fails without a list of issues", async () => {
      register({
        key: "flaky",
        component: extensionForm("note"),
        schema: z.unknown().transform((): never => {
          throw Object.assign(new Error("flaky schema"), { issues: [null] });
        }),
        onAccept: () => undefined,
      });

      const error = await httpRejectionOf(
        submitInvite({ flaky__note: "x" }, admin),
      );
      expect(error.getStatus()).to.equal(HTTP_BAD_REQUEST);
      expect(error.getBody()).to.contain("flaky schema");
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
}

function registerDirectAddCases(): void {
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
}

function registerPrototypeKeyCases(): void {
  describe("an extension keyed like an Object.prototype member", () => {
    const seen: unknown[] = [];

    function registerConstructorExtension(): void {
      register({
        key: "constructor",
        component: extensionForm("note"),
        schema: z.unknown(),
        onAccept: (payload) => {
          seen.push(payload);
        },
        onCleanup: (payload) => {
          seen.push(payload);
        },
        onUpdate: (payload) => {
          seen.push(payload);
        },
      });
    }

    beforeEach(() => {
      seen.length = 0;
    });

    it("is handed nothing on delivery when the invitation carries no payload under its key", async () => {
      registerConstructorExtension();

      await directAdd({ billing: { costCenter: "CC-42" } });

      expect(seen).to.deep.equal([]);
    });

    it("is cleaned up with no payload when the invitation carries none under its key", async () => {
      registerConstructorExtension();

      await ExecuteHooks(Hook.INVITE_DELETED, {
        tenantId: TENANT,
        inviteId: "invite-1",
        email: "someone@acme.dev",
        reason: "cancelled",
        extensions: { billing: { costCenter: "CC-42" } },
      });

      expect(seen).to.deep.equal([undefined]);
    });

    it("is not told of an edit that carried nothing under its key", async () => {
      registerConstructorExtension();
      register(recordingExtension("billing", "costCenter").options);
      const errors = captureErrors();

      try {
        const id = await pendingInvite(null);
        await editPendingInvite(id, { billing__costCenter: "CC-43" }, admin);
      } finally {
        errors.restore();
      }

      expect(seen).to.deep.equal([]);
      expect(errors.messages).to.deep.equal([]);
    });
  });
}

function registerPayloadTypingAndCleanupCases(): void {
  describe("payload typing", () => {
    it("stores a payload built from read-only arrays", async () => {
      const access: readonly string[] = ["prj-1", "prj-2"];

      const id = await pendingInvite({ scope: { access } });

      const stored = await GetModel(UserInviteModel, TENANT).get(id);
      expect(stored?.extensions).to.deep.equal({
        scope: { access: ["prj-1", "prj-2"] },
      });
    });
  });

  describe("cleanup", () => {
    async function fireDeleted(
      reason: InviteDeletedReason,
      extensions: InviteDeletedHookPayload["extensions"],
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
}

export function registerInviteExtensionPayloadCases(): void {
  registerPayloadEditCases();
  registerPayloadSubmitCases();
  registerDirectAddCases();
  registerPrototypeKeyCases();
  registerPayloadTypingAndCleanupCases();
}
