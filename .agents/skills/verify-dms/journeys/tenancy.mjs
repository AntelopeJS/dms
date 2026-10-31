/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const GATE = "/api/playground/gate-demo";
const TENANCY = "/tenancy";
const GATED_PAGE = "/settings/workspace/members";

async function refreshToken(/** @type {Ctx} */ ctx) {
  const admin = ctx.adminCredentials();
  const login = await ctx.api("sign in for a refresh token", {
    method: "POST",
    path: "/api/auth/login",
    as: "anon",
    body: { email: admin.email, password: admin.password },
  });
  return login.body?.refresh_token ?? "";
}

function switchTenant(/** @type {Ctx} */ ctx, label, token, tenantId) {
  return ctx.api(label, { method: "POST", path: "/api/auth/switch-tenant", as: "anon", body: { refreshToken: token, tenantId } });
}

/** The workspace a request is bound to, membership checks, and the tenant access gate. */
export const journeys = [
  {
    id: "default-workspace-membership",
    title: "onboarding makes the owner a member of the default workspace, and switching to a workspace it is not in answers 403",
    entryPoint: "POST /api/auth/switch-tenant, /api/tables/members/list",
    async run(/** @type {Ctx} */ ctx) {
      const members = await ctx.api("list the default workspace's members", { method: "GET", path: "/api/tables/members/list" });
      const rows = members.body?.results ?? [];
      await ctx.verify("the owner is the default workspace's only member", [
        ctx.equal("member ids", rows.map((row) => row._id.split(":")[0]), ["default"]),
        ctx.equal("owner", rows.map((row) => row.isTenantOwner), [true]),
      ]);
      const token = await refreshToken(ctx);
      const foreign = await switchTenant(ctx, "switch to a workspace the owner is not in", token, "verify-foreign-workspace");
      const home = await switchTenant(ctx, "switch back to the default workspace", token, "default");
      await ctx.verify("membership decides which workspace a session may enter", [
        ctx.status(foreign, 403),
        ctx.equal("error", foreign.body, "error.not_a_member"),
        ctx.status(home, 200),
        ctx.holds("new tokens for the default workspace", home.body?.access_token, Object.keys(home.body ?? {}).join(", ")),
      ]);
    },
  },
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
