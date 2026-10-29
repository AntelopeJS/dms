/** A kind of one-way door. */
export type DoorKind = "data" | "format" | "contract" | "outbound" | "exposure" | "publish";

/** Path rules for one door kind: globs, declared funnel modules, and the journeys, as `feature/journey`, that contain it. */
export interface DoorRule {
  globs: string[];
  funnels: string[];
  containments: string[];
  why: string;
}

/** A formal check: the source files it covers, the command that runs it, and how its output names a violated rule. */
export interface FormalCheck {
  name: string;
  covers: string[];
  command: string[];
  violation: RegExp | null;
}

/** The repo-owned layer of the verification skill, read by `dms-control`. */
export interface VerifyConfig {
  playground: string;
  prepare: string[][];
  userFacing: string[];
  notUserFacing: string[];
  smoke: string;
  smokeJourney: string;
  doors: Record<DoorKind, DoorRule | null>;
  formal: FormalCheck[];
}

const config: VerifyConfig = {
  playground: "packages/dms/playground",
  prepare: [
    ["pnpm", "install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    ["pnpm", "--dir", "packages/dms", "build"],
    ["pnpm", "--dir", "packages/dms/playground", "build"],
  ],
  userFacing: ["packages/dms/src/**", "packages/dms/frontend-vue/**", "packages/interface-dms/src/**"],
  notUserFacing: [
    "packages/dms/src/test/**",
    "packages/dms/frontend-vue/tests/**",
    "packages/dms/frontend-vue/eslint*.mjs",
    "packages/dms/frontend-vue/vitest.config.ts",
    "packages/dms/frontend-vue/.*",
    "packages/dms/frontend-vue/.vscode/**",
    "packages/dms/frontend-vue/pnpm-*.yaml",
    "packages/interface-dms/src/**/*.test.ts",
  ],
  smoke: "smoke",
  smokeJourney: "onboard → login → invite a member → reload",
  doors: {
    data: {
      globs: [
        "packages/dms/src/crons/**",
        "packages/dms/src/hooks/tenant-deleted.ts",
        "packages/dms/src/pages/settings/users/member-management.ts",
        "packages/dms/src/pages/settings/users/account-data*.ts",
        "packages/dms/src/validation/account-deletion.schema.ts",
        "packages/dms/src/implementations/dms-base/bulk-selection.ts",
        "packages/dms/src/utils/export-jobs*.ts",
        "packages/interface-dms/src/tenant-lifecycle.ts",
      ],
      funnels: [],
      containments: ["settings-members/remove-member-shows-impact", "module-pages/table-delete-record"],
      why: "these delete members, accounts, invitations, sessions, exports or workspace rows, which a revert does not bring back",
    },
    format: {
      globs: [
        "packages/dms/src/db/tables/**",
        "packages/dms/src/db/models/**",
        "packages/interface-dms/src/db/**",
        "packages/interface-dms/src/auth/db/**",
        "packages/dms/src/implementations/dms-auth/token-*.ts",
        "packages/interface-dms/src/auth/internal/request-principal.ts",
        "packages/dms/frontend-vue/layers/dms-auth/server/session.ts",
        "packages/dms/frontend-vue/layers/dms-core/app/build/composables/user/preferencesCookie.ts",
      ],
      funnels: [],
      containments: ["auth/base-written-data-upgrade"],
      why: "stored documents, JWT claims and the session cookie must stay readable by the next version",
    },
    contract: {
      globs: [
        "packages/interface-dms/src/**",
        "packages/interface-dms/package.json",
        "packages/dms/package.json",
        "packages/dms/src/routes/**",
        "packages/dms/src/config/**",
        "packages/dms/bin/dms-control.mjs",
        "packages/dms/frontend-vue/layers/*/app/entries/**",
      ],
      funnels: [],
      containments: [],
      why: "module authors import the interface, call the HTTP routes and set the config keys and env vars; dms-* repositories run dms-control",
    },
    outbound: {
      globs: [
        "packages/dms/src/implementations/dms-auth/account-emails.ts",
        "packages/dms/src/implementations/dms-auth/email-templates.ts",
        "packages/dms/src/utils/*-email.ts",
        "packages/dms/src/utils/*-mail.ts",
        "packages/dms/src/automation/actions.ts",
        "packages/dms/src/automation/send-notification.ts",
        "packages/dms/src/routes/auth/oauth/token-exchange.ts",
        "packages/dms/src/routes/auth/oauth/providers.ts",
        "packages/dms/src/store/catalog.ts",
        "packages/dms/src/store/operations.ts",
        "packages/dms/frontend-vue/layers/dms-layout/app/emails/**",
      ],
      funnels: ["packages/dms/src/implementations/dms-auth/account-emails.ts"],
      containments: [],
      why: "these send email to people, call OAuth providers or the npm registry, and install packages",
    },
    exposure: {
      globs: [
        "packages/dms/src/implementations/dms/permissions*.ts",
        "packages/dms/src/implementations/dms/permission-preview.ts",
        "packages/dms/src/implementations/dms/guards.ts",
        "packages/dms/src/implementations/dms/tenant-access.ts",
        "packages/dms/src/routes/authentication.ts",
        "packages/dms/src/routes/auth/me.ts",
        "packages/dms/src/routes/block-preview.ts",
        "packages/dms/src/routes/store.ts",
        "packages/dms/src/utils/page-access.ts",
        "packages/interface-dms/src/permissions*.ts",
        "packages/interface-dms/src/permission-gate.ts",
        "packages/interface-dms/src/guards.ts",
        "packages/interface-dms/src/tenant-access.ts",
        "packages/interface-dms/src/request-tenant.ts",
        "packages/interface-dms/src/auth/internal/**",
        "packages/interface-dms/src/data-controllers/**",
      ],
      funnels: [],
      containments: [],
      why: "roles, guards, tenancy checks and API responses decide who sees which data",
    },
    publish: {
      globs: [
        "packages/dms/package.json",
        "packages/interface-dms/package.json",
        "packages/*/.release-it.json",
        ".github/workflows/release*.yml",
        "checks/release-range.mjs",
      ],
      funnels: [],
      containments: [],
      why: "the package names, their files, their interface range and the release workflows claim names in the npm registry",
    },
  },
  formal: [
    {
      name: "formal-onboarding-bootstrap",
      covers: [
        "packages/dms/src/routes/onboarding.ts",
        "packages/dms/src/db/models/systemState.model.ts",
        "packages/dms/src/db/tables/systemState.table.ts",
        "packages/interface-dms/src/auth/db/tables/users.table.ts",
        "packages/interface-dms/src/tenant-ownership.ts",
        "packages/interface-dms/src/internal/tenant-ownership.ts",
        "packages/dms/src/routes/auth/oauth/callback.ts",
        "packages/dms/src/routes/auth/oauth/linking-policy.ts",
        "packages/dms/src/routes/auth/oauth/identity-resolution.ts",
        "packages/dms/src/routes/auth/oauth/config.ts",
        "packages/dms/src/routes/auth/signup.ts",
      ],
      command: ["node", ".agents/skills/formal-onboarding-bootstrap/check.mjs", "--full"],
      violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
    },
    {
      name: "formal-release-range",
      covers: ["checks/release-range.mjs", "checks/release-range.test.mjs", ".github/workflows/release.yml"],
      command: ["node", "--test", "--test-reporter=tap", "checks/release-range.test.mjs"],
      violation: /^not ok \d+ - (.+?)(?: # TODO.*)?$/gm,
    },
  ],
};

export default config;
