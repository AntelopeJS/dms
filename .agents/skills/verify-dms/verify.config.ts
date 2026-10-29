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
    data: null,
    format: null,
    contract: null,
    outbound: null,
    exposure: null,
    publish: null,
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
      violation: /^(?:BROKEN|CHANGED|HOLDS) +(\w+)/gm,
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
