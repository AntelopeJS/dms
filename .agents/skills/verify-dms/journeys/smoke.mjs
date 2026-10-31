/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const MEMBERS = "/settings/workspace/members";
const INVITATIONS = "/settings/workspace/invites";

/** The fixed smoke journey: onboard, sign in, invite a member, reload. */
export const journeys = [
  {
    id: "smoke",
    title: "a fresh platform onboards, its admin signs in, invites a member, and the invitation survives a reload",
    entryPoint: "POST /api/onboarding/register, then the sign-in form and Settings > Members > Invite members",
    async run(/** @type {Ctx} */ ctx) {
      const email = ctx.email("member");
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(MEMBERS);
      await tab.click({ role: "button", name: "Invite members" });
      await tab.fill({ role: "textbox", name: "Email addresses" }, email);
      await tab.press("Enter", { role: "textbox", name: "Email addresses" });
      await tab.click({ role: "combobox", name: "Team" });
      await tab.click({ role: "option", name: "Sales" });
      await tab.click({ role: "switch", name: "Make workspace owner" });
      await tab.click({ role: "button", name: "Send invitations" });
      await ctx.verify("the invitation is sent and listed", [
        tab.shows(/Invitations sent/),
        tab.at(new RegExp(`^${INVITATIONS}$`)),
        tab.visible({ role: "cell", name: email }),
      ]);
      await tab.reload();
      await ctx.verify("the invitation is still listed after a reload", [
        tab.visible({ role: "cell", name: email }),
      ]);
      const list = await ctx.api("list the invitations", { method: "GET", path: "/api/tables/admin-invites/list" });
      const invite = list.body?.results?.find((entry) => entry.email === email);
      await ctx.verify("the API holds the invitation as an owner invite", [
        ctx.status(list, 200),
        ctx.holds("one pending invitation for the address", invite, JSON.stringify(list.body?.results)),
        ctx.equal("it makes a workspace owner", invite?.asTenantOwner, true),
      ]);
      const mail = await ctx.mail((message) => message.to.some((to) => to.includes(email)));
      await ctx.verify("the invitee gets an email with a signup link", [
        ctx.holds("an email reached the invitee", mail.match, `${mail.messages.length} messages captured`),
        ctx.holds("it links to /auth/signup with a token", mail.match?.links.some((/** @type {string} */ link) => /\/auth\/signup\?token=/.test(link)), JSON.stringify(mail.match?.links)),
      ]);
    },
  },
];
