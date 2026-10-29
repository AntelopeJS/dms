const root = "^packages/interface-dms/src/";
const tiers = [
  ["index.ts"],
  ["invites.ts"],
  ["invite-resolution.ts", "invite-extensions.ts"],
  [
    "data-controllers/",
    "invite-extensions/",
    "layout-banners.ts",
    "notifications/",
    "quick-actions.ts",
  ],
  ["tenant-ownership.ts"],
  ["tenant-members.ts"],
  ["tenant-lifecycle.ts", "tenant-provisioning.ts"],
  ["base/"],
  ["page.ts"],
  ["page/"],
  ["guards.ts", "permission-gate.ts", "component-options/"],
  ["component.ts"],
  ["component-slots.ts", "permissions.ts"],
  ["permissions-resolver.ts", "tenant-scoped-model.ts"],
  ["db/", "request-tenant.ts"],
  ["auth/"],
  ["hooks.ts"],
  [
    "tenant-export.ts",
    "attachments.ts",
    "realtime.ts",
    "uploads.ts",
    "tenant-access.ts",
    "utils/",
    "constants.ts",
    "types.ts",
    "html-render/",
    "client-ip.ts",
    "client-base-url.ts",
    "api-base-url.ts",
    "invitee-display-name.ts",
    "tones.ts",
    "watch-actions.ts",
    "export-status.ts",
    "invite-extension-payloads.ts",
  ],
];
const internals = {
  "attachments.ts": ["attachments"],
  "component.ts": [
    "component-builder",
    "component-permissions",
    "component-serialization",
    "component-watches",
  ],
  "component-slots.ts": ["component-slots"],
  "invite-resolution.ts": [
    "invite-membership",
    "invite-replacement",
    "invite-resolution",
  ],
  "invites.ts": ["invites"],
  "permission-gate.ts": ["permission-gate"],
  "permissions.ts": ["permission-ids", "permission-requirements"],
  "tenant-access.ts": ["tenant-access"],
  "tenant-ownership.ts": ["member-changes", "tenant-ownership"],
  "uploads.ts": ["uploads"],
};
const typeOnlyCycles = [
  {
    name: "interface-dms-component-page-metadata-type-cycle",
    comment:
      "Component and ComponentBuilder name the PageMetadata class in their published onCreated callback types, while page/ loads Component at runtime. Only the type-only import of page.ts by component.ts may cross upward; AntelopeJS/dms#531 removes it in the next breaking release.",
    from: "component.ts",
    to: "page.ts",
  },
  {
    name: "interface-dms-user-avatar-data-types-type-cycle",
    comment:
      "The published User table declares avatar as DefaultDataTypes.ImageValue, a member of the data-type namespace in base/, while base/ builds on component.ts, which names User. Only this type-only import may cross upward; AntelopeJS/dms#531 removes it in the next breaking release.",
    from: "auth/db/tables/users.table.ts",
    to: "base/data-types/default-types.ts",
  },
];

const escape = (text) => text.replaceAll(".", "\\.");
const unitPaths = (unit) =>
  unit.endsWith("/")
    ? [`${root}${unit}`]
    : [
        `${root}${escape(unit)}$`,
        ...(internals[unit] ?? []).map(
          (file) => `${root}internal/${escape(file)}\\.ts$`,
        ),
      ];
const slug = (unit) => unit.replace(/\/$/, "").replaceAll(".", "-");
const rankedPaths = tiers.flat().flatMap(unitPaths);
const filePath = (file) => `${root}${escape(file)}$`;

module.exports = {
  forbidden: [
    {
      name: "interface-dms-unranked-target",
      severity: "error",
      from: { path: root },
      to: { path: root, pathNot: rankedPaths },
    },
    {
      name: "interface-dms-unranked-source",
      severity: "error",
      from: { path: root, pathNot: rankedPaths },
      to: { path: root },
    },
    {
      name: "interface-dms-no-dms-package",
      severity: "error",
      from: { path: root },
      to: { path: "^packages/dms/" },
    },
    ...tiers.flatMap((tier, rank) =>
      tier.flatMap((unit) => {
        const forbidden = tiers
          .slice(0, rank)
          .flat()
          .concat(tier.filter((peer) => peer !== unit))
          .flatMap(unitPaths);
        if (forbidden.length === 0) return [];
        const name = `interface-dms-${slug(unit)}-no-upward`;
        const cycles = typeOnlyCycles.filter(({ from }) =>
          unitPaths(unit).some((path) =>
            new RegExp(path).test(`${root.slice(1)}${from}`),
          ),
        );
        if (cycles.length === 0) {
          return [
            {
              name,
              severity: "error",
              from: { path: unitPaths(unit) },
              to: { path: forbidden },
            },
          ];
        }
        return [
          {
            name,
            severity: "error",
            from: {
              path: unitPaths(unit),
              pathNot: cycles.map(({ from }) => filePath(from)),
            },
            to: { path: forbidden },
          },
          ...cycles.flatMap((cycle) => [
            {
              name,
              severity: "error",
              from: { path: filePath(cycle.from) },
              to: { path: forbidden, pathNot: filePath(cycle.to) },
            },
            {
              name: cycle.name,
              comment: cycle.comment,
              severity: "error",
              from: { path: filePath(cycle.from) },
              to: {
                path: filePath(cycle.to),
                dependencyTypesNot: ["type-only"],
              },
            },
          ]),
        ];
      }),
    ),
  ],
};
