import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { z } from "zod";

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
const localeFile = z
  .object({
    error: z.record(z.string(), z.unknown()),
    dms: z
      .object({
        automation: z
          .object({ fields: z.record(z.string(), z.unknown()) })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

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

/** @typedef {z.infer<typeof localeFile>} LocaleFile */

const rendererManifest = z
  .object({ engines: z.record(z.string(), z.unknown()) })
  .passthrough();

/** @typedef {z.infer<typeof rendererManifest>} RendererManifest */

/**
 * A trigger the catalogue gains on top of the shipped ones, as a source edit
 * to `src/automation` would add it: `name` replaces its name text, and
 * `outputField` adds an output property titled with its shared field label.
 * @typedef {{ name?: string, outputField?: string }} ExtraTrigger
 */

/**
 * The code that adds `extra` to the exports of the compiled catalogue.
 * @param {ExtraTrigger} extra
 * @returns {string}
 */
function extraTriggerSource(extra) {
  const overrides = [
    '"id": "dms-test.extra"',
    ...(extra.name === undefined
      ? []
      : [`"name": ${JSON.stringify(extra.name)}`]),
    ...(extra.outputField === undefined
      ? []
      : [
          `"outputSchema": { "type": "object", "properties": Object.fromEntries([[${JSON.stringify(extra.outputField)}, { "title": ${JSON.stringify(`$dms.automation.fields.${extra.outputField}`)} }]]) }`,
        ]),
  ];
  return `\n;exports.TRIGGERS.push({ ...exports.TRIGGERS[0], ${overrides.join(", ")} });\n`;
}

/**
 * Run a copy of `backend-checks.cjs` in a package tree whose locale files are
 * the real ones after `edit`.
 * Both locale files get the same edit. `extra` adds a trigger to the copy of
 * the compiled catalogue that the run reads, and `editManifest` edits the
 * `package.json` of the renderer layer.
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
    rmSync(nodePath.join(tree, "dist"));
    cpSync(nodePath.join(packageRoot, "dist"), nodePath.join(tree, "dist"), {
      recursive: true,
    });
    if (Object.keys(extra).length > 0)
      appendFileSync(
        nodePath.join(tree, "dist", "automation", "index.js"),
        extraTriggerSource(extra),
      );
    rmSync(nodePath.join(tree, "scripts"));
    cpSync(
      nodePath.join(packageRoot, "scripts"),
      nodePath.join(tree, "scripts"),
      {
        recursive: true,
      },
    );
    const realLocales = nodePath.join(packageRoot, ...localeSegments);
    for (const file of locales) {
      const messages = localeFile.parse(
        JSON.parse(readFileSync(nodePath.join(realLocales, file), "utf8")),
      );
      edit(messages);
      writeFileSync(
        nodePath.join(tree, ...localeSegments, file),
        JSON.stringify(messages),
      );
    }
    const manifestPath = nodePath.join(tree, "frontend-vue", "package.json");
    const manifest = rendererManifest.parse(
      JSON.parse(readFileSync(manifestPath, "utf8")),
    );
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
