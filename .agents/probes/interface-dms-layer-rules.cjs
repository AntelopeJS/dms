const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const repo = path.resolve(process.argv[2]);
const wt = fs.mkdtempSync(path.join(os.tmpdir(), "interface-dms-layer-rules-"));
process.on("exit", () => fs.rmSync(wt, { recursive: true, force: true }));
for (const file of [".dependency-cruiser.cjs", ".dependency-cruiser", ".dependency-cruiser.tsconfig.json", "tsconfig.json", "packages/interface-dms/package.json", "packages/interface-dms/tsconfig.json", "packages/interface-dms/src"]) {
  fs.cpSync(path.join(repo, file), path.join(wt, file), { recursive: true });
}
fs.mkdirSync(path.join(wt, "packages/dms/src"), { recursive: true });
fs.writeFileSync(path.join(wt, "packages/dms/src/index.ts"), "export const dms = 1;\n");
fs.symlinkSync(path.join(repo, "node_modules"), path.join(wt, "node_modules"), "dir");
fs.symlinkSync(path.join(repo, "packages/interface-dms/node_modules"), path.join(wt, "packages/interface-dms/node_modules"), "dir");
const src = path.join(wt, "packages/interface-dms/src");
const cfgText = fs.readFileSync(path.join(wt, ".dependency-cruiser/interface-dms.cjs"), "utf8");
const requireInterface = createRequire(path.join(repo, "packages/interface-dms/package.json"));

/**
 * @typedef {{
 *   typescript: typeof import("../../packages/interface-dms/node_modules/typescript");
 *   zod: typeof import("../../packages/interface-dms/node_modules/zod");
 * }} InterfaceModules
 */

/**
 * The one place this probe reads a package from interface-dms's install, typed by the declaration that package ships.
 * @template {keyof InterfaceModules} Name
 * @param {Name} name
 * @returns {InterfaceModules[Name]}
 */
function loadInterfaceModule(name) {
  return requireInterface(name);
}

const ts = loadInterfaceModule("typescript");
const { z } = loadInterfaceModule("zod");
const Cruiser = z.object({ forbidden: z.array(z.object({ name: z.string() })) });
const CruiseResult = z.object({
  summary: z.object({
    violations: z.array(z.object({ rule: z.object({ name: z.string() }), from: z.string(), to: z.string() })),
  }),
});
const cfg = Cruiser.parse(require(path.join(wt, ".dependency-cruiser/interface-dms.cjs")));

/**
 * @param {string} name
 * @param {RegExp} pattern
 * @returns {unknown}
 */
function literal(name, pattern) {
  /** @type {import("typescript").Diagnostic[]} */
  const errors = [];
  /** @type {unknown} */
  const value = ts.convertToObject(ts.parseJsonText("interface-dms.cjs", cfgText.match(pattern)[1]), errors);
  if (errors.length > 0) throw new Error(`.dependency-cruiser/interface-dms.cjs: ${name} is not a JSON literal`);
  return value;
}
const tiers = z.array(z.array(z.string())).parse(literal("tiers", /const tiers = (\[[\s\S]*?\n\]);/));
const internals = z.record(z.string(), z.array(z.string())).parse(literal("internals", /const internals = (\{[\s\S]*?\n\});/));
const slug = (/** @type {string} */ u) => u.replace(/\/$/, "").replaceAll(".", "-");

/**
 * @param {string} unit
 * @returns {string[]}
 */
function filesOf(unit) {
  if (unit.endsWith("/")) {
    /** @type {string[]} */
    const out = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".ts")) out.push(path.relative(src, p)); } })(path.join(src, unit));
    return out;
  }
  return [unit, ...(internals[unit] ?? []).map((f) => `internal/${f}.ts`)];
}
/** @type {{ kind: string, from: string, to: string, expect: string | null }[]} */
const probes = [];
const appendImport = (/** @type {string} */ from, /** @type {string} */ to) => {
  let rel = path.relative(path.dirname(path.join(src, from)), path.join(src, to)).replace(/\.ts$/, "");
  if (!rel.startsWith(".")) rel = "./" + rel;
  fs.appendFileSync(path.join(src, from), `\nimport "${rel}";\n`);
};
const add = (/** @type {string} */ kind, /** @type {string} */ from, /** @type {string} */ to, /** @type {string | null} */ expect) => { probes.push({ kind, from, to, expect }); appendImport(from, to); };
tiers.forEach((tier, rank) => tier.forEach((unit) => {
  const files = filesOf(unit);
  const from = files[files.length - 1];
  if (rank > 0) add("upward", from, filesOf(tiers[rank - 1][0])[0], `interface-dms-${slug(unit)}-no-upward`);
  if (rank > 0) add("top", from, "index.ts", `interface-dms-${slug(unit)}-no-upward`);
  const peer = tier.find((p) => p !== unit);
  if (peer) add("peer", from, filesOf(peer)[0], `interface-dms-${slug(unit)}-no-upward`);
  if (rank < tiers.length - 1) add("downward", from, filesOf(tiers[tiers.length - 1][0])[0], null);
  if (rank < tiers.length - 2) add("down-one", from, filesOf(tiers[rank + 1][0])[0], null);
}));
fs.mkdirSync(path.join(src, "zz-new"), { recursive: true });
fs.writeFileSync(path.join(src, "zz-new/x.ts"), "export const x = 1;\n");
fs.writeFileSync(path.join(src, "zz-new.ts"), "export const y = 1;\n");
fs.writeFileSync(path.join(src, "internal/zz-new.ts"), "export const z = 1;\n");
add("closing", "tones.ts", "zz-new/x.ts", "interface-dms-unranked-target");
add("closing", "zz-new/x.ts", "tones.ts", "interface-dms-unranked-source");
add("closing", "zz-new.ts", "tones.ts", "interface-dms-unranked-source");
add("closing", "index.ts", "zz-new.ts", "interface-dms-unranked-target");
add("closing", "component.ts", "internal/zz-new.ts", "interface-dms-unranked-target");
add("closing", "internal/zz-new.ts", "tones.ts", "interface-dms-unranked-source");
add("dms", "tones.ts", "../../dms/src/index.ts", "interface-dms-no-dms-package");
fs.appendFileSync(path.join(src, "component.ts"), `\nimport { PageMetadata as RuntimePageMetadata } from "./page";\nexport const runtimePageMetadata = RuntimePageMetadata;\n`);
probes.push({ kind: "upward-runtime", from: "component.ts", to: "page.ts", expect: "interface-dms-component-ts-no-upward" });
fs.appendFileSync(path.join(src, "component.ts"), `\nimport type { PageMetadata as OtherPageMetadata } from "./page/metadata";\nexport type OtherPage = OtherPageMetadata;\n`);
probes.push({ kind: "upward-type-only", from: "component.ts", to: "page/metadata.ts", expect: "interface-dms-component-ts-no-upward" });
fs.appendFileSync(path.join(src, "internal/component-builder.ts"), `\nimport type { PageMetadata as BuilderPageMetadata } from "../page";\nexport type BuilderPage = BuilderPageMetadata;\n`);
probes.push({ kind: "upward-type-only", from: "internal/component-builder.ts", to: "page.ts", expect: "interface-dms-component-ts-no-upward" });
fs.appendFileSync(path.join(src, "auth/db/tables/users.table.ts"), `\nimport { DefaultDataTypes as RuntimeTypes } from "../../../base/data-types/default-types";\nexport const runtimeTypes = RuntimeTypes;\n`);
probes.push({ kind: "upward-runtime", from: "auth/db/tables/users.table.ts", to: "base/data-types/default-types.ts", expect: "interface-dms-auth-no-upward" });
fs.appendFileSync(path.join(src, "auth/db/tables/users.table.ts"), `\nimport type { FormField as UserField } from "../../../base/form-types";\nexport type UserFormField = UserField;\n`);
probes.push({ kind: "upward-type-only", from: "auth/db/tables/users.table.ts", to: "base/form-types.ts", expect: "interface-dms-auth-no-upward" });
fs.appendFileSync(path.join(src, "auth/db/tables/sessions.table.ts"), `\nimport type { DefaultDataTypes as SessionTypes } from "../../../base/data-types/default-types";\nexport type SessionImage = SessionTypes.ImageValue;\n`);
probes.push({ kind: "upward-type-only", from: "auth/db/tables/sessions.table.ts", to: "base/data-types/default-types.ts", expect: "interface-dms-auth-no-upward" });
const out = execFileSync(path.join(repo, "node_modules/.bin/depcruise"), ["packages/interface-dms/src", "--config", ".dependency-cruiser.cjs", "--output-type", "json"], { cwd: wt, encoding: "utf8", maxBuffer: 1 << 28 });
const violations = CruiseResult.parse(JSON.parse(out)).summary.violations.map((v) => ({ rule: v.rule.name, from: v.from.replace("packages/interface-dms/src/", ""), to: v.to.replace("packages/interface-dms/src/", "") }));
let failed = 0;
/** @type {string[]} */
const rows = [];
const norm = (/** @type {string} */ p) => `packages/${p.split("/").slice(2).join("/")}`;
for (const p of probes) {
  const to = p.to.startsWith("../") ? norm(p.to) : p.to;
  const hits = violations.filter((v) => v.from === p.from && v.to === to).map((v) => v.rule);
  const ok = p.expect === null ? hits.length === 0 : hits.includes(p.expect);
  if (!ok) failed++;
  rows.push(`${ok ? "PASS" : "FAIL"} ${p.kind.padEnd(22)} ${p.from} -> ${to} expected=${p.expect ?? "none"} got=${hits.join(",") || "none"}`);
}
const expectedEdges = new Set(probes.map((p) => `${p.from}->${p.to.startsWith("../") ? norm(p.to) : p.to}`));
const unexpected = violations.filter((v) => !expectedEdges.has(`${v.from}->${v.to}`));
for (const v of unexpected) { failed++; rows.push(`FAIL unexpected violation ${v.rule} ${v.from} -> ${v.to}`); }
console.log(rows.join("\n"));
const rulesProbed = new Set(probes.map((p) => p.expect).filter(Boolean));
const allRules = new Set(cfg.forbidden.map((r) => r.name).filter((n) => n.startsWith("interface-dms-")));
const unprobed = [...allRules].filter((r) => !rulesProbed.has(r));
console.log(`probes ${probes.length}, failed ${failed}, interface-dms rules ${allRules.size}, rules probed ${[...allRules].filter((r) => rulesProbed.has(r)).length}, unprobed: ${unprobed.join(" ") || "none"}`);
process.exitCode = failed ? 1 : 0;
