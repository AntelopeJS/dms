/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const ROUTES = ["/api/mockup", "/api/mockup/schema", "/api/mockup/orders/annotations"];

/** The development-only mockup engine, seen from a run's built backend. */
export const journeys = [
  {
    id: "mockup-absent-outside-dev",
    title: "a backend started from a build serves no mockup route",
    entryPoint: "/api/mockup",
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
];
