export const MEMBERS = "/settings/workspace/members";
export const INVITATIONS = "/settings/workspace/invites";
export const ROLES = "/settings/workspace/roles";
export const PAGES_API = "/dms/pages/settings/workspace";
export const SIGNUP_LINK = /\/auth\/signup\?token=/;
export const MEMBERS_ONLY = [
  "settings",
  "settings.workspace",
  "settings.workspace.members",
  "settings.workspace.members.table",
  "settings.workspace.members.table.list",
];
export const ON_MEMBERS = new RegExp(`^${MEMBERS}$`);
export const ON_INVITATIONS = new RegExp(`^${INVITATIONS}$`);
export const SIGNED_IN = /^\/(?!auth)/;

export async function createRole(ctx, name, permissions = ["playground.reports.export"]) {
  const answer = await ctx.api(`create the role ${name}`, {
    method: "POST",
    path: `${PAGES_API}/roles/create`,
    body: { name, description: "", permissions },
  });
  await ctx.verify(`the role ${name} exists`, [ctx.status(answer, 200)], { critical: true });
  return answer.body.id;
}

export async function listMembers(ctx, label, as = "admin") {
  const answer = await ctx.api(label, { method: "GET", path: "/api/tables/members/list", as });
  return answer.body?.results ?? [];
}

export async function listInvites(ctx, label) {
  const answer = await ctx.api(label, { method: "GET", path: "/api/tables/admin-invites/list" });
  return answer.body?.results ?? [];
}

export async function openInviteDialog(tab) {
  await tab.goto(MEMBERS);
  await tab.click({ role: "button", name: "Invite members" });
}

export async function addAddresses(tab, ...emails) {
  for (const email of emails) {
    await tab.fill({ role: "textbox", name: "Email addresses" }, email);
    await tab.press("Enter", { role: "textbox", name: "Email addresses" });
  }
}

export async function pickTeam(tab) {
  await tab.click({ role: "combobox", name: "Team" });
  await tab.click({ role: "option", name: "Sales" });
}

export async function pickRole(tab, name) {
  await tab.click({ role: "button", name, exact: true, within: { role: "group", name: "Roles" } });
}

/** Opens the dialog, fills a valid invitation and sends it, which lands on the invitations list. */
export async function invite(tab, email, roleName) {
  await openInviteDialog(tab);
  await addAddresses(tab, email);
  await pickTeam(tab);
  await pickRole(tab, roleName);
  await tab.click({ role: "button", name: "Send invitations" });
  await tab.at(ON_INVITATIONS);
}

export async function signupLink(ctx, email, notLink) {
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
export async function acceptInvitation(ctx, link, { name, password }) {
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
export async function joinedMember(ctx, admin, { firstName, roleName }) {
  const email = ctx.email(firstName.toLowerCase());
  const password = ctx.password();
  await invite(admin, email, roleName);
  const tab = await acceptInvitation(ctx, await signupLink(ctx, email), { name: firstName, password });
  ctx.addAccount(firstName.toLowerCase(), { email, password });
  return { email, password, tab };
}

export function byEmail(members, email) {
  return members.find((member) => member.email === email);
}

export async function rowActions(tab, name) {
  await tab.goto(MEMBERS);
  await tab.click({ role: "button", name: `Actions for ${name}` });
}

export async function removeThroughMenu(tab, name) {
  await rowActions(tab, name);
  await tab.click({ role: "menuitem", name: "Remove from workspace…" });
}

export const REVOKED_LINK = { role: "heading", name: "This invitation was revoked" };
export const REPLACED_LINK = { role: "heading", name: "This invitation was replaced by a newer email" };
