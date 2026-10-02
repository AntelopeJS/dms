import { HTTPResult } from "@antelopejs/interface-api";
import type { Role } from "@antelopejs/interface-dms/db";
import type {
  Permission,
  PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import { expect } from "chai";
import {
  batchFailure,
  countSuccessfulInvites,
  type InviteEmailResult,
  inviteNotice,
} from "../../../../pages/settings/users/member-invite-batch";
import {
  detectOwnerChange,
  type MemberRemovalImpact,
  memberRemovalConfirm,
} from "../../../../pages/settings/users/member-management";
import {
  buildInviteRoleOptions,
  collectGrantablePermissionIds,
} from "../../../../pages/settings/users/member-role-options";
import {
  INVITE_EMAILS_MAX,
  memberInviteSchema,
  resolveInviteeNameParts,
  uniqueInviteEmails,
} from "../../../../validation/member-invite.schema";

const HTTP_CONFLICT = 409;

const invitePayload = {
  emails: ["ada@test.local", "grace@test.local"],
  roles: ["role-1"],
  language: "en",
  asTenantOwner: false,
};

function registered(
  id: string,
  children: Record<string, PermissionTree> = {},
  overrides: Partial<Permission> = {},
): PermissionTree {
  return { data: { id, title: id, ...overrides }, children };
}

function role(id: string, name: string, permissions: string[]): Role {
  return { _id: id, name, permissions } as Role;
}

const tree: Record<string, PermissionTree> = {
  settings: {
    children: {
      members: registered("settings.members", {
        edit: registered("settings.members.edit"),
      }),
      public: registered(
        "settings.public",
        { read: registered("settings.public.read") },
        { defaultGranted: true },
      ),
    },
  },
  media: registered("media"),
};

function issuePaths(payload: unknown): string[] {
  const result = memberInviteSchema.safeParse(payload);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join("."));
}

describe("[unit] pages/settings/users members page", () => {
  describe("memberInviteSchema", () => {
    it("accepts several addresses and lowercases them", () => {
      const result = memberInviteSchema.safeParse({
        ...invitePayload,
        emails: [" Ada@Test.local ", "grace@test.local"],
      });
      expect(result.success).to.equal(true);
      if (result.success) {
        expect(result.data.emails).to.deep.equal([
          "ada@test.local",
          "grace@test.local",
        ]);
      }
    });

    it("reads a legacy single email as a one-address list", () => {
      const { emails: _emails, ...rest } = invitePayload;
      const result = memberInviteSchema.safeParse({
        ...rest,
        email: "ada@test.local",
      });
      expect(result.success).to.equal(true);
      if (result.success) {
        expect(result.data.emails).to.deep.equal(["ada@test.local"]);
      }
    });

    it("rejects an empty list and an invalid address", () => {
      expect(issuePaths({ ...invitePayload, emails: [] })).to.include("emails");
      expect(
        issuePaths({ ...invitePayload, emails: ["not-an-email"] }),
      ).to.include("emails.0");
    });

    it("rejects more addresses than one request may carry", () => {
      const emails = Array.from(
        { length: INVITE_EMAILS_MAX + 1 },
        (_, index) => `user${index}@test.local`,
      );
      expect(issuePaths({ ...invitePayload, emails })).to.include("emails");
    });

    it("accepts a full name in place of the name parts when skipping validation", () => {
      const result = memberInviteSchema.safeParse({
        ...invitePayload,
        emails: ["ada@test.local"],
        skipEmailValidation: true,
        name: "Ada Lovelace",
      });
      expect(result.success).to.equal(true);
    });

    it("refuses to skip validation for several addresses", () => {
      expect(
        issuePaths({
          ...invitePayload,
          skipEmailValidation: true,
          name: "Ada Lovelace",
        }),
      ).to.deep.equal(["emails"]);
    });
  });

  describe("resolveInviteeNameParts", () => {
    it("splits a full name into its first word and the rest", () => {
      expect(
        resolveInviteeNameParts({ name: "Ada King Lovelace" }),
      ).to.deep.equal({ firstname: "Ada", lastname: "King Lovelace" });
    });

    it("keeps a single word as the first name", () => {
      expect(resolveInviteeNameParts({ name: "Ada" })).to.deep.equal({
        firstname: "Ada",
        lastname: undefined,
      });
    });

    it("prefers explicit name parts", () => {
      expect(
        resolveInviteeNameParts({
          name: "Someone Else",
          firstname: "Ada",
          lastname: "Lovelace",
        }),
      ).to.deep.equal({ firstname: "Ada", lastname: "Lovelace" });
    });
  });

  it("keeps each address once, in the order typed", () => {
    expect(
      uniqueInviteEmails(["b@test.local", "a@test.local", "b@test.local"]),
    ).to.deep.equal(["b@test.local", "a@test.local"]);
  });

  describe("role options", () => {
    it("collects the permissions the roles editor lists", () => {
      expect([...collectGrantablePermissionIds(tree)].sort()).to.deep.equal([
        "media",
        "settings.members",
        "settings.members.edit",
      ]);
    });

    it("leaves out a category with nothing left to grant, as the editor does", () => {
      expect(
        [
          ...collectGrantablePermissionIds(
            {
              ...tree,
              pages: registered("pages", {
                login: registered("pages.login", {}, { defaultGranted: true }),
              }),
            },
            new Set(["pages"]),
          ),
        ].sort(),
      ).to.deep.equal(["media", "settings.members", "settings.members.edit"]);
    });

    it("counts only grantable permissions of each role, sorted by name", () => {
      const options = buildInviteRoleOptions(
        [
          role("r2", "Support", ["settings.public.read", "media", "media"]),
          role("r1", "Admin", ["settings.members", "gone.page"]),
        ],
        tree,
      );
      expect(options.totalPermissions).to.equal(3);
      expect(options.roles).to.deep.equal([
        { _id: "r1", name: "Admin", permissionIds: ["settings.members"] },
        { _id: "r2", name: "Support", permissionIds: ["media"] },
      ]);
    });
  });

  describe("detectOwnerChange", () => {
    it("reports promotions and demotions only", () => {
      expect(detectOwnerChange({ isTenantOwner: false }, true)).to.equal(
        "promote",
      );
      expect(detectOwnerChange({ isTenantOwner: true }, false)).to.equal(
        "demote",
      );
      expect(detectOwnerChange({ isTenantOwner: true }, true)).to.equal(null);
      expect(detectOwnerChange({ isTenantOwner: true }, undefined)).to.equal(
        null,
      );
    });
  });

  describe("invite batch results", () => {
    const results: InviteEmailResult[] = [
      { email: "a@test.local", outcome: "invited" },
      { email: "b@test.local", outcome: "added" },
      { email: "c@test.local", outcome: "already_member" },
      { email: "d@test.local", outcome: "failed", message: "$seat.full" },
    ];

    it("counts invitations and direct additions as successes", () => {
      expect(countSuccessfulInvites(results)).to.equal(2);
    });

    it("answers with the first refusal when nothing went through", () => {
      const failure = batchFailure(results.slice(2));
      expect(failure).to.be.instanceOf(HTTPResult);
      expect(failure.getStatus()).to.equal(HTTP_CONFLICT);
      expect(failure.getBody()).to.equal("$seat.full");
    });

    it("answers already-a-member when every address was one", () => {
      const failure = batchFailure([results[2]]);
      expect(failure.getBody()).to.equal(
        "$page.settings.members.invite.already_member",
      );
    });
  });

  describe("invite notice", () => {
    it("says nothing when every address went through", () => {
      expect(
        inviteNotice([
          { email: "a@test.local", outcome: "invited" },
          { email: "b@test.local", outcome: "added" },
        ]),
      ).to.equal(undefined);
    });

    it("warns with the sent and skipped counts otherwise", () => {
      expect(
        inviteNotice([
          { email: "a@test.local", outcome: "invited" },
          { email: "b@test.local", outcome: "already_member" },
          { email: "c@test.local", outcome: "failed" },
        ]),
      ).to.deep.equal({
        color: "warning",
        title: "$page.settings.members.invite.partial_title",
        description: "$page.settings.members.invite.partial_description",
        params: { sent: 1, count: 2 },
      });
    });
  });

  describe("removal confirmation", () => {
    const impact: MemberRemovalImpact = {
      memberId: "m-1",
      name: "Ada",
      email: "ada@test.local",
      roles: ["Admin", "Editor"],
      isTenantOwner: false,
      isLastOwner: false,
      isSelf: false,
    };

    it("lists the roles lost and the records kept", () => {
      const confirm = memberRemovalConfirm(impact);
      expect(confirm.title).to.equal(
        "$page.settings.members.remove.title_other",
      );
      expect(confirm.params).to.deep.equal({ name: "Ada" });
      expect(confirm.confirmColor).to.equal("error");
      expect(confirm.blocked).to.equal(undefined);
      expect(confirm.impact?.[0]?.count).to.equal("Admin, Editor");
    });

    it("speaks to the member removing themself, and names an owner's role", () => {
      const confirm = memberRemovalConfirm({
        ...impact,
        isSelf: true,
        isTenantOwner: true,
      });
      expect(confirm.title).to.equal(
        "$page.settings.members.remove.title_self",
      );
      expect(confirm.impact?.[0]?.count).to.equal(
        "$page.settings.members.owner",
      );
    });

    it("only explains why the last owner cannot be removed", () => {
      const confirm = memberRemovalConfirm({
        ...impact,
        isTenantOwner: true,
        isLastOwner: true,
      });
      expect(confirm.blocked).to.equal(true);
      expect(confirm.title).to.equal(
        "$page.settings.members.remove.last_owner_other_title",
      );
      expect(confirm.impact).to.equal(undefined);
    });
  });
});
