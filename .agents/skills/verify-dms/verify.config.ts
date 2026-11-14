/** A kind of one-way door. */
export type DoorKind = "data" | "format" | "contract" | "outbound" | "exposure" | "publish";

/** Path rules for one door kind: globs and declared funnel modules. */
export interface DoorRule {
  globs: string[];
  funnels: string[];
  why: string;
}

/**
 * How the gate decides whether a diff changed what the covered code does:
 * `emit` compares the JavaScript statements of the covered files on the
 * base and on HEAD (types, comments, formatting, imports and export
 * keywords left out); `probe` runs a command on a checkout of each, the
 * checkout's path as last argument, and compares what it prints.
 */
export type Behaviour = { kind: "emit" } | { kind: "probe"; command: string[] };

/**
 * A formal check: the source files it covers, the check's own files, the
 * command that runs it, how its output names a violated and a passing rule,
 * how the gate decides that a diff changed the covered behaviour, and the
 * command run on the base when it did or when the check's own files changed
 * (`command` when absent).
 */
export interface FormalCheck {
  name: string;
  covers: string[];
  files: string[];
  command: string[];
  baseCommand?: string[];
  violation: RegExp | null;
  passing: RegExp | null;
  behaviour: Behaviour;
}

/** The repo-owned layer of the verification skill, read by `dms-control`. */
export interface VerifyConfig {
  /** The playground folder: relative to the repository root, or absolute for a playground that lives in another checkout. */
  playground: string;
  /** The built `@antelopejs/dms-frontend` checkout the run serves, relative to the repository root, when this repository is the renderer. Absent: the playground's installed one. */
  renderer?: string;
  prepare: string[][];
  userFacing: string[];
  notUserFacing: string[];
  /** Globs of the files every feature depends on: manifests, lockfiles, the interface contract and the config. A diff that changes one runs every feature, not only the ones whose `covers:` it touches. */
  shared: string[];
  /** Globs of files under `shared` that no feature depends on, such as tests and fixtures. */
  notShared: string[];
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
    "packages/dms/frontend-vue/eslint*.d.mts",
    "packages/dms/frontend-vue/vitest.config.ts",
    "packages/dms/frontend-vue/.*",
    "packages/dms/frontend-vue/.vscode/**",
    "packages/dms/frontend-vue/pnpm-*.yaml",
    "packages/interface-dms/src/**/*.test.ts",
  ],
  shared: [
    "**/package.json",
    "**/pnpm-*.yaml",
    "**/.npmrc",
    ".nvmrc",
    "tsconfig.json",
    "packages/dms/tsconfig.json",
    "packages/interface-dms/tsconfig.json",
    "packages/dms/playground/tsconfig.json",
    "packages/dms/playground/frontend-vue/tsconfig.json",
    "packages/dms/playground/antelope.config.ts",
    "packages/dms/frontend-vue/dms.*.ts",
    "packages/dms/playground/frontend-vue/dms.*.ts",
    "packages/dms/src/config/**",
    "packages/interface-dms/src/**",
    ".agents/skills/verify-dms/verify.config.ts",
  ],
  notShared: ["packages/dms/test-hosts/**", "packages/interface-dms/src/**/*.test.ts"],
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
        "packages/dms/src/db/models/setupToken.model.ts",
        "packages/dms/src/db/tables/setupToken.table.ts",
        "packages/interface-dms/src/auth/db/tables/users.table.ts",
        "packages/interface-dms/src/tenant-ownership.ts",
        "packages/interface-dms/src/internal/tenant-ownership.ts",
        "packages/dms/src/routes/auth/oauth/callback.ts",
        "packages/dms/src/routes/auth/oauth/linking-policy.ts",
        "packages/dms/src/routes/auth/oauth/identity-resolution.ts",
        "packages/dms/src/routes/auth/oauth/config.ts",
        "packages/dms/src/routes/auth/signup.ts",
      ],
      files: [".agents/skills/formal-onboarding-bootstrap/**"],
      command: ["node", ".agents/skills/formal-onboarding-bootstrap/check.mjs", "--full"],
      baseCommand: ["node", ".agents/skills/formal-onboarding-bootstrap/check.mjs"],
      violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
      passing: /(?<=^holds +(?:\w+, )*)(\w+)(?=,| \()/gm,
      behaviour: { kind: "emit" },
    },
    {
      name: "formal-tenant-lifecycle",
      covers: [
        "packages/interface-dms/src/tenant-lifecycle.ts",
        "packages/interface-dms/src/tenant-members.ts",
        "packages/interface-dms/src/db/internal/tenantLifecycle.model.ts",
        "packages/interface-dms/src/db/internal/tenantLifecycle.table.ts",
        "packages/dms/src/hooks/tenant-deleted.ts",
      ],
      files: [".agents/skills/formal-tenant-lifecycle/**"],
      command: ["node", ".agents/skills/formal-tenant-lifecycle/check.mjs", "--full"],
      baseCommand: ["node", ".agents/skills/formal-tenant-lifecycle/check.mjs"],
      violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
      passing: /(?<=^holds +(?:\w+, )*)(\w+)(?=,| \()/gm,
      behaviour: { kind: "emit" },
    },
    {
      name: "formal-default-tenant-provisioning",
      covers: [
        "packages/dms/src/utils/ensure-default-tenant.ts",
        "packages/dms/src/index.ts",
        "packages/interface-dms/src/tenant-provisioning.ts",
        "packages/interface-dms/src/db/tables/tenants.table.ts",
      ],
      files: [".agents/skills/formal-default-tenant-provisioning/**"],
      command: ["node", ".agents/skills/formal-default-tenant-provisioning/check.mjs", "--full"],
      baseCommand: ["node", ".agents/skills/formal-default-tenant-provisioning/check.mjs"],
      violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
      passing: /(?<=^holds +(?:\w+, )*)(\w+)(?=,| \()/gm,
      behaviour: { kind: "emit" },
    },
    {
      name: "formal-realtime-tabs",
      covers: [
        "packages/dms/src/routes/realtime.ts",
        "packages/dms/src/realtime/broker.ts",
        "packages/dms/src/realtime/index.ts",
        "packages/dms/src/realtime/sessions.ts",
        "packages/dms/src/realtime/sse.ts",
        "packages/dms/src/realtime/registry.ts",
        "packages/dms/src/realtime/table-view.ts",
        "packages/dms/src/implementations/dms/realtime.ts",
        "packages/dms/src/implementations/dms-base/table-view.ts",
        "packages/interface-dms/src/base/table-view/internal/realtime.ts",
        "packages/dms/frontend-vue/layers/dms-core/app/build/utils/crossTab.ts",
        "packages/dms/frontend-vue/layers/dms-core/app/build/utils/sharedRealtimeConnection.ts",
        "packages/dms/frontend-vue/layers/dms-core/app/composables/realtime/useUserRealtime.ts",
        "packages/dms/frontend-vue/layers/dms-core/app/composables/realtime/usePageRealtime.ts",
        "packages/dms/frontend-vue/layers/dms-core/app/composables/realtime/useRealtimeTopic.ts",
        "packages/dms/frontend-vue/layers/dms-core/app/composables/auth/useApiData.ts",
        "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/live/usePageDataRefresh.ts",
        "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/live/currentPageLive.ts",
        "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/blocks/useRefreshTriggers.ts",
        "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/tableViewRealtime.ts",
        "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/useTableRows.ts",
        "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/useTableListData.ts",
        "packages/dms/frontend-vue/layers/dms-layout/app/pages/[...slug].vue",
      ],
      files: [".agents/skills/formal-realtime-tabs/**"],
      command: ["node", ".agents/skills/formal-realtime-tabs/check.mjs", "--full"],
      baseCommand: ["node", ".agents/skills/formal-realtime-tabs/check.mjs"],
      violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
      passing: /(?<=^holds +(?:\w+, )*)(\w+)(?=,| \()/gm,
      behaviour: { kind: "emit" },
    },
    {
      name: "formal-release-range",
      covers: ["checks/release-range.mjs", "checks/release-range.test.mjs", "checks/bounded-range.test.mjs", ".github/workflows/release.yml"],
      files: ["checks/release-range.test.mjs", "checks/bounded-range.test.mjs", ".agents/skills/formal-release-range/**"],
      command: ["node", "--test", "--test-reporter=tap", "checks/release-range.test.mjs", "checks/bounded-range.test.mjs"],
      violation: /^not ok \d+ - (.+?)(?: # TODO.*)?$/gm,
      passing: /^ok \d+ - (.+?)(?: # TODO.*)?$/gm,
      behaviour: { kind: "probe", command: ["node", ".agents/skills/formal-release-range/probe.mjs"] },
    },
  ],
};

export default config;
