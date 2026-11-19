import { resolve } from "node:path";
import { expect } from "chai";
import { z } from "zod";
import { runPackageManager } from "../../utils/package-manager/index";

const PACKAGE_ROOT = resolve(__dirname, "..", "..", "..");
const PACK_TIMEOUT_MS = 60_000;

/**
 * What a consumer reads from the installed package: the loader the backend
 * entry and the skills, the renderer the Vue layer, which it copies whole into
 * every workspace it generates, and a Playwright suite the e2e kit and its
 * declarations, whose global setup, service entry and build preload the kit
 * loads by path.
 */
const RUNTIME_ENTRIES = [
  "package.json",
  "dist/index.js",
  "e2e/index.mjs",
  "dist/e2e/index.d.mts",
  "e2e/global-setup.mjs",
  "e2e/service.mjs",
  "e2e/prepared-workspace.mjs",
  "frontend-vue/package.json",
  "frontend-vue/dms.frontend.ts",
  "frontend-vue/dms.server.ts",
  "frontend-vue/dms.email.ts",
  "frontend-vue/layers/dms-core/types.d.ts",
  "frontend-vue/server/private-options.ts",
];

/**
 * Development files of this repository: the compiled backend suites, the Vue
 * layer's Vitest suites and its standalone tooling, and the Node tests, test
 * helpers and TypeScript configs of the e2e kit and of dms-control. The
 * renderer installs the layer from its generated workspace's lockfile and
 * excludes tests, Vitest and ESLint configs from its type check, so none of
 * them reaches a consumer.
 */
const DEVELOPMENT_ONLY = [
  /^dist\/test\//,
  /^(?:e2e|bin)\/.*\.test\.mjs$/,
  /^e2e\/helpers\//,
  /^(?:e2e|bin)\/tsconfig[^/]*\.json$/,
  /^frontend-vue\/tests\//,
  /^frontend-vue\/vitest\.config\.ts$/,
  /^frontend-vue\/eslint\.config\.mjs$/,
  /^frontend-vue\/\.prettierrc$/,
  /^frontend-vue\/\.vscode\//,
  /^frontend-vue\/pnpm-lock\.yaml$/,
  /^frontend-vue\/pnpm-workspace\.yaml$/,
];

const PackOutput = z.tuple([
  z.object({ files: z.array(z.object({ path: z.string() })) }),
]);

async function packedFiles(): Promise<string[]> {
  const { stdout } = await runPackageManager(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: PACKAGE_ROOT, timeout: PACK_TIMEOUT_MS },
  );
  const [pack] = PackOutput.parse(JSON.parse(stdout));
  return pack.files.map((file) => file.path);
}

describe("[unit] published package contents", function () {
  this.timeout(PACK_TIMEOUT_MS);

  let files: string[];
  before(async () => {
    files = await packedFiles();
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
