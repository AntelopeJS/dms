/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../../../packages/dms/bin/control/tab.mjs").Tab} Tab
 */

export const PROFILE = "/settings/user/profile";
export const SECURITY = "/settings/user/security";
export const REGION = "/settings/user/region";
export const NOTIFICATIONS = "/settings/user/notifications";
export const APPEARANCE = "/settings/user/appearance";
export const SHORTCUTS = "/settings/user/shortcuts";
export const SETTINGS = "/settings";
export const USER_API = "/dms/pages/settings/user";
export const SIGNUP_LINK = /\/auth\/signup\?token=/;
export const SIGNED_IN = /^\/(?!auth)/;
export const CODE = /verification code is:\s*([A-Z0-9]{6})/;
export const ADMIN_NAME = "Verify Admin";
export const TWO_FACTOR_CODE_WINDOW_MS = 61_000;

export async function me(/** @type {Ctx} */ ctx, /** @type {string} */ label, /** @type {string} */ as = "admin") {
  const answer = await ctx.api(label, { method: "GET", path: "/api/auth/me", as });
  return answer;
}

export async function login(/** @type {Ctx} */ ctx, /** @type {string} */ label, /** @type {string} */ email, /** @type {string} */ password) {
  return ctx.api(label, { method: "POST", path: "/api/auth/login", as: "anon", body: { email, password } });
}

/** Another browser signed in as the run's administrator, as a second device. */
export async function secondDevice(/** @type {Ctx} */ ctx, /** @type {string} */ name = "admin2") {
  ctx.addAccount(name, { ...ctx.state.accounts.admin });
  const tab = await ctx.tab(name);
  await tab.signIn(name);
  return tab;
}

export async function typeCode(/** @type {Tab} */ tab, /** @type {string} */ code) {
  for (const [index, character] of Array.from(code).entries()) {
    await tab.fill({ role: "textbox", name: `pin input ${index + 1} of 6` }, character);
  }
}

/** The code of the first mail to `address` after `since` whose subject matches. */
export async function mailedCode(/** @type {Ctx} */ ctx, /** @type {string} */ address, /** @type {string} */ since, /** @type {RegExp} */ subject) {
  const mail = await ctx.mail(
    (message) =>
      message.to.some((to) => to.includes(address)) &&
      message.receivedAt > since &&
      subject.test(message.subject) &&
      CODE.test(message.text ?? ""),
  );
  await ctx.verify(`a code reaches ${address}`, [
    ctx.holds("a mail with a code arrived", mail.match, `${mail.messages.length} messages captured`),
  ], { critical: true });
  return { code: CODE.exec(mail.match.text)[1], mail: mail.match };
}

/** Changes the administrator's password through the API, which raises a Password changed alert when alerts are on. */
export async function changePasswordThroughApi(/** @type {Ctx} */ ctx) {
  const current = ctx.state.accounts.admin.password;
  const next = ctx.password();
  const answer = await ctx.api("change the password", {
    method: "POST",
    path: `${USER_API}/security/password`,
    body: { currentPassword: current, password: next },
  });
  await ctx.verify("the password change is accepted", [ctx.status(answer, 200)], { critical: true });
  ctx.addAccount("admin", { ...ctx.state.accounts.admin, password: next });
  return next;
}

export async function openPasswordForm(/** @type {Tab} */ tab) {
  await tab.goto(SECURITY);
  await tab.click({ role: "button", name: "Change password" });
}

/**
 * @param {Tab} tab
 * @param {{ current: string, next: string, confirm?: string }} passwords
 */
export async function fillPasswordForm(tab, { current, next, confirm = next }) {
  await tab.fill({ role: "textbox", name: "Current password" }, current);
  await tab.fill({ role: "textbox", name: "New password", exact: true }, next);
  await tab.fill({ role: "textbox", name: "Confirm new password" }, confirm);
}

export async function openEmailForm(/** @type {Tab} */ tab) {
  await tab.goto(SECURITY);
  await tab.click({ role: "button", name: "Change email" });
}

export async function submitEmailForm(/** @type {Tab} */ tab, { address, password }) {
  await tab.fill({ role: "textbox", name: "New email" }, address);
  await tab.fill({ role: "textbox", name: "Current password" }, password);
  await tab.click({ role: "button", name: "Change email", within: { role: "form", name: "Changing email" } });
}

/** Ticks a visually hidden radio or switch of the Appearance tiles through its label. */
export async function tick(/** @type {Tab} */ tab, /** @type {Parameters<Tab["page"]["getByRole"]>[0]} */ role, /** @type {string | RegExp} */ name) {
  await tab.page.getByRole(role, { name }).check({ force: true });
}

export async function expandSystem(/** @type {Tab} */ tab) {
  const toggle = tab.page.getByRole("button", { name: "Show System notifications" });
  if ((await toggle.count()) > 0) await toggle.click();
}

export async function htmlHasClass(/** @type {Tab} */ tab, /** @type {string} */ name) {
  return tab.page.evaluate((cls) => document.documentElement.classList.contains(cls), name);
}

export async function joinMember(/** @type {Ctx} */ ctx, /** @type {string} */ firstName) {
  const email = ctx.email(firstName.toLowerCase());
  const password = ctx.password();
  const roleName = ctx.unique("Support");
  await ctx.api("create a role", {
    method: "POST",
    path: "/dms/pages/settings/workspace/roles/create",
    body: { name: roleName, description: "", permissions: ["playground.reports.export"] },
  });
  const admin = await ctx.tab("admin");
  await admin.signIn("admin");
  await admin.goto("/settings/workspace/members");
  await admin.click({ role: "button", name: "Invite members" });
  await admin.fill({ role: "textbox", name: "Email addresses" }, email);
  await admin.press("Enter", { role: "textbox", name: "Email addresses" });
  await admin.click({ role: "combobox", name: "Team" });
  await admin.click({ role: "option", name: "Sales" });
  await admin.click({ role: "button", name: roleName, exact: true, within: { role: "group", name: "Roles" } });
  await admin.click({ role: "button", name: "Send invitations" });
  const mail = await ctx.mail((message) => message.to.some((to) => to.includes(email)) && message.links.some((/** @type {string} */ link) => SIGNUP_LINK.test(link)));
  const tab = await ctx.tab("anon", firstName.toLowerCase());
  await tab.goto(mail.match.links.find((/** @type {string} */ link) => SIGNUP_LINK.test(link)));
  await tab.fill({ role: "textbox", name: "First and last name" }, `${firstName} Member`);
  await tab.fill({ role: "textbox", name: "Password" }, password);
  await tab.click({ role: "button", name: "Create my account" });
  await ctx.verify(`${firstName} joined`, [tab.at(SIGNED_IN)], { critical: true });
  ctx.addAccount(firstName.toLowerCase(), { email, password });
  return { email, password, tab, admin };
}
