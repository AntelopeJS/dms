#!/usr/bin/env node
/**
 * Prints what the `validate` step of `.github/workflows/release.yml` decides
 * in a checkout, one line per case: the step's node script, extracted from
 * the workflow wherever the rule lives (inline, or imported from
 * `checks/release-range.mjs`), runs against fixture package manifests built
 * from the checkout's own, and its exit code is the decision; a crash also
 * prints the error's name, so it never reads as a refusal. dms-control
 * runs it on the base and on HEAD: the same lines mean the diff kept the
 * covered behaviour.
 *
 * Usage: node .agents/skills/formal-release-range/probe.mjs <checkout>
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * @typedef {{
 *   name?: string;
 *   version?: string;
 *   private?: boolean;
 *   license?: string;
 *   repository?: { type?: string, url?: string, directory?: string };
 *   publishConfig?: { registry?: string, access?: string, provenance?: boolean };
 *   antelopeJs?: { implements: string[] };
 *   dependencies?: Record<string, string>;
 * }} Manifest
 */

const VERSIONS = ["0.8.9", "0.9.0", "0.9.1", "0.9.5", "0.9.1-next.0", "0.9.5-rc.1", "0.9.5+build.0", "0.10.0", "0.10.0-next.0", "1.9.1"];
const RANGES = [">=0.9.1 <0.10.0", ">=0.9.1 <0.11.0", ">0.9.1 <0.10.0", ">=0.9.1 <=0.10.0", "^0.9.1", ">=0.09.1 <0.10.0", ">=0.9.1  <0.10.0", ""];
const CANONICAL = { version: "0.9.5", range: ">=0.9.1 <0.10.0" };
/** @type {Record<string, (pkg: Manifest) => Manifest>} */
const MANIFEST_BREAKS = {
  "name": (pkg) => ({ ...pkg, name: "@antelopejs/dms-renamed" }),
  "private": (pkg) => ({ ...pkg, private: true }),
  "license": (pkg) => ({ ...pkg, license: "MIT" }),
  "repository": (pkg) => ({ ...pkg, repository: { ...pkg.repository, url: "git+https://example.com/dms.git" } }),
  "registry": (pkg) => ({ ...pkg, publishConfig: { ...pkg.publishConfig, registry: "https://registry.example.com/" } }),
  "access": (pkg) => ({ ...pkg, publishConfig: { ...pkg.publishConfig, access: "restricted" } }),
  "provenance": (pkg) => ({ ...pkg, publishConfig: { ...pkg.publishConfig, provenance: false } }),
  "implements": (pkg) => ({ ...pkg, antelopeJs: { ...pkg.antelopeJs, implements: [...(pkg.antelopeJs?.implements ?? []), "@antelopejs/interface-extra"] } }),
};

/** @param {string} checkout */
function validateStep(checkout) {
  const workflow = readFileSync(path.join(checkout, ".github", "workflows", "release.yml"), "utf8");
  const match = /^(\s*)node((?: --\S+)*) <<'NODE'\n([\s\S]*?)\n\1NODE$/m.exec(workflow);
  if (!match) throw new Error("release.yml has no node <<'NODE' script");
  const indent = match[1];
  const body = match[3].split("\n").map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line)).join("\n");
  return { flags: match[2].trim().split(/\s+/).filter(Boolean), body };
}

/**
 * @param {string} checkout
 * @param {{ flags: string[], body: string }} step
 * @param {Record<string, Manifest>} manifests
 */
function decide(checkout, step, manifests) {
  const dir = mkdtempSync(path.join(tmpdir(), "release-range-probe-"));
  try {
    for (const [file, value] of Object.entries(manifests)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), JSON.stringify(value));
    }
    if (existsSync(path.join(checkout, "checks"))) cpSync(path.join(checkout, "checks"), path.join(dir, "checks"), { recursive: true });
    const run = spawnSync(process.execPath, step.flags, { cwd: dir, input: step.body, encoding: "utf8" });
    const crash = /^(\w*Error)(?: \[(\w+)\])?/m.exec(run.stderr ?? "");
    return crash ? `${run.status} ${crash[1]}${crash[2] ? ` ${crash[2]}` : ""}` : `${run.status}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const checkout = path.resolve(process.argv[2] ?? ".");
const step = validateStep(checkout);

/**
 * The one place this probe decodes a manifest of the checkout, typed by the fields it reads.
 * @param {string} file
 * @returns {Manifest}
 */
function readManifest(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const pkg = readManifest(path.join(checkout, "packages", "dms", "package.json"));
const iface = readManifest(path.join(checkout, "packages", "interface-dms", "package.json"));
const manifests = (/** @type {Manifest} */ dms, /** @type {string} */ version) => ({
  "packages/dms/package.json": dms,
  "packages/interface-dms/package.json": { ...iface, version },
});
const withRange = (/** @type {string} */ range) => ({ ...pkg, dependencies: { ...pkg.dependencies, "@antelopejs/interface-dms": range } });

for (const range of RANGES) {
  for (const version of VERSIONS) {
    console.log(`range ${JSON.stringify(range)} version ${version}\texit ${decide(checkout, step, manifests(withRange(range), version))}`);
  }
}
for (const [name, broken] of Object.entries(MANIFEST_BREAKS)) {
  console.log(`manifest ${name}\texit ${decide(checkout, step, manifests(broken(withRange(CANONICAL.range)), CANONICAL.version))}`);
}
