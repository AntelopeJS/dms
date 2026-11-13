import { createRole, joinedMember } from "./settings-members/steps.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const ROUTES = ["/api/mockup", "/api/mockup/schema", "/api/mockup/orders/annotations"];
const NOTE = { page: "home", path: "/pages/0/tree/0", text: "Not mine" };

/**
 * Sends every mockup route's request as `as`, a read for each route and a
 * comment on the `orders` mockup.
 *
 * @param {Ctx} ctx
 * @param {string} as The account, or `anon`
 */
async function everyRoute(ctx, as) {
  const answers = [];
  for (const path of ROUTES) {
    answers.push(await ctx.api(`GET ${path} as ${as}`, { method: "GET", path, as }));
  }
  answers.push(
    await ctx.api(`POST a comment as ${as}`, { method: "POST", path: ROUTES[2], body: NOTE, as }),
  );
  return answers;
}

/** The development-only mockup engine, seen from a run's backend. */
export const journeys = [
  {
    id: "mockup-absent-outside-dev",
    title: "a backend started from a build serves no mockup route",
    entryPoint: "/api/mockup",
    backend: "production",
    async run(/** @type {Ctx} */ ctx) {
      const answers = [];
      for (const path of ROUTES) {
        answers.push(await ctx.api(`GET ${path} as the admin`, { method: "GET", path }));
      }
      await ctx.verify(
        "every mockup route answers 404",
        answers.map((answer) => ctx.status(answer, 404)),
      );
    },
  },
  {
    id: "mockup-owner-only-in-dev",
    title: "in development, the mockup routes serve the platform owner and refuse anyone else",
    entryPoint: "/api/mockup",
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      const owner = await ctx.api("GET /api/mockup as the owner", { method: "GET", path: ROUTES[0] });
      const schema = await ctx.api("GET /api/mockup/schema as the owner", { method: "GET", path: ROUTES[1] });
      await ctx.verify("the owner reads the mockup list and the spec schema", [
        ctx.status(owner, 200),
        ctx.status(schema, 200),
      ]);

      const visitor = await everyRoute(ctx, "anon");
      await ctx.verify(
        "a caller with no session gets 401 on every route",
        visitor.map((answer) => ctx.status(answer, 401)),
      );

      const roleName = ctx.unique("Designer");
      await createRole(ctx, roleName);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await joinedMember(ctx, admin, { firstName: "Mia", roleName });
      const member = await everyRoute(ctx, "mia");
      await ctx.verify(
        "a signed-in member who is not the owner gets 403 on every route",
        member.map((answer) => ctx.status(answer, 403)),
      );
    },
  },
];
