const frontend = "packages/dms/frontend-vue";
const layersRoot = `${frontend}/layers`;
const layers = [
  { name: "core", rank: 0 },
  { name: "ui", rank: 1 },
  { name: "layout", rank: 2 },
  { name: "auth", rank: 3 },
  { name: "onboarding", rank: 4 },
];

module.exports = {
  forbidden: [
    ...layers.map(({ name }) => {
      const own = `${layersRoot}/dms-${name}`;
      return {
        name: `frontend-${name}-entry-only`,
        severity: "error",
        from: { path: `^${frontend}/(?!layers/dms-${name}/)` },
        to: {
          path: `^${own}/`,
          pathNot: `^${own}/app/(?!build(?:/|$))`,
        },
      };
    }),
    ...layers.flatMap(({ name, rank }) => {
      const forbidden = layers
        .filter((target) => target.name !== name && target.rank >= rank)
        .map((target) => target.name);
      return forbidden.length
        ? [
            {
              name: `frontend-${name}-no-upward`,
              severity: "error",
              from: { path: `^${layersRoot}/dms-${name}/` },
              to: {
                path: `^${layersRoot}/dms-(?:${forbidden.join("|")})/`,
              },
            },
          ]
        : [];
    }),
    {
      name: "frontend-no-dms-source",
      severity: "error",
      from: { path: `^${frontend}/` },
      to: { path: "^packages/dms/src(?:/|$)" },
    },
    {
      name: "frontend-no-dms-runtime",
      severity: "error",
      from: { path: `^${frontend}/` },
      to: { path: "^packages/dms/dist(?:/|$)" },
    },
    {
      name: "frontend-no-relative-package-dist",
      severity: "error",
      from: { path: `^${frontend}/` },
      to: {
        path: "^packages/[^/]+/dist(?:/|$)",
        dependencyTypes: ["local"],
      },
    },
    {
      name: "frontend-no-relative-interface-dms",
      severity: "error",
      from: { path: `^${frontend}/` },
      to: {
        path: "^packages/interface-dms(?:/|$)",
        dependencyTypes: ["local"],
      },
    },
  ],
};
