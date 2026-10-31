import { MEMBERS, INVITATIONS, PAGES_API, ON_MEMBERS, createRole, listMembers, listInvites, openInviteDialog, addAddresses, pickTeam, pickRole, invite, signupLink, acceptInvitation, byEmail, REVOKED_LINK, REPLACED_LINK } from "./settings-members/steps.mjs";
import { memberChangeJourneys } from "./settings-members/changes.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

/** Invitations, member management and the sign-up link, each read back through a second view. */
export const journeys = [
  {
    id: "invite-accept-lists-member",
    title: "an invitation accepted through its emailed link creates a member who is listed and can sign in",
    entryPoint: "Invite members dialog, /auth/signup?token=, Members list",
    async run(/** @type {Ctx} */ ctx) {
      const roleName = ctx.unique("Support");
      const roleId = await createRole(ctx, roleName);
      const email = ctx.email("bob");
      const password = ctx.password();
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await invite(admin, email, roleName);
      await ctx.verify("the invitation is sent and listed with its role", [
        admin.visible({ role: "cell", name: email }),
        admin.visible({ role: "cell", name: roleName, exact: true }),
      ]);
      const pending = byEmail(await listInvites(ctx, "list the invitations"), email);
      await ctx.verify("the API holds one pending invitation with the role", [
        ctx.holds("the invitation exists", pending, email),
        ctx.equal("its roles", pending?.roles_ids?.map((role) => role._id), [roleId]),
        ctx.equal("it is not an owner invite", pending?.asTenantOwner, false),
      ]);
      const link = await signupLink(ctx, email);
      const invitee = await acceptInvitation(ctx, link, { name: "Bob Tester", password });
      await ctx.verify("accepting signs the new member in", [
        invitee.visible({ role: "button", name: "Bob Tester" }),
      ]);
      await admin.goto(MEMBERS);
      await ctx.verify("the Members list shows the new member with the role", [
        admin.visible({ role: "cell", name: /Bob Tester/ }),
        admin.visible({ role: "cell", name: roleName, exact: true }),
        admin.shows(/2 members/),
      ]);
      const member = byEmail(await listMembers(ctx, "list the members"), email);
      const left = await listInvites(ctx, "list the invitations again");
      await ctx.verify("the API lists the member and the invitation is consumed", [
        ctx.holds("the member exists", member, email),
        ctx.equal("name", member?.name, "Bob Tester"),
        ctx.equal("roles", member?.roleIds?.map((role) => role._id), [roleId]),
        ctx.equal("not an owner", member?.isTenantOwner, false),
        ctx.equal("no invitation left", byEmail(left, email), undefined),
      ]);
      ctx.addAccount("bob", { email, password });
      const bob = await ctx.tab("bob");
      await bob.signIn("bob");
      const me = await ctx.api("read the member's account", { method: "GET", path: "/api/auth/me", as: "bob" });
      await ctx.verify("the member signs in through the form in a new browser", [
        ctx.status(me, 200),
        ctx.equal("email", me.body?.email, email),
        ctx.equal("owner", me.body?.owner, false),
      ]);
      await admin.goto("/settings/user/notifications");
      await ctx.verify("the inviter is told the invitation was accepted", [
        admin.shows(/Bob Tester accepted your invitation/),
      ]);
    },
  },
  {
    id: "invite-validation-errors",
    title: "the invite dialog refuses a bad address, a missing Team and a missing role, and an existing member is skipped",
    entryPoint: "Invite members dialog, POST /dms/pages/settings/workspace/members/invite",
    async run(/** @type {Ctx} */ ctx) {
      const roleName = ctx.unique("Support");
      await createRole(ctx, roleName);
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openInviteDialog(tab);
      await addAddresses(tab, "not-an-email");
      await ctx.verify("a malformed address is flagged", [tab.shows(/not-an-email isn’t a valid email address/)]);
      await tab.click({ role: "button", name: "Send invitations" });
      await ctx.verify("the dialog stays open and names the fields to fix", [
        tab.shows(/2 fields need your attention/),
        tab.visible({ role: "dialog", name: "Invite members" }),
      ]);
      await tab.click({ role: "button", name: "not-an-email" });
      const carol = ctx.email("carol");
      await addAddresses(tab, carol);
      await pickRole(tab, roleName);
      await tab.click({ role: "button", name: "Send invitations" });
      await ctx.verify("a missing Team is refused", [
        tab.shows(/1 field needs your attention/),
        tab.shows(/This value isn’t valid/),
        tab.at(ON_MEMBERS),
      ]);
      await tab.click({ role: "button", name: carol });
      await addAddresses(tab, ctx.adminCredentials().email);
      await pickTeam(tab);
      await tab.click({ role: "button", name: "Send invitations" });
      await ctx.verify("an address that already belongs to a member is refused", [
        tab.shows(/Already a member of this workspace/),
        tab.at(ON_MEMBERS),
      ]);
      const noRole = await ctx.api("invite without a role through the API", {
        method: "POST",
        path: `${PAGES_API}/members/invite`,
        body: { emails: [ctx.email("dora")], roles_ids: [], asTenantOwner: false },
      });
      const invites = await listInvites(ctx, "nothing was invited");
      const mail = await ctx.mail(() => false, 1_000);
      await ctx.verify("the API refuses a role-less invitation, nobody was invited and no mail left", [
        ctx.holds("answers 4xx", noRole.status >= 400 && noRole.status < 500, noRole.status),
        ctx.equal("pending invitations", invites.length, 0),
        ctx.equal("mail sent", mail.messages.length, 0),
      ]);
    },
  },
  {
    id: "invite-revoke-refuses-link",
    title: "revoking an invitation removes it after a reload and its emailed link no longer creates an account",
    entryPoint: "Member invitations > Revoke, /auth/signup?token=",
    async run(/** @type {Ctx} */ ctx) {
      const roleName = ctx.unique("Support");
      await createRole(ctx, roleName);
      const email = ctx.email("erin");
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await invite(admin, email, roleName);
      const link = await signupLink(ctx, email);
      await admin.click({ role: "button", name: "Revoke" });
      await ctx.verify("the dialog names the invitation and what revoking does", [
        admin.visible({ role: "dialog", name: `Revoke the invitation to ${email}?` }),
        admin.shows(/The link stops working right away/),
      ]);
      await admin.click({ role: "button", name: "Cancel" });
      await admin.reload();
      await ctx.verify("cancelling the dialog keeps the invitation", [admin.visible({ role: "cell", name: email })]);
      await admin.click({ role: "button", name: "Revoke" });
      await admin.click({ role: "button", name: "Revoke", within: { role: "dialog" } });
      await ctx.verify("the invitation is revoked", [
        admin.shows(/Invitation revoked/),
        admin.visible({ role: "cell", name: email }, { hidden: true }),
      ]);
      await admin.reload();
      await ctx.verify("it is still gone after a reload", [admin.visible({ role: "cell", name: email }, { hidden: true })]);
      const invites = await listInvites(ctx, "list the invitations");
      await ctx.verify("the API holds no invitation", [ctx.equal("pending invitations", invites.length, 0)]);
      const visitor = await ctx.tab("anon", "invitee");
      await visitor.goto(link);
      await ctx.verify("the revoked link opens no sign-up form", [
        visitor.visible(REVOKED_LINK),
        visitor.visible({ role: "button", name: "Create my account" }, { hidden: true, timeoutMs: 3_000 }),
      ]);
      const members = await listMembers(ctx, "list the members");
      await ctx.verify("nobody joined", [ctx.equal("members", members.map((member) => member.email), [ctx.adminCredentials().email])]);
    },
  },
  {
    id: "invite-resend-replaces-link",
    title: "resending an invitation emails a new link and the previous link stops working",
    entryPoint: "Member invitations > Resend, /auth/signup?token=",
    async run(/** @type {Ctx} */ ctx) {
      const roleName = ctx.unique("Support");
      await createRole(ctx, roleName);
      const email = ctx.email("fred");
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await invite(admin, email, roleName);
      const first = await signupLink(ctx, email);
      await admin.click({ role: "button", name: "Resend" });
      await admin.click({ role: "button", name: "Resend", within: { role: "dialog" } });
      await ctx.verify("the resend is confirmed", [admin.shows(/Invitation resent successfully/)]);
      const second = await signupLink(ctx, email, first);
      const stale = await ctx.tab("anon", "stale link");
      await stale.goto(first);
      await ctx.verify("the first link is refused", [stale.visible(REPLACED_LINK)]);
      const fresh = await acceptInvitation(ctx, second, { name: "Fred Tester", password: ctx.password() });
      await ctx.verify("the new link creates the account", [fresh.visible({ role: "button", name: "Fred Tester" })]);
      const members = await listMembers(ctx, "list the members");
      await ctx.verify("the member is listed", [ctx.holds("member exists", byEmail(members, email), email)]);
    },
  },
  {
    id: "invite-edit-changes-roles",
    title: "editing a pending invitation changes the roles and the name its invitee gets on accepting",
    entryPoint: "Member invitations > Edit invitation",
    async run(/** @type {Ctx} */ ctx) {
      const first = ctx.unique("Reader");
      const second = ctx.unique("Writer");
      await createRole(ctx, first);
      const secondId = await createRole(ctx, second);
      const email = ctx.email("gina");
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await invite(admin, email, first);
      await admin.click({ role: "button", name: "Edit invitation" });
      await admin.fill({ role: "textbox", name: "First name" }, "Gina");
      await admin.fill({ role: "textbox", name: "Last name" }, "Edited");
      await pickRole(admin, first);
      await pickRole(admin, second);
      await admin.click({ role: "button", name: "Save changes" });
      await ctx.verify("the edit is saved", [admin.shows(/Data has been successfully saved/)]);
      await admin.reload();
      await ctx.verify("the list shows the new role after a reload", [
        admin.visible({ role: "cell", name: second, exact: true }),
        admin.visible({ role: "cell", name: first, exact: true }, { hidden: true, timeoutMs: 3_000 }),
      ]);
      const pending = byEmail(await listInvites(ctx, "list the invitations"), email);
      await ctx.verify("the API holds the new role", [
        ctx.equal("roles", pending?.roles_ids?.map((role) => role._id), [secondId]),
      ]);
      const sentLink = await signupLink(ctx, email);
      await admin.click({ role: "button", name: "Resend" });
      await admin.click({ role: "button", name: "Resend", within: { role: "dialog" } });
      await admin.shows(/Invitation resent successfully/);
      const invitee = await ctx.tab("anon", "invitee");
      await invitee.goto(await signupLink(ctx, email, sentLink));
      await ctx.verify("the invitee sees the edited name on the sign-up form", [
        invitee.visible({ role: "heading", name: "Create your account" }),
        ctx.equal("name", await invitee.value({ role: "textbox", name: "First and last name" }), "Gina Edited"),
      ]);
    },
  },
  {
    id: "members-search-empty-state",
    title: "searching members and invitations for nothing shows the empty state, and clearing restores the rows",
    entryPoint: "Members and Member invitations search fields",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(INVITATIONS);
      await ctx.verify("a workspace with no invitation shows an empty list", [
        tab.visible({ role: "button", name: "Invitations 0" }),
        tab.shows(/Empty table/),
        tab.shows(/No data available/),
        tab.visible({ role: "cell", name: /@/ }, { hidden: true, timeoutMs: 3_000 }),
      ]);
      await tab.goto(MEMBERS);
      await tab.fill({ role: "textbox", name: "Search members" }, ctx.unique("nobody"));
      await ctx.verify("a search without a match shows the empty state", [
        tab.shows(/No results/),
        tab.shows(/No data matches these criteria/),
        tab.visible({ role: "cell", name: /Verify Admin/ }, { hidden: true }),
      ]);
      await tab.click({ role: "button", name: "Clear search" });
      await ctx.verify("clearing the search brings the member back", [
        tab.visible({ role: "cell", name: /Verify Admin/ }),
        tab.shows(/No results/, { not: true }),
      ]);
      await tab.fill({ role: "textbox", name: "Search members" }, "verify admin");
      await ctx.verify("a matching search keeps the member", [tab.visible({ role: "cell", name: /Verify Admin/ })]);
    },
  },
  ...memberChangeJourneys,
];
