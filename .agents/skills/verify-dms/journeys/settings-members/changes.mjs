import { MEMBERS, ROLES, PAGES_API, MEMBERS_ONLY, createRole, listMembers, pickRole, joinedMember, byEmail, rowActions, removeThroughMenu } from "./steps.mjs";
import { booleanIn, isRoleRow, listOf, stringIn, stringsIn } from "../../rows.mjs";

/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

/** Removing a member and changing a member's roles, each read back through a second view. */
export const memberChangeJourneys = [
  {
    id: "remove-member-shows-impact",
    title: "removing a member first shows what it takes away, then the member is gone from the list and the API and loses access (Data door containment)",
    entryPoint: "Members > row menu > Remove from workspace",
    async run(/** @type {Ctx} */ ctx) {
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
        ctx.equal("roles", stringsIn(impact.body, "roles"), [roleName]),
        ctx.equal("last owner", booleanIn(impact.body, "isLastOwner"), false),
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
        ctx.holds("sign-in yields no session", !stringIn(login.body, "access_token"), JSON.stringify(login.body).slice(0, 120)),
        ctx.equal("sign-in asks for a workspace", booleanIn(login.body, "requires_tenant_assignment"), true),
      ]);
      await hank.tab.goto(MEMBERS);
      await ctx.verify("the removed member's open browser no longer reaches the page", [
        hank.tab.visible({ role: "heading", name: "Members", exact: true }, { hidden: true }),
      ]);
      const roles = await ctx.api("the role survives the removal", { method: "GET", path: "/api/tables/roles/list" });
      await ctx.verify("the role itself stays", [ctx.equal("role ids", listOf(roles.body, isRoleRow).map((role) => role._id), [roleId])]);
    },
  },
  {
    id: "removed-member-lands-on-a-page",
    title: "a removed member who signs in again is told they have no workspace instead of reaching a missing page",
    entryPoint: "/auth sign-in form after Remove from workspace",
    async run(/** @type {Ctx} */ ctx) {
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
    async run(/** @type {Ctx} */ ctx) {
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
    async run(/** @type {Ctx} */ ctx) {
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
    async run(/** @type {Ctx} */ ctx) {
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
