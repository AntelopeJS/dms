/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 */

const GATE = "/api/playground/gate-demo";
const TENANCY = "/tenancy";
const GATED_PAGE = "/settings/workspace/members";

/** The workspace a request is bound to, membership checks, and the tenant access gate. */
export const journeys = [
  {
    id: "suspended-workspace-gate",
    title: "suspending the workspace makes gated pages refuse the owner while the recovery page still answers, and restoring it reopens them",
    entryPoint: "/tenancy header action, RegisterTenantAccessGate",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(TENANCY);
      await tab.click({ role: "button", name: "Suspend / restore the workspace" });
      await ctx.verify("the toggle confirms", [tab.shows(/Gate toggled/)]);
      const refused = await ctx.api("read the members while suspended", { method: "GET", path: "/api/tables/members/list" });
      const status = await ctx.api("read the gate status", { method: "GET", path: `${GATE}/status` });
      await ctx.verify("gated routes refuse with the gate's code, the bypassing one answers", [
        ctx.status(refused, 403),
        ctx.equal("code", refused.body, "playground.gate_demo.suspended"),
        ctx.status(status, 200),
        ctx.holds("the gate says denied", JSON.stringify(status.body).includes("Denied"), JSON.stringify(status.body)),
      ]);
      await tab.goto(GATED_PAGE);
      await ctx.verify("a gated page does not show its content", [
        tab.visible({ role: "table", name: "Members list" }, { hidden: true, timeoutMs: 5_000 }),
      ]);
      await tab.goto(TENANCY);
      await ctx.verify("the recovery page still opens", [tab.visible({ role: "button", name: "Suspend / restore the workspace" })]);
      await tab.click({ role: "button", name: "Suspend / restore the workspace" });
      const restored = await ctx.api("read the members once restored", { method: "GET", path: "/api/tables/members/list" });
      await tab.goto(GATED_PAGE);
      await ctx.verify("restoring the workspace reopens the gated page", [
        ctx.status(restored, 200),
        tab.visible({ role: "table", name: "Members list" }),
      ]);
    },
  },
  {
    id: "tenant-routes-refuse-visitors",
    title: "tenant-scoped routes refuse a caller without a session",
    entryPoint: "AuthTenantMember guards",
    async run(/** @type {Ctx} */ ctx) {
      const members = await ctx.api("list members anonymously", { method: "GET", path: "/api/tables/members/list", as: "anon" });
      const gate = await ctx.api("read the gate status anonymously", { method: "GET", path: `${GATE}/status`, as: "anon" });
      const toggle = await ctx.api("toggle the gate anonymously", { method: "POST", path: `${GATE}/toggle`, as: "anon" });
      const after = await ctx.api("the gate is still open", { method: "GET", path: "/api/tables/members/list" });
      await ctx.verify("no tenant data or action without a member session", [
        ctx.holds("members refused", [401, 403].includes(members.status), members.status),
        ctx.holds("status refused", [401, 403].includes(gate.status), gate.status),
        ctx.holds("toggle refused", [401, 403].includes(toggle.status), toggle.status),
        ctx.status(after, 200),
      ]);
    },
  },
];
