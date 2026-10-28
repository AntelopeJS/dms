const source = "packages/dms/playground/src/";
const tiers = [
  ["sections.ts"],
  [
    "demo-module",
    "drawer-modal",
    "emails",
    "examples",
    "flow-canvas",
    "foundations",
    "frontend-modules",
    "grid",
    "hooks",
    "layout-banners",
    "multi-component",
    "navigation",
    "nested",
    "notification",
    "page-access",
    "page-header",
    "permissions",
    "plain-module",
    "primitives",
    "realtime",
    "stack",
    "table-view",
    "tabs",
  ],
  ["blocks", "feature-index", "form", "page-extension", "tenancy"],
  ["chart", "quick-actions"],
  ["index.ts"],
];

const modules = tiers.flatMap((names, rank) =>
  names.map((name) => ({ name, rank })),
);
const modulePath = (name) =>
  `${source}${name.endsWith(".ts") ? name.replaceAll(".", "\\.") + "$" : name + "/"}`;

module.exports = {
  forbidden: [
    {
      name: "playground-source-no-own-dist",
      severity: "error",
      from: { path: "^packages/dms/playground/(?:src|frontend-vue)/" },
      to: { path: "^packages/dms/playground/dist/" },
    },
    {
      name: "playground-package-specifiers-only",
      severity: "error",
      from: { path: "^packages/dms/playground/" },
      to: {
        path: "^packages/",
        pathNot:
          "^packages/dms/(?:playground/|frontend-vue/layers/dms-(?:core|ui|layout|auth|onboarding)/app/(?!dist/|.*/dist/))",
        dependencyTypes: ["local"],
      },
    },
    {
      name: "playground-frontend-aliases-only",
      severity: "error",
      from: { path: "^packages/dms/playground/" },
      to: {
        path: "^packages/dms/frontend-vue/layers/",
        dependencyTypesNot: ["aliased-tsconfig"],
      },
    },
    {
      name: "playground-no-private-package-source",
      severity: "error",
      from: { path: "^packages/dms/playground/" },
      to: { path: "^packages/(?:dms/src|interface-dms/src)/" },
    },
    {
      name: "playground-server-no-frontend",
      severity: "error",
      from: { path: `^${source}` },
      to: { path: "^packages/dms/(?:playground/)?frontend-vue/" },
    },
    ...modules.flatMap(({ name, rank }) => {
      const rejected = modules.filter(
        (target) => target.name !== name && target.rank >= rank,
      );
      return rejected.length
        ? [
            {
              name: `playground-${name.replaceAll(".", "-")}-no-upward`,
              severity: "error",
              from: { path: `^${modulePath(name)}` },
              to: {
                path: `^(?:${rejected.map((target) => modulePath(target.name)).join("|")})`,
              },
            },
          ]
        : [];
    }),
  ],
};
