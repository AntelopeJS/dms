const root = "^packages/dms/src/";
const tiers = [
  ["routes", "dev", "page-extensions"],
  ["pages"],
  ["implementations"],
  ["store", "attachments", "realtime", "automation", "crons", "hooks"],
  ["db"],
  ["validation", "utils"],
  ["config"],
  ["types"],
];
const loaderEntries = [
  "dms/page",
  "dms/permissions",
  "dms/quick-actions",
  "dms/layout-banners",
  "dms/invite-extensions",
  "dms/permissions-resolver",
  "dms/tenant-access",
  "dms/saas-mode",
  "dms/attachments",
  "dms/realtime",
  "dms/uploads",
  "dms/guards",
  "dms-base/table-view",
  "dms-base/export-jobs",
  "dms-base/tenant-export-archive",
  "dms/client-base-url",
  "dms/api-base-url",
  "dms/client-ip",
];
const faces = {
  routes: ["oauth", "oauth-config", "authentication"],
  pages: ["account", "members", "permissions", "preview"],
  implementations: [
    "dms/services",
    "dms-base/services",
    "dms-auth/services",
    "dms-html-render/services",
    "dms-notifications/services",
  ],
  store: ["frontend"],
  utils: ["notification-tones"],
  config: ["startup-config", "client-origin-cors", "session-handoff"],
};

module.exports = {
  forbidden: [
    {
      name: "backend-unranked-folder",
      severity: "error",
      from: { path: root },
      to: {
        path: `${root}(?!(?:${[...tiers.flat(), "test"].join("|")})/)[^/]+/`,
      },
    },
    {
      name: "backend-no-composition-root",
      severity: "error",
      from: { path: `${root}(?:${tiers.flat().join("|")})/` },
      to: { path: `${root}[^/]+\\.[cm]?[jt]sx?$` },
    },
    {
      name: "backend-no-frontend",
      severity: "error",
      from: { path: root },
      to: { path: "^packages/dms/frontend-vue/" },
    },
    {
      name: "backend-interface-package-only",
      severity: "error",
      from: { path: root },
      to: { path: "^packages/interface-dms/src/" },
    },
    ...tiers.flatMap((tier, rank) =>
      tier.flatMap((name) => {
        const forbidden = tiers
          .slice(0, rank)
          .flat()
          .concat(tier.filter((peer) => peer !== name));
        if (forbidden.length === 0) return [];
        return [
          {
            name: `backend-${name}-no-upward`,
            severity: "error",
            from: { path: `${root}${name}/` },
            to: { path: `${root}(?:${forbidden.join("|")})/` },
          },
        ];
      }),
    ),
    ...tiers.flat().map((name) => ({
      name: `backend-${name}-entry-only`,
      severity: "error",
      from: { pathNot: `${root}${name}/` },
      to: {
        path: `${root}${name}/`,
        pathNot: [
          `${root}${name}/(?:index\\.ts|.+/index\\.ts)$`,
          ...(faces[name] ?? []).map((face) => `${root}${name}/${face}\\.ts$`),
          ...(name === "implementations"
            ? loaderEntries.map(
                (entry) => `${root}implementations/${entry}\\.ts$`,
              )
            : []),
        ],
      },
    })),
  ],
};
