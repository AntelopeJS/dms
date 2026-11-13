/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const THEME = "/api/branding/theme";
const REQUESTS = [
  { method: "GET", path: THEME },
  { method: "PUT", path: THEME, body: { draft: { variables: { shared: {}, light: {}, dark: {} }, colors: {}, logos: {} } } },
  { method: "POST", path: `${THEME}/layer` },
];

/** The development-only Branding editor's routes, seen from a run's built backend. */
export const journeys = [
  {
    id: "branding-absent-outside-dev",
    title: "a backend started from a build serves no branding route",
    entryPoint: "/api/branding/theme",
    async run(/** @type {Ctx} */ ctx) {
      const answers = [];
      for (const request of REQUESTS) {
        answers.push(await ctx.api(`${request.method} ${request.path} as the admin`, request));
      }
      await ctx.verify(
        "every branding route answers 404",
        answers.map((answer) => ctx.status(answer, 404)),
      );
    },
  },
];
