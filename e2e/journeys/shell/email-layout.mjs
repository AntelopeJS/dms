import { readFileSync } from "node:fs";
import { invite, createRole, signupLink } from "../settings-members/steps.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const DEFAULT_DASHBOARD_PORT = 3001;
const SOFT_LINE_BREAK = /=\r?\n/g;
const HEX_ESCAPE = /=([0-9A-F]{2})/g;
/** What the DMS e-mail layout (`EmailLayout.vue`, `emailStyles`) writes inline and a standalone fallback does not. */
const LAYOUT_STYLES = ["background-color:#f6f9fc", "background-color:#ffffff", "border-radius:8px", "background-color:#18181b"];

/**
 * @param {string} raw A captured message
 * @returns {string} Its quoted-printable body, decoded
 */
function decodeBody(raw) {
  const bytes = raw.replace(SOFT_LINE_BREAK, "").replace(HEX_ESCAPE, (_match, /** @type {string} */ hex) => String.fromCharCode(Number.parseInt(hex, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}

/** The e-mail the DMS sends, rendered by the dashboard that serves the run. */
export const journeys = [
  {
    id: "email-renders-with-dms-layout",
    title: "with no htmlRender.renderEndpoint and the dashboard on a port other than 3001, an invitation e-mail carries the DMS e-mail layout the dashboard rendered",
    entryPoint: "Invite members dialog, POST /api/html/render of the dashboard, the captured invitation e-mail",
    async run(/** @type {Ctx} */ ctx) {
      const config = readFileSync(`${ctx.state.runPlayground ?? ctx.state.playground}/antelope.config.ts`, "utf8");
      await ctx.verify("the run sets no render endpoint and serves the dashboard on another port than 3001", [
        ctx.holds("the playground configures no renderEndpoint", !config.includes("renderEndpoint"), "antelope.config.ts names renderEndpoint"),
        ctx.holds("the run sets no render endpoint variable", !Object.keys(ctx.state.extraEnv).some((name) => /RENDER_ENDPOINT/i.test(name)), Object.keys(ctx.state.extraEnv).join(", ")),
        ctx.holds("the dashboard is not on 3001", ctx.state.webPort !== DEFAULT_DASHBOARD_PORT, ctx.state.webPort),
      ], { critical: true });
      const roleName = ctx.unique("Support");
      await createRole(ctx, roleName);
      const email = ctx.email("layout");
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await invite(admin, email, roleName);
      await signupLink(ctx, email);
      const mail = await ctx.mail((message) => message.to.some((to) => to.includes(email)));
      const html = mail.match ? decodeBody(readFileSync(mail.match.file, "utf8")) : "";
      await ctx.verify("the invitation is the e-mail the dashboard rendered with the DMS layout", [
        ctx.holds("the message holds a rendered HTML document", /<html[\s>]/i.test(html), html.slice(0, 300)),
        ...LAYOUT_STYLES.map((style) => ctx.holds(`the layout's ${style} style is inline`, html.replace(/;?\s+/g, "").includes(style), html.slice(0, 600))),
        ctx.holds("the heading and the button are the DMS e-mail's", /You're invited to|You&#x27;re invited to|You&#39;re invited to/i.test(html) && html.includes("Create Account"), html.slice(0, 600)),
        ctx.holds("the button opens the signup link", /href="[^"]*\/auth\/signup\?token=/.test(html), html.slice(0, 600)),
      ]);
    },
  },
];
