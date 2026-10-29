const MEMBERS = "/settings/workspace/members";
const INVITATIONS = "/settings/workspace/invites";
const ROLES = "/settings/workspace/roles";
const PAGES_API = "/dms/pages/settings/workspace";
const SIGNUP_LINK = /\/auth\/signup\?token=/;
const MEMBERS_ONLY = [
  "settings",
  "settings.workspace",
  "settings.workspace.members",
  "settings.workspace.members.table",
  "settings.workspace.members.table.list",
];
const ON_MEMBERS = new RegExp(`^${MEMBERS}$`);
const ON_INVITATIONS = new RegExp(`^${INVITATIONS}$`);
const SIGNED_IN = /^\/(?!auth)/;

async function createRole(ctx, name, permissions = ["playground.reports.export"]) {
  const answer = await ctx.api(`create the role ${name}`, {
    method: "POST",
    path: `${PAGES_API}/roles/create`,
    body: { name, description: "", permissions },
  });
  await ctx.verify(`the role ${name} exists`, [ctx.status(answer, 200)], { critical: true });
  return answer.body.id;
}

async function listMembers(ctx, label, as = "admin") {
  const answer = await ctx.api(label, { method: "GET", path: "/api/tables/members/list", as });
  return answer.body?.results ?? [];
}

async function listInvites(ctx, label) {
  const answer = await ctx.api(label, { method: "GET", path: "/api/tables/admin-invites/list" });
  return answer.body?.results ?? [];
}

async function openInviteDialog(tab) {
  await tab.goto(MEMBERS);
  await tab.click({ role: "button", name: "Invite members" });
}

async function addAddresses(tab, ...emails) {
  for (const email of emails) {
    await tab.fill({ role: "textbox", name: "Email addresses" }, email);
    await tab.press("Enter", { role: "textbox", name: "Email addresses" });
  }
}

async function pickTeam(tab) {
  await tab.click({ role: "combobox", name: "Team" });
  await tab.click({ role: "option", name: "Sales" });
}

async function pickRole(tab, name) {
  await tab.click({ role: "button", name, exact: true, within: { role: "group", name: "Roles" } });
}

/** Opens the dialog, fills a valid invitation and sends it, which lands on the invitations list. */
async function invite(tab, email, roleName) {
  await openInviteDialog(tab);
  await addAddresses(tab, email);
  await pickTeam(tab);
  await pickRole(tab, roleName);
  await tab.click({ role: "button", name: "Send invitations" });
  await tab.at(ON_INVITATIONS);
}

async function signupLink(ctx, email, notLink) {
  const mail = await ctx.mail(
    (message) =>
      message.to.some((to) => to.includes(email)) &&
      message.links.some((link) => SIGNUP_LINK.test(link) && link !== notLink),
  );
  await ctx.verify(`the invitation email reaches ${email}`, [
    ctx.holds("an email with a signup link arrived", mail.match, `${mail.messages.length} messages captured`),
  ], { critical: true });
  return mail.match.links.findLast((link) => SIGNUP_LINK.test(link) && link !== notLink);
}

/** Opens a signup link as a visitor, fills the form and creates the account. */
async function acceptInvitation(ctx, link, { name, password }) {
  const tab = await ctx.tab("anon", "invitee");
  await tab.goto(link);
  await ctx.verify("the link opens the sign-up form", [
    tab.visible({ role: "heading", name: "Create your account" }),
  ], { critical: true });
  await tab.fill({ role: "textbox", name: "First and last name" }, name);
  await tab.fill({ role: "textbox", name: "Password" }, password);
  await tab.click({ role: "button", name: "Create my account" });
  await ctx.verify(`${name} is signed in after accepting`, [tab.at(SIGNED_IN)], { critical: true });
  return tab;
}

/** Invites, accepts and returns a member who is signed in on `tab`. */
async function joinedMember(ctx, admin, { firstName, roleName }) {
  const email = ctx.email(firstName.toLowerCase());
  const password = ctx.password();
  await invite(admin, email, roleName);
  const tab = await acceptInvitation(ctx, await signupLink(ctx, email), { name: firstName, password });
  ctx.addAccount(firstName.toLowerCase(), { email, password });
  return { email, password, tab };
}

function byEmail(members, email) {
  return members.find((member) => member.email === email);
}

async function rowActions(tab, name) {
  await tab.goto(MEMBERS);
  await tab.click({ role: "button", name: `Actions for ${name}` });
}

async function removeThroughMenu(tab, name) {
  await rowActions(tab, name);
  await tab.click({ role: "menuitem", name: "Remove from workspace…" });
}

const REVOKED_LINK = { role: "heading", name: "This invitation was revoked" };
const REPLACED_LINK = { role: "heading", name: "This invitation was replaced by a newer email" };

/** Invitations, member management and the sign-up link, each read back through a second view. */
export const journeys = [
  {
    id: "invite-accept-lists-member",
    title: "an invitation accepted through its emailed link creates a member who is listed and can sign in",
    entryPoint: "Invite members dialog, /auth/signup?token=, Members list",
    async run(ctx) {
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
    async run(ctx) {
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
    async run(ctx) {
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
    async run(ctx) {
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
    async run(ctx) {
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
    async run(ctx) {
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
  {
    id: "remove-member-shows-impact",
    title: "removing a member first shows what it takes away, then the member is gone from the list and the API and loses access (Data door containment)",
    entryPoint: "Members > row menu > Remove from workspace",
    async run(ctx) {
      const roleName = ctx.unique("Viewer");
      const roleId = await createRole(ctx, roleName, MEMBERS_ONLY);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const hank = await joinedMember(ctx, admin, { firstName: "Hank", roleName });
      await hank.tab.goto(MEMBERS);
      const seen = await listMembers(ctx, "the member reads the members list", "hank");
      await ctx.verify("before the removal the member reads what the role grants", [
        hank.tab.visible({ role: "heading", name: "Members", exact: true }),
        ctx.equal("members the member sees", seen.length, 2),
      ]);
      await removeThroughMenu(admin, "Hank");
      const stored = byEmail(await listMembers(ctx, "list the members"), hank.email);
      await ctx.verify("the dialog spells out the impact before anything changes", [
        admin.visible({ role: "dialog", name: "Remove Hank from the workspace?" }),
        admin.shows(/signed out of the workspace right away/),
        admin.shows(new RegExp(`Roles removed\\s*${roleName}`)),
        admin.shows(/Records they created stay/),
      ]);
      const impact = await ctx.api("the removal impact", {
        method: "GET",
        path: `${PAGES_API}/members/${stored?._id}/removal-impact`,
      });
      await ctx.verify("the API reports the same impact", [
        ctx.status(impact, 200),
        ctx.equal("roles", impact.body?.roles, [roleName]),
        ctx.equal("last owner", impact.body?.isLastOwner, false),
      ]);
      await admin.click({ role: "button", name: "Cancel" });
      await admin.reload();
      await ctx.verify("cancelling removes nobody", [
        admin.visible({ role: "cell", name: /Hank/ }),
        ctx.holds("still a member", byEmail(await listMembers(ctx, "list after cancel"), hank.email), hank.email),
      ]);
      await removeThroughMenu(admin, "Hank");
      await admin.click({ role: "button", name: "Remove member" });
      await ctx.verify("the removal is confirmed", [admin.shows(/Member removed/)]);
      await admin.reload();
      await ctx.verify("the member is gone from the list after a reload", [
        admin.visible({ role: "cell", name: /Hank/ }, { hidden: true }),
        admin.shows(/1 member/),
      ]);
      const after = await listMembers(ctx, "list the members again");
      const refused = await ctx.api("the removed member reads the members list", { method: "GET", path: "/api/tables/members/list", as: "hank" });
      const login = await ctx.api("the removed member signs in", {
        method: "POST",
        path: "/api/auth/login",
        as: "anon",
        body: { email: hank.email, password: hank.password },
      });
      await ctx.verify("the API drops the member and refuses what the role granted", [
        ctx.equal("members", after.map((member) => member.email), [ctx.adminCredentials().email]),
        ctx.holds("the members list is refused", refused.status === 401 || refused.status === 403, refused.status),
        ctx.holds("sign-in yields no session", !login.body?.access_token, JSON.stringify(login.body).slice(0, 120)),
        ctx.equal("sign-in asks for a workspace", login.body?.requires_tenant_assignment, true),
      ]);
      await hank.tab.goto(MEMBERS);
      await ctx.verify("the removed member's open browser no longer reaches the page", [
        hank.tab.visible({ role: "heading", name: "Members", exact: true }, { hidden: true }),
      ]);
      const roles = await ctx.api("the role survives the removal", { method: "GET", path: "/api/tables/roles/list" });
      await ctx.verify("the role itself stays", [ctx.equal("role ids", roles.body?.results?.map((role) => role._id), [roleId])]);
    },
  },
  {
    id: "removed-member-lands-on-a-page",
    title: "a removed member who signs in again is told they have no workspace instead of reaching a missing page",
    entryPoint: "/auth sign-in form after Remove from workspace",
    async run(ctx) {
      const roleName = ctx.unique("Support");
      await createRole(ctx, roleName);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const iris = await joinedMember(ctx, admin, { firstName: "Iris", roleName });
      await removeThroughMenu(admin, "Iris");
      await admin.click({ role: "button", name: "Remove member" });
      await admin.shows(/Member removed/);
      const again = await ctx.tab("iris");
      await again.goto("/auth");
      await again.fill({ role: "textbox", name: "Email address" }, iris.email);
      await again.fill({ role: "textbox", name: "Password", exact: true }, iris.password);
      await again.click({ role: "button", name: "Login", exact: true });
      await ctx.verify("the person is not shown a missing page", [
        again.visible({ role: "heading", name: "Page not found" }, { hidden: true, timeoutMs: 5_000 }),
        again.shows(/workspace/i),
      ]);
    },
  },
  {
    id: "remove-last-owner-refused",
    title: "the only owner cannot remove themself or lose the owner role, and nothing changes",
    entryPoint: "Members > row menu of the only owner, DELETE /api/tables/members/delete",
    async run(ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await rowActions(tab, "Verify Admin");
      await tab.click({ role: "menuitem", name: "Remove owner role…" });
      await tab.click({ role: "button", name: "Remove owner role", exact: true, within: { role: "dialog" } });
      await ctx.verify("dropping the last owner role is refused", [
        tab.shows(/Cannot remove the last owner/),
        tab.shows(/Owner role removed/, { not: true, timeoutMs: 1_000 }),
      ]);
      await rowActions(tab, "Verify Admin");
      await tab.click({ role: "menuitem", name: "Remove from workspace…" });
      await ctx.verify("the dialog says they are the only owner and offers no removal", [
        tab.shows(/You’re the only owner/),
        tab.visible({ role: "button", name: "Remove member" }, { hidden: true, timeoutMs: 2_000 }),
      ]);
      const own = (await listMembers(ctx, "list the members"))[0];
      const direct = await ctx.api("remove the only owner through the API", {
        method: "DELETE",
        path: `/api/tables/members/delete?id=${encodeURIComponent(own?._id)}`,
      });
      const after = await listMembers(ctx, "list the members again");
      await ctx.verify("the API refuses with a conflict and the owner stays", [
        ctx.status(direct, 409),
        ctx.equal("members", after.map((member) => member.email), [ctx.adminCredentials().email]),
        ctx.equal("still an owner", after[0]?.isTenantOwner, true),
      ]);
    },
  },
  {
    id: "make-owner-and-back",
    title: "making a member owner grants the owner-only pages and removing the owner role takes them away again",
    entryPoint: "Members > row menu > Make owner / Remove owner role",
    async run(ctx) {
      const roleName = ctx.unique("Support");
      await createRole(ctx, roleName);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const jack = await joinedMember(ctx, admin, { firstName: "Jack", roleName });
      await jack.tab.goto(ROLES);
      await ctx.verify("before: the member is refused the Roles page", [
        jack.tab.visible({ role: "heading", name: "Forbidden" }),
      ]);
      await rowActions(admin, "Jack");
      await admin.click({ role: "menuitem", name: "Make owner…" });
      await ctx.verify("the confirmation names the member and the power it gives", [
        admin.visible({ role: "dialog", name: "Make Jack an owner?" }),
        admin.shows(/including billing, roles and removing members/),
      ]);
      await admin.click({ role: "button", name: "Make owner", exact: true, within: { role: "dialog" } });
      await ctx.verify("the owner role is given", [admin.shows(/Owner role given/)]);
      await admin.reload();
      const promoted = byEmail(await listMembers(ctx, "list the members"), jack.email);
      await jack.tab.goto(ROLES);
      await ctx.verify("after: the API shows an owner who now opens Roles", [
        ctx.equal("isTenantOwner", promoted?.isTenantOwner, true),
        jack.tab.visible({ role: "heading", name: "Roles", exact: true }),
      ]);
      await rowActions(admin, "Jack");
      await admin.click({ role: "menuitem", name: "Remove owner role…" });
      await admin.click({ role: "button", name: "Remove owner role", exact: true, within: { role: "dialog" } });
      await ctx.verify("the owner role is removed", [admin.shows(/Owner role removed/)]);
      const demoted = byEmail(await listMembers(ctx, "list the members again"), jack.email);
      await jack.tab.goto(ROLES);
      await ctx.verify("back: the member keeps the role and is refused the Roles page again", [
        ctx.equal("isTenantOwner", demoted?.isTenantOwner, false),
        ctx.equal("roles kept", demoted?.roleIds?.length, 1),
        jack.tab.visible({ role: "heading", name: "Forbidden" }),
      ]);
    },
  },
  {
    id: "change-member-roles",
    title: "Change roles swaps a member's role and the new role is what the API and the list show",
    entryPoint: "Members > row menu > Change roles",
    async run(ctx) {
      const first = ctx.unique("Reader");
      const second = ctx.unique("Writer");
      await createRole(ctx, first);
      const secondId = await createRole(ctx, second);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const kim = await joinedMember(ctx, admin, { firstName: "Kim", roleName: first });
      await rowActions(admin, "Kim");
      await admin.click({ role: "menuitem", name: "Change roles" });
      await pickRole(admin, first);
      await pickRole(admin, second);
      await admin.click({ role: "button", name: "Save changes" });
      await ctx.verify("the change is saved", [admin.shows(/Data has been successfully saved/)]);
      await admin.reload();
      const member = byEmail(await listMembers(ctx, "list the members"), kim.email);
      await ctx.verify("the list and the API show only the new role", [
        admin.visible({ role: "cell", name: second, exact: true }),
        admin.visible({ role: "cell", name: first, exact: true }, { hidden: true, timeoutMs: 3_000 }),
        ctx.equal("roles", member?.roleIds?.map((role) => role._id), [secondId]),
      ]);
    },
  },
];
