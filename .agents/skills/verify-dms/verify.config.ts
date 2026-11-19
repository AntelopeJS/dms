import { formal, type FormalCheck } from "../../../checks/formal-checks.ts";
import journeys from "../../../e2e/journeys.config.ts";

/** A kind of one-way door. */
export type DoorKind = "data" | "format" | "contract" | "outbound" | "exposure" | "publish";

/** Path rules for one door kind: globs and declared funnel modules. */
export interface DoorRule {
  globs: string[];
  funnels: string[];
  why: string;
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
  /** The folder of the journeys modules, relative to the repository root. Absent: `journeys/` in the skill folder. */
  journeys?: string;
  doors: Record<DoorKind, DoorRule | null>;
  formal: FormalCheck[];
}

const config: VerifyConfig = {
  ...journeys,
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
    "e2e/journeys.config.ts",
    "checks/formal-checks.ts",
    "e2e/*.mjs",
    "e2e/*.ts",
  ],
  notShared: ["packages/dms/test-hosts/**", "packages/interface-dms/src/**/*.test.ts", "e2e/*.test.mjs"],
  smokeJourney: "onboard → login → invite a member → reload",
  journeys: "e2e/journeys",
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
      ],
      funnels: [],
      why: "the package names, their files, their interface range and the release workflows claim names in the npm registry",
    },
  },
  formal,
};

export default config;
