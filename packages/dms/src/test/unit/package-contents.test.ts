import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect } from "chai";

const PACKAGE_ROOT = resolve(__dirname, "..", "..", "..");
const PACK_TIMEOUT_MS = 60_000;

/**
 * What a consumer reads from the installed package: the loader the backend
 * entry and the skills, the renderer the Vue layer, which it copies whole into
 * every workspace it generates.
 */
const RUNTIME_ENTRIES = [
  "package.json",
  "dist/index.js",
  "frontend-vue/package.json",
  "frontend-vue/dms.frontend.ts",
  "frontend-vue/dms.server.ts",
  "frontend-vue/dms.email.ts",
  "frontend-vue/layers/dms-core/types.d.ts",
  "frontend-vue/server/private-options.ts",
];

/**
 * Development files of this repository: the compiled backend suites, the Vue
 * layer's Vitest suites and its standalone tooling. The renderer installs the
 * layer from its generated workspace's lockfile and excludes tests, Vitest and
 * ESLint configs from its type check, so none of them reaches a consumer.
 */
const DEVELOPMENT_ONLY = [
  /^dist\/test\//,
  /^frontend-vue\/tests\//,
  /^frontend-vue\/vitest\.config\.ts$/,
  /^frontend-vue\/eslint\.config\.mjs$/,
  /^frontend-vue\/\.prettierrc$/,
  /^frontend-vue\/\.vscode\//,
  /^frontend-vue\/pnpm-lock\.yaml$/,
  /^frontend-vue\/pnpm-workspace\.yaml$/,
];

function packedFiles(): string[] {
  const output = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: PACKAGE_ROOT,
      encoding: "utf8",
      timeout: PACK_TIMEOUT_MS,

      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const [pack] = JSON.parse(output) as [{ files: { path: string }[] }];
  return pack.files.map((file) => file.path);
}

describe("[unit] published package contents", function () {
  this.timeout(PACK_TIMEOUT_MS);

  let files: string[];
  before(() => {
    files = packedFiles();
  });

  it("ships what the loader and the renderer read", () => {
    expect(
      RUNTIME_ENTRIES.filter((entry) => !files.includes(entry)),
    ).to.deep.equal([]);
  });

  it("leaves the repository's tests and tooling out", () => {
    const shipped = files.filter((file) =>
      DEVELOPMENT_ONLY.some((pattern) => pattern.test(file)),
    );
    expect(shipped).to.deep.equal([]);
  });
});
