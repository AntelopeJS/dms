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
  ["json.ts"],
];
/** The files under `internal/` that stand behind each public unit. */
const internals = new Map(
  Object.entries({
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
  }),
);
/**
 * @param {string} text
 * @returns {string}
 */
const escape = (text) => text.replaceAll(".", "\\.");
/**
 * @param {string} unit
 * @returns {string[]}
 */
const unitPaths = (unit) =>
  unit.endsWith("/")
    ? [`${root}${unit}`]
    : [
        `${root}${escape(unit)}$`,
        ...(internals.get(unit) ?? []).map(
          (file) => `${root}internal/${escape(file)}\\.ts$`,
        ),
      ];
/**
 * @param {string} unit
 * @returns {string}
 */
const slug = (unit) => unit.replace(/\/$/, "").replaceAll(".", "-");
const rankedPaths = tiers.flat().flatMap(unitPaths);

/** @type {import("../.dependency-cruiser.cjs").Area} */
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
        return [
          {
            name: `interface-dms-${slug(unit)}-no-upward`,
            severity: "error",
            from: { path: unitPaths(unit) },
            to: { path: forbidden },
          },
        ];
      }),
    ),
  ],
};
