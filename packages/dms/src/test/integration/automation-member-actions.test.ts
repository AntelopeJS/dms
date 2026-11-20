import { HTTPResult } from "@antelopejs/interface-api";
import { Hook } from "@antelopejs/interface-dms/hooks";
import { closeTenantLifecycleAdmission } from "@antelopejs/interface-dms/tenant-lifecycle";
import { expect } from "chai";
import { SET_MEMBER_ROLES_ACTION_ID } from "../../automation";
import { LOOP_GUARD_LIMIT } from "../../automation/loop-guard";
import { armTrigger, runAction } from "../helpers/automation-nodes";
import {
  HTTP_PAYMENT_REQUIRED,
  type MemberTenants,
  OTHER_TENANT,
  seedMemberTenants,
  stepFailure,
  storedMember,
  TENANT,
  withHook,
} from "../helpers/member-action-fixtures";

type Seeded = () => MemberTenants;

function setRoles(
  input: Record<string, string | string[] | boolean>,
  options: { dryRun?: boolean; procedureId?: string } = {},
) {
  return runAction(
    SET_MEMBER_ROLES_ACTION_ID,
    { tenantId: TENANT, ...input },
    options,
  );
}

function registerModeCases(seeded: Seeded): void {
  it("replaces, adds and removes roles in the given tenant only", async () => {
    const { member, editor, viewer } = seeded();
    expect(await setRoles({ userId: member, roleIds: [editor] })).to.deep.equal(
      {
        changed: true,
        userId: member,
        roleIds: [editor],
        previousRoleIds: [viewer],
        isTenantOwner: false,
        previousIsTenantOwner: false,
      },
    );
    await setRoles({ userId: member, roleIds: [viewer], mode: "add" });
    expect((await storedMember(member))?.roleIds).to.have.members([
      editor,
      viewer,
    ]);
    await setRoles({ userId: member, roleIds: [editor], mode: "remove" });
    expect((await storedMember(member))?.roleIds).to.deep.equal([viewer]);
    expect((await storedMember(member, OTHER_TENANT))?.roleIds).to.deep.equal([
      "other-role",
    ]);
  });

  it("answers changed false for a no-op without calling the vetoes", async () => {
    const { member, viewer } = seeded();
    const announced: string[] = [];
    await withHook(
      Hook.MEMBER_BEING_CHANGED,
      (payload) => {
        announced.push(payload.kind);
        return undefined;
      },
      async () => {
        const output = await setRoles({ userId: member, roleIds: [viewer] });
        expect(output.changed).to.equal(false);
      },
    );
    expect(announced).to.deep.equal([]);
  });

  it("refuses an unknown role, a non-member and an unknown tenant", async () => {
    const { member } = seeded();
    expect(
      await stepFailure(setRoles({ userId: member, roleIds: ["typo-role"] })),
    ).to.contain('unknown role "typo-role"');
    expect(
      await stepFailure(setRoles({ userId: "stranger", roleIds: [] })),
    ).to.contain("is not a member");
    expect(
      await stepFailure(setRoles({ tenantId: "nowhere", userId: member })),
    ).to.contain('unknown tenant "nowhere"');
  });
}

function registerRefusalCases(seeded: Seeded): void {
  it("refuses to demote the last owner, in a real run and a test run", async () => {
    const { owner } = seeded();
    for (const dryRun of [false, true]) {
      expect(
        await stepFailure(
          setRoles({ userId: owner, isTenantOwner: false }, { dryRun }),
        ),
      ).to.contain("last owner");
    }
    expect((await storedMember(owner))?.isTenantOwner).to.equal(true);
  });

  it("lets a MEMBER_BEING_CHANGED veto refuse the write", async () => {
    const { member, editor, viewer } = seeded();
    await withHook(
      Hook.MEMBER_BEING_CHANGED,
      () => {
        throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "no role changes");
      },
      async () => {
        expect(
          await stepFailure(setRoles({ userId: member, roleIds: [editor] })),
        ).to.contain("no role changes");
      },
    );
    expect((await storedMember(member))?.roleIds).to.deep.equal([viewer]);
  });

  it("refuses a closed workspace, in a real run and a test run", async () => {
    const { member, editor, viewer } = seeded();
    await closeTenantLifecycleAdmission(TENANT);
    for (const dryRun of [false, true]) {
      await stepFailure(
        setRoles({ userId: member, roleIds: [editor] }, { dryRun }),
      );
    }
    expect((await storedMember(member))?.roleIds).to.deep.equal([viewer]);
  });

  it("predicts the change in a test run without writing, a veto or an event", async () => {
    const { member, editor, viewer } = seeded();
    const announced: string[] = [];
    const triggered = await armTrigger("dms.member-roles-changed", {
      includeAutomationWrites: true,
    });
    try {
      await withHook(
        Hook.MEMBER_BEING_CHANGED,
        (payload) => {
          announced.push(payload.kind);
          return undefined;
        },
        async () => {
          const output = await setRoles(
            { userId: member, roleIds: [editor] },
            { dryRun: true },
          );
          expect(output).to.deep.include({ changed: true, roleIds: [editor] });
        },
      );
    } finally {
      await triggered.disarm();
    }
    expect(announced).to.deep.equal([]);
    expect(triggered.events).to.deep.equal([]);
    expect((await storedMember(member))?.roleIds).to.deep.equal([viewer]);
  });
}

function registerAutomationWriteCases(seeded: Seeded): void {
  it("fires member-roles-changed only to triggers that include automation writes", async () => {
    const { member, editor } = seeded();
    const ignoring = await armTrigger("dms.member-roles-changed");
    const including = await armTrigger("dms.member-roles-changed", {
      includeAutomationWrites: true,
    });
    try {
      await setRoles(
        { userId: member, roleIds: [editor] },
        { procedureId: "sync-roles" },
      );
    } finally {
      await ignoring.disarm();
      await including.disarm();
    }
    expect(ignoring.events).to.deep.equal([]);
    expect(including.events).to.have.length(1);
    expect(including.events[0]).to.deep.include({
      tenantId: TENANT,
      userId: member,
      origin: "automation",
      originProcedureId: "sync-roles",
      originRunId: "sync-roles-run",
    });
    expect(including.events[0]).to.not.have.property("actorId");
  });

  it("stops a procedure looping on its own writes after the breaker limit", async () => {
    const { member, editor, viewer } = seeded();
    const including = await armTrigger("dms.member-roles-changed", {
      includeAutomationWrites: true,
    });
    try {
      for (let step = 0; step < LOOP_GUARD_LIMIT + 2; step += 1) {
        await setRoles({
          userId: member,
          roleIds: [step % 2 === 0 ? editor : viewer],
        });
      }
    } finally {
      await including.disarm();
    }
    expect(including.events).to.have.length(LOOP_GUARD_LIMIT);
  });
}

describe("[integration] automation action dms.set-member-roles", () => {
  let tenants: MemberTenants;
  const seeded: Seeded = () => tenants;

  beforeEach(async () => {
    tenants = await seedMemberTenants();
  });

  registerModeCases(seeded);
  registerRefusalCases(seeded);
  registerAutomationWriteCases(seeded);
});
