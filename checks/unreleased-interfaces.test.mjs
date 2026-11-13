import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { unreleasedInterfaces } from "./unreleased-interfaces.mjs";

const INTERFACES = [
  {
    dir: "interface-dms",
    name: "@antelopejs/interface-dms",
    tag: "interface-v${version}",
    version: "0.13.3",
  },
  {
    dir: "interface-dms-builder",
    name: "@antelopejs/interface-dms-builder",
    tag: "interface-dms-builder-v${version}",
    version: "0.4.1",
  },
];

/**
 * @param {string} root
 * @param {string} path
 * @param {string} text
 */
const write = (root, path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

/**
 * @param {string} root
 * @param {string[]} args
 */
const git = (root, ...args) =>
  execFileSync("git", args, { cwd: root, stdio: "ignore" });

/** @param {string} root */
const commit = (root) => {
  git(root, "add", "-A");
  git(
    root,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "c",
  );
};

/**
 * A repository with the DMS module depending on both interfaces, each at a
 * commit tagged as its in-tree version unless `untagged` names it.
 *
 * @param {{ untagged?: string[], dependencies?: string[] }} [options]
 * @returns {string}
 */
const repository = ({
  untagged = [],
  dependencies = INTERFACES.map(({ name }) => name),
} = {}) => {
  const root = mkdtempSync(join(tmpdir(), "unreleased-interfaces-"));
  git(root, "init", "-q");
  write(
    root,
    "packages/dms/package.json",
    JSON.stringify({
      dependencies: Object.fromEntries(dependencies.map((name) => [name, "*"])),
    }),
  );
  write(root, "packages/dms/src/index.ts", "");
  for (const { dir, name, tag, version } of INTERFACES) {
    write(
      root,
      `packages/${dir}/package.json`,
      JSON.stringify({ name, version }),
    );
    write(
      root,
      `packages/${dir}/.release-it.json`,
      JSON.stringify({ git: { tagName: tag } }),
    );
    write(root, `packages/${dir}/src/index.ts`, "export {};\n");
    write(root, `packages/${dir}/README.md`, "");
  }
  commit(root);
  for (const { dir, tag, version } of INTERFACES) {
    if (!untagged.includes(dir))
      git(root, "tag", tag.replace("${version}", version));
  }
  return root;
};

/**
 * @param {(root: string) => void} change
 * @param {Parameters<typeof repository>[0]} [options]
 * @returns {string[]}
 */
const reasonsAfter = (change, options) => {
  const root = repository(options);
  try {
    change(root);
    commit(root);
    return unreleasedInterfaces(root).map(
      ({ name, reason }) => `${name}: ${reason}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

await test("passes when every interface source is the one its release tag holds (catches a gate that fails any change at all)", () => {
  assert.deepEqual(
    reasonsAfter((root) =>
      write(root, "packages/dms/src/index.ts", "export const changed = 1;\n"),
    ),
    [],
  );
});

await test("fails when interface-dms source changed since its release tag (catches a gate that only checks versions and ranges)", () => {
  assert.deepEqual(
    reasonsAfter((root) =>
      write(
        root,
        "packages/interface-dms/src/index.ts",
        "export const added = 1;\n",
      ),
    ),
    [
      "@antelopejs/interface-dms: packages/interface-dms/src changed since interface-v0.13.3",
    ],
  );
});

await test("fails when interface-dms-builder source changed since its release tag (catches a gate that only checks the implemented interface-dms)", () => {
  assert.deepEqual(
    reasonsAfter((root) =>
      write(
        root,
        "packages/interface-dms-builder/src/engine.ts",
        "export {};\n",
      ),
    ),
    [
      "@antelopejs/interface-dms-builder: packages/interface-dms-builder/src changed since interface-dms-builder-v0.4.1",
    ],
  );
});

await test("compares the committed head (catches a diff against the working tree)", () => {
  const root = repository();
  try {
    write(
      root,
      "packages/interface-dms/src/index.ts",
      "export const draft = 1;\n",
    );
    assert.deepEqual(unreleasedInterfaces(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("fails when the in-tree version of an interface has no release tag (catches a gate that passes when the tag lookup fails)", () => {
  assert.deepEqual(
    reasonsAfter(() => {}, { untagged: ["interface-dms-builder"] }),
    [
      "@antelopejs/interface-dms-builder: no release tag interface-dms-builder-v0.4.1",
    ],
  );
});

await test("fails when a version bump lands without its release tag (catches a gate that diffs against the newest tag of any version)", () => {
  assert.deepEqual(
    reasonsAfter((root) =>
      write(
        root,
        "packages/interface-dms/package.json",
        JSON.stringify({
          name: "@antelopejs/interface-dms",
          version: "0.14.0",
        }),
      ),
    ),
    ["@antelopejs/interface-dms: no release tag interface-v0.14.0"],
  );
});

await test("passes when only files outside an interface's src changed (catches a diff over the whole package)", () => {
  assert.deepEqual(
    reasonsAfter((root) =>
      write(root, "packages/interface-dms/README.md", "docs\n"),
    ),
    [],
  );
});

await test("ignores an interface the DMS module does not depend on (catches a gate over every packages/interface-* directory)", () => {
  assert.deepEqual(
    reasonsAfter(
      (root) =>
        write(
          root,
          "packages/interface-dms-builder/src/index.ts",
          "export const x = 1;\n",
        ),
      {
        dependencies: ["@antelopejs/interface-dms"],
      },
    ),
    [],
  );
});
