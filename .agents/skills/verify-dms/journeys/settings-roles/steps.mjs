import { isMemberRow, isRoleRow, listOf, requiredStringIn, stringsIn } from "../../rows.mjs";

/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../../../packages/dms/bin/control/tab.mjs").Tab} Tab
 * @typedef {import("../../rows.mjs").MemberRow} MemberRow
 * @typedef {import("../../rows.mjs").RoleRow} RoleRow
 */

/** Orders strings by UTF-16 code unit, the order `sort()` uses with no comparator. */
export function byCodeUnit(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

export const ROLES = "/settings/workspace/roles";
export const MEMBERS = "/settings/workspace/members";
export const INVITATIONS = "/settings/workspace/invites";
export const PAGES_API = "/dms/pages/settings/workspace";
export const SIGNUP_LINK = /\/auth\/signup\?token=/;
export const SIGNED_IN = /^\/(?!auth)/;
export const ON_INVITATIONS = new RegExp(`^${INVITATIONS}$`);
export const EXPORT_PERMISSION = "playground.reports.export";
export const PLAYGROUND_ONLY = ["settings", "settings.workspace", "settings.workspace.playground", "settings.workspace.playground.form"];
export const TOTAL_PERMISSIONS = /1259/;
export const LONG_NAME = "x".repeat(81);

/**
 * @param {Ctx} ctx
 * @param {string} name
 * @param {string[]} [permissions]
 * @returns {Promise<string>}
 */
export async function createRole(ctx, name, permissions = [EXPORT_PERMISSION]) {
  const answer = await ctx.api(`create the role ${name}`, {
    method: "POST",
    path: `${PAGES_API}/roles/create`,
    body: { name, description: "", permissions },
  });
  await ctx.verify(`the role ${name} exists`, [ctx.status(answer, 200)], { critical: true });
  return requiredStringIn(answer.body, "id");
}

/**
 * @param {Ctx} ctx
 * @param {string} label
 * @returns {Promise<RoleRow[]>}
 */
export async function storedRoles(ctx, label) {
  const answer = await ctx.api(label, { method: "GET", path: "/api/tables/roles/list" });
  return listOf(answer.body, isRoleRow);
}

/**
 * @param {Ctx} ctx
 * @param {string} label
 * @returns {Promise<MemberRow[]>}
 */
export async function listMembers(ctx, label) {
  const answer = await ctx.api(label, { method: "GET", path: "/api/tables/members/list" });
  return listOf(answer.body, isMemberRow);
}

export async function openRoles(/** @type {Tab} */ tab) {
  await tab.goto(ROLES);
  await tab.visible({ role: "heading", name: "Roles", exact: true });
}

/**
 * @param {Tab} tab
 * @param {string} name
 * @param {...string} permissionLabels
 */
export async function newRole(tab, name, ...permissionLabels) {
  await tab.click({ role: "button", name: "New role" });
  await tab.fill({ role: "textbox", name: "Role name*" }, name);
  for (const label of permissionLabels) await tab.click({ role: "checkbox", name: label, exact: true });
}

export async function selectRole(/** @type {Tab} */ tab, /** @type {string | RegExp} */ name) {
  await tab.click({ role: "option", name });
}

export async function signupLink(/** @type {Ctx} */ ctx, /** @type {string} */ email) {
  const mail = await ctx.mail(
    (message) => message.to.some((to) => to.includes(email)) && message.links.some((/** @type {string} */ link) => SIGNUP_LINK.test(link)),
  );
  await ctx.verify(`the invitation email reaches ${email}`, [
    ctx.holds("an email with a signup link arrived", mail.match, `${mail.messages.length} messages captured`),
  ], { critical: true });
  return mail.match.links.findLast((/** @type {string} */ link) => SIGNUP_LINK.test(link));
}

export async function invite(/** @type {Tab} */ tab, /** @type {string} */ email, /** @type {string} */ roleName) {
  await tab.goto(MEMBERS);
  await tab.click({ role: "button", name: "Invite members" });
  await tab.fill({ role: "textbox", name: "Email addresses" }, email);
  await tab.press("Enter", { role: "textbox", name: "Email addresses" });
  await tab.click({ role: "combobox", name: "Team" });
  await tab.click({ role: "option", name: "Sales" });
  await tab.click({ role: "button", name: roleName, exact: true, within: { role: "group", name: "Roles" } });
  await tab.click({ role: "button", name: "Send invitations" });
  await tab.at(ON_INVITATIONS);
}

export async function acceptInvitation(/** @type {Ctx} */ ctx, /** @type {string} */ link, /** @type {string} */ name, /** @type {string} */ password) {
  const tab = await ctx.tab("anon", "invitee");
  await tab.goto(link);
  await tab.fill({ role: "textbox", name: "First and last name" }, name);
  await tab.fill({ role: "textbox", name: "Password" }, password);
  await tab.click({ role: "button", name: "Create my account" });
  await ctx.verify(`${name} is signed in after accepting`, [tab.at(SIGNED_IN)], { critical: true });
  return tab;
}

/** Invites a member with `roleName` and returns them signed in on their own tab. */
export async function joinedMember(/** @type {Ctx} */ ctx, /** @type {Tab} */ admin, /** @type {string} */ firstName, /** @type {string} */ roleName) {
  const email = ctx.email(firstName.toLowerCase());
  const password = ctx.password();
  await invite(admin, email, roleName);
  const tab = await acceptInvitation(ctx, await signupLink(ctx, email), firstName, password);
  ctx.addAccount(firstName.toLowerCase(), { email, password });
  return { email, password, tab };
}

export async function previewHidden(/** @type {Ctx} */ ctx, /** @type {string} */ label, /** @type {string[]} */ permissions, /** @type {string} */ path) {
  const answer = await ctx.api(label, {
    method: "POST",
    path: `${PAGES_API}/roles/preview`,
    body: { permissions, path },
  });
  return { answer, hidden: stringsIn(answer.body, "hiddenEntries") };
}
