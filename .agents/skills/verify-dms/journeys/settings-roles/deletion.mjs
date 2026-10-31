import { EXPORT_PERMISSION, PLAYGROUND_ONLY, createRole, storedRoles, listMembers, openRoles, selectRole, joinedMember } from "./steps.mjs";

/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

/** Deleting a role, unused and in use. */
export const roleDeletionJourneys = [
  {
    id: "role-delete-unused",
    title: "deleting a role nobody holds asks for confirmation, then removes it from the list and the API",
    entryPoint: "Settings > Roles > More role actions > Delete role",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Temp");
      await createRole(ctx, name);
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openRoles(tab);
      await selectRole(tab, new RegExp(`^${name}`));
      await tab.click({ role: "button", name: "More role actions" });
      await tab.click({ role: "menuitem", name: "Delete role" });
      await ctx.verify("the dialog says nobody holds the role", [
        tab.visible({ role: "dialog", name: `Delete ${name}?` }),
        tab.shows(/Nobody holds this role/),
      ]);
      await tab.click({ role: "button", name: "Cancel" });
      await tab.reload();
      await ctx.verify("cancelling keeps the role", [
        tab.visible({ role: "option", name: new RegExp(`^${name}`) }),
        ctx.equal("roles stored", (await storedRoles(ctx, "list after cancel")).length, 1),
      ]);
      await selectRole(tab, new RegExp(`^${name}`));
      await tab.click({ role: "button", name: "More role actions" });
      await tab.click({ role: "menuitem", name: "Delete role" });
      await tab.click({ role: "button", name: "Delete role", within: { role: "dialog" } });
      await ctx.verify("the role is deleted", [tab.shows(/Role deleted/)]);
      await tab.reload();
      await ctx.verify("it is gone after a reload and from the API", [
        tab.visible({ role: "option", name: new RegExp(`^${name}`) }, { hidden: true }),
        ctx.equal("roles stored", (await storedRoles(ctx, "list the roles")).length, 0),
      ]);
    },
  },
  {
    id: "role-delete-in-use-moves-members",
    title: "deleting a role members still hold says how many, and moves them to the chosen role (containment of what they lose)",
    entryPoint: "Settings > Roles > Delete role > Move them to",
    async run(/** @type {Ctx} */ ctx) {
      const doomed = ctx.unique("Doomed");
      const heir = ctx.unique("Heir");
      await createRole(ctx, doomed, PLAYGROUND_ONLY);
      const heirId = await createRole(ctx, heir, [EXPORT_PERMISSION]);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const noa = await joinedMember(ctx, admin, "Noa", doomed);
      await noa.tab.goto("/settings/workspace/playground");
      await ctx.verify("before: the member reaches the page the doomed role grants", [
        noa.tab.visible({ role: "heading", name: "Playground", exact: true }),
      ]);
      await openRoles(admin);
      await selectRole(admin, new RegExp(`^${doomed}`));
      await admin.click({ role: "button", name: "More role actions" });
      await admin.click({ role: "menuitem", name: "Delete role" });
      await ctx.verify("the dialog says one member still holds the role", [
        admin.visible({ role: "dialog", name: `Delete ${doomed}?` }),
        admin.shows(/1 member or pending invite still holds this role/),
        admin.visible({ role: "combobox", name: "Move them to" }),
      ]);
      await admin.click({ role: "combobox", name: "Move them to" });
      await admin.click({ role: "option", name: heir });
      await admin.click({ role: "button", name: "Delete role", within: { role: "dialog" } });
      await ctx.verify("the role is deleted", [admin.shows(/Role deleted/)]);
      const stored = await storedRoles(ctx, "list the roles");
      const member = (await listMembers(ctx, "list the members")).find((entry) => entry.email === noa.email);
      await noa.tab.goto("/settings/workspace/playground");
      await ctx.verify("the role is gone, the member holds the heir, and the page is refused", [
        ctx.equal("roles", stored.map((role) => role._id), [heirId]),
        ctx.equal("member roles", member?.roleIds?.map((role) => role._id), [heirId]),
        noa.tab.visible({ role: "heading", name: "Forbidden" }),
      ]);
    },
  },
];
