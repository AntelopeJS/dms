import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { group, readJsonRecord } from "./json-record.mjs";

const packageRoot = nodePath.resolve(import.meta.dirname, "../..");
const repoRoot = nodePath.resolve(packageRoot, "../..");
const localeSegments = [
  "frontend-vue",
  "layers",
  "dms-core",
  "i18n",
  "locales",
];
const locales = ["core-en-GB.json", "core-fr-FR.json"];

/**
 * Recreate `source` under `target` entry by entry as symlinks, except the path
 * `segments`, whose last directory is left for the caller to fill.
 * @param {string} source
 * @param {string} target
 * @param {readonly string[]} segments
 * @returns {void}
 */
function mirror(source, target, segments) {
  mkdirSync(target, { recursive: true });
  const [head, ...rest] = segments;
  for (const entry of readdirSync(source)) {
    const from = nodePath.join(source, entry);
    const to = nodePath.join(target, entry);
    if (entry !== head) symlinkSync(from, to);
    else if (rest.length > 0) mirror(from, to, rest);
    else mkdirSync(to);
  }
}

/** @typedef {Record<string, unknown>} LocaleFile */

/** @typedef {Record<string, unknown>} RendererManifest */

/**
 * A trigger the catalogue gains on top of the shipped ones: `name` replaces
 * its name text, and `outputField` adds an output property titled with a label
 * of the group `dms.automation.testOnlyLabels`, which the shipped locale files
 * do not have.
 * @typedef {{ name?: string, outputField?: string }} ExtraTrigger
 */

const extraKeys = {
  name: "$dms.automation.testOnlyTrigger.name",
  description: "$dms.automation.testOnlyTrigger.description",
};

/**
 * The module that stands in for `backend-automation.cjs` in the scratch tree.
 * It exports the compiled catalogue's actions and a new array of its triggers
 * followed by `extra`, a complete trigger written out here, so nothing the
 * compiled catalogue exports is changed and the extra trigger does not depend
 * on a shipped one.
 * @param {ExtraTrigger} extra
 * @returns {string}
 */
function extraTriggerModule(extra) {
  const outputProperties =
    extra.outputField === undefined
      ? "{}"
      : `Object.fromEntries([[${JSON.stringify(extra.outputField)}, { title: ${JSON.stringify(`$dms.automation.testOnlyLabels.${extra.outputField}`)} }]])`;
  return `const { createRequire } = require("node:module");
const { ACTIONS, TRIGGERS } = createRequire(__filename)("../dist/automation");
module.exports = {
  ACTIONS,
  TRIGGERS: [
    ...TRIGGERS,
    {
      id: "dms-test.extra",
      name: ${JSON.stringify(extra.name ?? extraKeys.name)},
      description: ${JSON.stringify(extraKeys.description)},
      configSchema: { type: "object", properties: {} },
      outputSchema: { type: "object", properties: ${outputProperties} },
    },
  ],
};
`;
}

/**
 * Run a copy of `backend-checks.cjs` in a package tree whose locale files are
 * the real ones after `edit`.
 * Both locale files get the same edit. `extra` adds a trigger to the catalogue
 * that the run reads, with a name and a description that both locale files
 * translate before `edit` runs, and `editManifest` edits the `package.json` of
 * the renderer layer.
 * @param {(messages: LocaleFile) => void} edit
 * @param {ExtraTrigger} [extra]
 * @param {(manifest: RendererManifest) => void} [editManifest]
 * @returns {{ status: number | null, stderr: string, stdout: string }}
 */
export function runWithLocales(edit, extra = {}, editManifest = () => {}) {
  const workspace = mkdtempSync(nodePath.join(tmpdir(), "backend-checks-"));
  try {
    const tree = nodePath.join(workspace, "packages", "dms");
    mirror(repoRoot, workspace, ["packages", "dms", ...localeSegments]);
    rmSync(nodePath.join(tree, "scripts"));
    cpSync(
      nodePath.join(packageRoot, "scripts"),
      nodePath.join(tree, "scripts"),
      {
        recursive: true,
      },
    );
    const withExtra = Object.keys(extra).length > 0;
    if (withExtra)
      writeFileSync(
        nodePath.join(tree, "scripts", "backend-automation.cjs"),
        extraTriggerModule(extra),
      );
    const realLocales = nodePath.join(packageRoot, ...localeSegments);
    for (const file of locales) {
      const messages = readJsonRecord(nodePath.join(realLocales, file));
      if (withExtra)
        group(group(messages, "dms"), "automation").testOnlyTrigger = {
          name: "Extra trigger",
          description: "A trigger that only the tests add",
        };
      edit(messages);
      writeFileSync(
        nodePath.join(tree, ...localeSegments, file),
        JSON.stringify(messages),
      );
    }
    const manifestPath = nodePath.join(tree, "frontend-vue", "package.json");
    const manifest = readJsonRecord(manifestPath);
    editManifest(manifest);
    rmSync(manifestPath);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    return spawnSync(
      process.execPath,
      [nodePath.join(tree, "scripts", "backend-checks.cjs")],
      { cwd: tree, encoding: "utf8" },
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
