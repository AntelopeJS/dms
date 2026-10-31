import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { byCodeUnit, ROLES, MEMBERS, PAGES_API, EXPORT_PERMISSION, PLAYGROUND_ONLY, TOTAL_PERMISSIONS, LONG_NAME, createRole, storedRoles, listMembers, openRoles, newRole, selectRole, signupLink, invite, acceptInvitation, joinedMember, previewHidden } from "./settings-roles/steps.mjs";
import { roleDeletionJourneys } from "./settings-roles/deletion.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

/** Roles and permissions: the editor, the role list, and what a role changes for its members. */
export const journeys = [
  {
    id: "roles-empty-state",
    title: "a workspace with no role shows only the locked Owner, and the invite dialog says there is no role yet",
    entryPoint: "Settings > Roles on a fresh workspace, Invite members > Roles",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openRoles(tab);
      await ctx.verify("only the Owner entry exists and it is locked", [
        tab.visible({ role: "option", name: /^Owner/ }),
        tab.count({ role: "option" }, 1),
        tab.shows(/Owners have every permission/),
        tab.shows(TOTAL_PERMISSIONS),
        tab.visible({ role: "button", name: "Save changes" }, { hidden: true, timeoutMs: 2_000 }),
        tab.visible({ role: "button", name: "More role actions" }, { hidden: true, timeoutMs: 2_000 }),
      ]);
      const stored = await storedRoles(ctx, "list the roles");
      await ctx.verify("the roles table holds nothing", [ctx.equal("roles", stored, [])]);
      await tab.goto(MEMBERS);
      await tab.click({ role: "button", name: "Invite members" });
      await ctx.verify("the invite dialog points to Roles & permissions", [
        tab.shows(/No role yet\. Create one in Roles & permissions\./),
        tab.shows(/Pick at least one role\./),
      ]);
    },
  },
  {
    id: "create-role-persists",
    title: "a new role with a permission is listed, survives a reload and is stored with exactly that permission",
    entryPoint: "Settings > Roles > New role, POST /dms/pages/settings/workspace/roles/create",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Support");
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openRoles(tab);
      await newRole(tab, name, "Export reports");
      await tab.fill({ role: "textbox", name: "Description" }, "Answers tickets");
      await ctx.verify("the editor shows the draft as unsaved with one permission", [
        tab.shows(/Not saved yet/),
        tab.shows(/1 of 1259 selected/),
        tab.visible({ role: "option", name: new RegExp(`^${name}`) }),
      ]);
      await tab.click({ role: "button", name: "Save changes" });
      await ctx.verify("the role is created", [
        tab.shows(/Role created/),
        tab.shows(/1 of 1259 permissions/),
        tab.shows(/no member/),
      ]);
      await openRoles(tab);
      await ctx.verify("it is listed after a reload", [
        tab.visible({ role: "option", name: new RegExp(`^${name}`) }),
        tab.visible({ role: "link", name: "Roles 2" }),
      ]);
      await selectRole(tab, new RegExp(`^${name}`));
      await ctx.verify("its name, description and permission are kept", [
        ctx.equal("name", await tab.value({ role: "textbox", name: "Role name*" }), name),
        ctx.equal("description", await tab.value({ role: "textbox", name: "Description" }), "Answers tickets"),
        tab.shows(/1 of 1259 selected/),
        tab.visible({ role: "checkbox", name: "Export reports", exact: true }),
      ]);
      const stored = await storedRoles(ctx, "list the roles");
      await ctx.verify("the roles table holds the role with its one permission", [
        ctx.equal("names", stored.map((role) => role.name), [name]),
        ctx.equal("permissions", stored[0]?.permissions, [EXPORT_PERMISSION]),
      ]);
      await newRole(tab, name);
      await tab.click({ role: "button", name: "Save changes" });
      await ctx.verify("a second role with the same name is refused", [
        tab.shows(/Another role already has this name\./),
        ctx.equal("roles stored", (await storedRoles(ctx, "list the roles again")).length, 1),
      ]);
    },
  },
  {
    id: "role-validation-errors",
    title: "a role without a name is refused in the form and by the API, and a discarded draft leaves nothing behind",
    entryPoint: "Settings > Roles > New role > Save changes, POST /dms/pages/settings/workspace/roles/create",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openRoles(tab);
      await tab.click({ role: "button", name: "New role" });
      await tab.click({ role: "checkbox", name: "Export reports", exact: true });
      await tab.click({ role: "button", name: "Save changes" });
      await ctx.verify("the form asks for a name and keeps the draft", [
        tab.shows(/This field is required\./),
        tab.shows(/Not saved yet/),
      ]);
      const empty = await ctx.api("create a role without a name", {
        method: "POST",
        path: `${PAGES_API}/roles/create`,
        body: { name: "   ", description: "", permissions: [EXPORT_PERMISSION] },
      });
      const long = await ctx.api("create a role with an 81 character name", {
        method: "POST",
        path: `${PAGES_API}/roles/create`,
        body: { name: LONG_NAME, description: "", permissions: [] },
      });
      await ctx.verify("the API answers 400 for a blank name and for a name over 80 characters", [
        ctx.status(empty, 400),
        ctx.status(long, 400),
      ]);
      await tab.click({ role: "button", name: "Discard" });
      await ctx.verify("discarding drops the draft entry", [
        tab.visible({ role: "option", name: /Untitled role/ }, { hidden: true }),
        tab.count({ role: "option" }, 1),
      ]);
      await tab.reload();
      await ctx.verify("nothing was created", [
        tab.count({ role: "option" }, 1),
        ctx.equal("roles stored", (await storedRoles(ctx, "list the roles")).length, 0),
      ]);
    },
  },
  {
    id: "role-search-no-match",
    title: "searching the roles for nothing says so, keeps the Owner, and clearing restores the list",
    entryPoint: "Settings > Roles > Search roles",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Support");
      await createRole(ctx, name);
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openRoles(tab);
      await tab.fill({ role: "textbox", name: "Search roles" }, ctx.unique("nothing"));
      await ctx.verify("a search without a match shows the message", [
        tab.shows(/No role matches this search\./),
        tab.visible({ role: "option", name: new RegExp(`^${name}`) }, { hidden: true }),
        tab.visible({ role: "option", name: /^Owner/ }),
      ]);
      await tab.fill({ role: "textbox", name: "Search roles" }, name.toLowerCase());
      await ctx.verify("a matching search keeps the role", [
        tab.visible({ role: "option", name: new RegExp(`^${name}`) }),
        tab.shows(/No role matches this search\./, { not: true }),
      ]);
    },
  },
  {
    id: "role-assigned-through-invitation",
    title: "a role chosen on an invitation counts as a pending invite, then as a member once the invitation is accepted",
    entryPoint: "Invite members > Roles, Settings > Roles member counts",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Support");
      const roleId = await createRole(ctx, name);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const email = ctx.email("lena");
      await invite(admin, email, name);
      await openRoles(admin);
      await ctx.verify("the role shows one pending invite", [admin.shows(/1 invite/)]);
      const overview = await ctx.api("read the roles overview", { method: "GET", path: `${PAGES_API}/roles/overview` });
      const role = overview.body?.roles?.find((entry) => entry._id === roleId);
      await ctx.verify("the API counts one invite and no member", [
        ctx.equal("inviteCount", role?.inviteCount, 1),
        ctx.equal("memberCount", role?.memberCount, 0),
      ]);
      const password = ctx.password();
      await acceptInvitation(ctx, await signupLink(ctx, email), "Lena Tester", password);
      await openRoles(admin);
      await selectRole(admin, new RegExp(`^${name}`));
      await ctx.verify("the role now lists the member and no pending invite", [
        admin.shows(/1 member/),
        admin.shows(/Lena Tester/),
        admin.shows(/1 invite/, { not: true }),
      ]);
      const members = await listMembers(ctx, "list the members");
      const member = members.find((entry) => entry.email === email);
      await ctx.verify("the member row carries the role", [
        ctx.equal("roleIds", member?.roleIds?.map((entry) => entry._id), [roleId]),
      ]);
    },
  },
  {
    id: "role-edit-changes-access",
    title: "a member whose role lacks a permission is refused the page it guards until the role gains it (Exposure: who can see what, before and after)",
    entryPoint: "Settings > Roles editor, a guarded settings page opened by a member, POST .../roles/preview",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Viewer");
      const roleId = await createRole(ctx, name, PLAYGROUND_ONLY);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const mia = await joinedMember(ctx, admin, "Mia", name);
      const before = await previewHidden(ctx, "preview the role as stored", PLAYGROUND_ONLY, ROLES);
      await mia.tab.goto("/settings/workspace/playground");
      const playground = await mia.tab.visible({ role: "heading", name: "Playground", exact: true });
      await mia.tab.goto(ROLES);
      await ctx.verify("before: the preview, the member and the page agree the role sees Playground and not Roles", [
        ctx.status(before.answer, 200),
        ctx.holds("Roles is hidden in the preview", before.hidden.includes("settings.workspace.roles"), before.hidden.length),
        ctx.holds("Playground is not hidden in the preview", !before.hidden.includes("settings.workspace.playground"), before.hidden.length),
        playground,
        mia.tab.visible({ role: "heading", name: "Forbidden" }),
      ]);
      await openRoles(admin);
      await selectRole(admin, new RegExp(`^${name}`));
      await admin.click({ role: "checkbox", name: "Roles", exact: true });
      await ctx.verify("the editor says who the change reaches", [
        admin.shows(/applies to Mia on their next page load/),
        admin.shows(/permissions? added/),
      ]);
      await admin.click({ role: "button", name: "Save changes" });
      await ctx.verify("the role is saved", [admin.shows(/Role saved/)]);
      const stored = (await storedRoles(ctx, "read the role")).find((role) => role._id === roleId);
      const after = await previewHidden(ctx, "preview the role as stored after the edit", stored?.permissions ?? [], ROLES);
      await mia.tab.goto(ROLES);
      await ctx.verify("after: the stored role, the preview and the member's page all grant Roles", [
        ctx.holds("the role stores a Roles permission", stored?.permissions?.some((id) => id.startsWith("settings.workspace.roles")), JSON.stringify(stored?.permissions)),
        ctx.holds("Roles is no longer hidden in the preview", !after.hidden.includes("settings.workspace.roles"), after.hidden.length),
        mia.tab.visible({ role: "heading", name: "Roles", exact: true }),
      ]);
      await mia.tab.goto(MEMBERS);
      await ctx.verify("a page the role never gained stays refused", [
        mia.tab.visible({ role: "heading", name: "Forbidden" }),
      ]);
      await openRoles(admin);
      await selectRole(admin, new RegExp(`^${name}`));
      await admin.click({ role: "checkbox", name: "Roles", exact: true });
      await ctx.verify("the editor reports the permissions removed", [admin.shows(/permissions? removed/)]);
      await admin.click({ role: "button", name: "Save changes" });
      await ctx.verify("the role is saved without them", [admin.shows(/Role saved/)]);
      const trimmed = (await storedRoles(ctx, "read the role again")).find((role) => role._id === roleId);
      await mia.tab.goto(ROLES);
      await ctx.verify("removing a permission takes the access away again: the stored role and the page agree", [
        ctx.equal("stored permissions", trimmed?.permissions?.slice().sort(), PLAYGROUND_ONLY.slice().sort()),
        mia.tab.visible({ role: "heading", name: "Forbidden" }),
      ]);
      await openRoles(admin);
      await selectRole(admin, new RegExp(`^${name}`));
      await ctx.verify("the editor shows the Roles permission unticked after a reload", [
        ctx.equal("Roles ticked", await admin.page.getByRole("checkbox", { name: "Roles", exact: true }).isChecked(), false),
      ]);
    },
  },
  {
    id: "role-preview-opens-tab",
    title: "Preview as role opens a new tab that shows the dashboard as that role sees it",
    entryPoint: "Settings > Roles > Preview as <role>",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Viewer");
      await createRole(ctx, name, PLAYGROUND_ONLY);
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openRoles(tab);
      await selectRole(tab, new RegExp(`^${name}`));
      const opened = tab.page.context().waitForEvent("page", { timeout: 15_000 });
      await tab.click({ role: "button", name: `Preview as ${name}` });
      const popup = await opened.then((page) => page, () => null);
      await ctx.verify("a preview tab opens", [ctx.holds("a new tab opened", popup, "no new tab")], { critical: true });
      await popup.waitForLoadState("load");
      const text = await popup
        .getByText(/Previewing/)
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => true, () => false);
      const folder = ctx.step("the preview tab");
      writeFileSync(join(folder, "aria.yml"), `${await popup.locator("body").ariaSnapshot()}\n`);
      await popup.screenshot({ path: join(folder, "screenshot.png") });
      const veiled = await popup.getByRole("button", { name: new RegExp(`Design system · Hidden for ${name}`) }).count();
      const region = popup.getByRole("region", { name: "Role preview" });
      const barText = (await region.innerText()).replace(/\s+/g, " ");
      await ctx.verify("the tab announces the preview and marks what the role cannot see", [
        ctx.holds("the preview bar names the role", text && barText.includes(`as ${name}`), barText),
        ctx.equal("Library groups marked hidden for the role", veiled, 1),
        ctx.holds("the page is hidden for the role", barText.includes(`Page hidden for ${name}`), barText),
      ]);
      await popup.getByRole("button", { name: "Exit preview" }).click();
      const barsLeft = popup.isClosed() ? 0 : await popup.getByRole("region", { name: "Role preview" }).count().catch(() => 0);
      await ctx.verify("exiting the preview ends it", [ctx.equal("preview bars left", barsLeft, 0)]);
      if (!popup.isClosed()) await popup.close();
    },
  },
  {
    id: "role-duplicate",
    title: "duplicating a role stores a copy with the same permissions under a new name",
    entryPoint: "Settings > Roles > More role actions > Duplicate role",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Support");
      await createRole(ctx, name);
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openRoles(tab);
      await selectRole(tab, new RegExp(`^${name}`));
      await tab.click({ role: "button", name: "More role actions" });
      await tab.click({ role: "menuitem", name: "Duplicate role" });
      await ctx.verify("the copy is created and selected", [
        tab.shows(/Role duplicated/),
        ctx.equal("name", await tab.value({ role: "textbox", name: "Role name*" }), `${name} (copy)`),
      ]);
      await openRoles(tab);
      const stored = await storedRoles(ctx, "list the roles");
      await ctx.verify("both roles are stored with the same permissions", [
        ctx.equal("names", stored.map((role) => role.name).sort(byCodeUnit), [name, `${name} (copy)`].sort(byCodeUnit)),
        ctx.equal("permissions", stored.map((role) => role.permissions), [[EXPORT_PERMISSION], [EXPORT_PERMISSION]]),
        tab.visible({ role: "option", name: new RegExp(`^${name} \\(copy\\)`) }),
      ]);
    },
  },
  ...roleDeletionJourneys,
];
