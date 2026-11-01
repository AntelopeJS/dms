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

export async function me(ctx, label, as = "admin") {
  const answer = await ctx.api(label, { method: "GET", path: "/api/auth/me", as });
  return answer;
}

export async function login(ctx, label, email, password) {
  return ctx.api(label, { method: "POST", path: "/api/auth/login", as: "anon", body: { email, password } });
}

/** Another browser signed in as the run's administrator, as a second device. */
export async function secondDevice(ctx, name = "admin2") {
  ctx.addAccount(name, { ...ctx.state.accounts.admin });
  const tab = await ctx.tab(name);
  await tab.signIn(name);
  return tab;
}

export async function typeCode(tab, code) {
  for (const [index, character] of [...code].entries()) {
    await tab.fill({ role: "textbox", name: `pin input ${index + 1} of 6` }, character);
  }
}

/** The code of the first mail to `address` after `since` whose subject matches. */
export async function mailedCode(ctx, address, since, subject) {
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
export async function changePasswordThroughApi(ctx) {
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

export async function openPasswordForm(tab) {
  await tab.goto(SECURITY);
  await tab.click({ role: "button", name: "Change password" });
}

export async function fillPasswordForm(tab, { current, next, confirm = next }) {
  await tab.fill({ role: "textbox", name: "Current password" }, current);
  await tab.fill({ role: "textbox", name: "New password", exact: true }, next);
  await tab.fill({ role: "textbox", name: "Confirm new password" }, confirm);
}

export async function openEmailForm(tab) {
  await tab.goto(SECURITY);
  await tab.click({ role: "button", name: "Change email" });
}

export async function submitEmailForm(tab, { address, password }) {
  await tab.fill({ role: "textbox", name: "New email" }, address);
  await tab.fill({ role: "textbox", name: "Current password" }, password);
  await tab.click({ role: "button", name: "Change email", within: { role: "form", name: "Changing email" } });
}

/** Ticks a visually hidden radio or switch of the Appearance tiles through its label. */
export async function tick(tab, role, name) {
  await tab.page.getByRole(role, { name }).check({ force: true });
}

export async function expandSystem(tab) {
  const toggle = tab.page.getByRole("button", { name: "Show System notifications" });
  if ((await toggle.count()) > 0) await toggle.click();
}

export async function htmlHasClass(tab, name) {
  return tab.page.evaluate((cls) => document.documentElement.classList.contains(cls), name);
}

export async function joinMember(ctx, firstName) {
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
  const mail = await ctx.mail((message) => message.to.some((to) => to.includes(email)) && message.links.some((link) => SIGNUP_LINK.test(link)));
  const tab = await ctx.tab("anon", firstName.toLowerCase());
  await tab.goto(mail.match.links.find((link) => SIGNUP_LINK.test(link)));
  await tab.fill({ role: "textbox", name: "First and last name" }, `${firstName} Member`);
  await tab.fill({ role: "textbox", name: "Password" }, password);
  await tab.click({ role: "button", name: "Create my account" });
  await ctx.verify(`${firstName} joined`, [tab.at(SIGNED_IN)], { critical: true });
  ctx.addAccount(firstName.toLowerCase(), { email, password });
  return { email, password, tab, admin };
}
