import { EXPORT_PERMISSION, PAGES_API, createRole, storedRoles, openRoles, selectRole, joinedMember } from "./steps.mjs";

/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const ROLES_EDIT = "settings.workspace.roles.table.edit";

/** What a role editor who is not the platform owner may grant. */
export const roleGrantJourneys = [
  {
    id: "role-editor-grants-only-held",
    title: "a role editor who is not the platform owner cannot grant a permission they lack, nor *, while the owner can",
    entryPoint: "Settings > Roles editor opened by a member, PUT /dms/pages/settings/workspace/roles/:id, GET /dms/modules-listing",
    async run(/** @type {Ctx} */ ctx) {
      const name = ctx.unique("Role editor");
      const roleId = await createRole(ctx, name, [ROLES_EDIT]);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const rita = await joinedMember(ctx, admin, "Rita", name);
      await openRoles(rita.tab);
      await selectRole(rita.tab, new RegExp(`^${name}`));
      await rita.tab.click({ role: "checkbox", name: "Export reports", exact: true });
      await rita.tab.click({ role: "button", name: "Save changes" });
      await ctx.verify("the member's save of a permission they lack is refused", [
        rita.tab.shows(/You can.t grant permissions you don.t hold yourself\./),
      ]);
      const kept = (await storedRoles(ctx, "read the role after the refused save")).find((role) => role._id === roleId);
      const wildcard = await ctx.api("the member adds * to their own role", {
        method: "PUT",
        path: `${PAGES_API}/roles/${roleId}`,
        as: "rita",
        body: { name, description: "", permissions: [...(kept?.permissions ?? []), "*"] },
      });
      const listing = await ctx.api("the member reads the modules listing", { method: "GET", path: "/dms/modules-listing", as: "rita" });
      await ctx.verify("the stored role is unchanged, * is refused, and the member is not the owner", [
        ctx.holds("the role does not store Export reports", !kept?.permissions?.includes(EXPORT_PERMISSION), JSON.stringify(kept?.permissions)),
        ctx.status(wildcard, 403),
        ctx.status(listing, 403),
      ]);
      await openRoles(admin);
      await selectRole(admin, new RegExp(`^${name}`));
      await admin.click({ role: "checkbox", name: "Export reports", exact: true });
      await admin.click({ role: "button", name: "Save changes" });
      const granted = (await storedRoles(ctx, "read the role after the owner's save")).find((role) => role._id === roleId);
      await ctx.verify("the platform owner grants the same permission", [
        admin.shows(/Role saved/),
        ctx.holds("the role stores Export reports", granted?.permissions?.includes(EXPORT_PERMISSION), JSON.stringify(granted?.permissions)),
      ]);
    },
  },
];
