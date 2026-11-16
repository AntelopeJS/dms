import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const SCRIPT = fileURLToPath(
  new URL("../scripts/raise-dms-range.mjs", import.meta.url),
);
const ROOT_MODULES = fileURLToPath(
  new URL("../../../node_modules", import.meta.url),
);

/**
 * Runs the `after:bump` hook of an interface release at `version` in a copy of
 * the repository layout whose dms manifest declares `spec`, and returns the dms
 * manifest the hook leaves.
 *
 * @param {string} version The interface version the release bumped to
 * @param {string} spec The dms specifier of `@antelopejs/interface-dms` before the hook
 * @returns {Promise<{ before: string, after: string }>} The dms manifest text before and after the hook
 */
async function raise(version, spec) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "raise-dms-range-"));
  try {
    const scripts = path.join(root, "packages/interface-dms/scripts");
    const dms = path.join(root, "packages/dms/package.json");
    await fs.mkdir(scripts, { recursive: true });
    await fs.mkdir(path.dirname(dms), { recursive: true });
    await fs.symlink(ROOT_MODULES, path.join(root, "node_modules"), "dir");
    await fs.copyFile(SCRIPT, path.join(scripts, "raise-dms-range.mjs"));
    await fs.writeFile(
      path.join(root, "packages/interface-dms/package.json"),
      `${JSON.stringify({ name: "@antelopejs/interface-dms", version }, null, 2)}\n`,
    );
    const before = `${JSON.stringify(
      {
        name: "@antelopejs/dms",
        dependencies: { "@antelopejs/interface-dms": spec },
      },
      null,
      2,
    )}\n`;
    await fs.writeFile(dms, before);
    await promisify(execFile)(process.execPath, [
      path.join(scripts, "raise-dms-range.mjs"),
    ]);
    return { before, after: await fs.readFile(dms, "utf8") };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

await test("an interface release leaves a workspace:^ specifier of dms untouched (fails a hook that reads it as a semver range)", async () => {
  const { before, after } = await raise("0.14.3", "workspace:^");
  assert.equal(after, before);
});

await test("an interface release raises a plain range of dms that excludes the new version (fails a hook that skips every specifier)", async () => {
  const { after } = await raise("0.15.0", ">=0.14.0 <0.15.0");
  assert.equal(
    JSON.parse(after).dependencies["@antelopejs/interface-dms"],
    ">=0.15.0 <0.16.0",
  );
});
