const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
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
const cfg = require(path.join(wt, ".dependency-cruiser/interface-dms.cjs"));
const tiers = eval(cfgText.match(/const tiers = (\[[\s\S]*?\n\]);/)[1]);
const internals = eval("(" + cfgText.match(/const internals = (\{[\s\S]*?\n\});/)[1] + ")");
const slug = (u) => u.replace(/\/$/, "").replaceAll(".", "-");
function filesOf(unit) {
  if (unit.endsWith("/")) {
    const out = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith(".ts")) out.push(path.relative(src, p)); } })(path.join(src, unit));
    return out;
  }
  return [unit, ...(internals[unit] ?? []).map((f) => `internal/${f}.ts`)];
}
const probes = [];
const appendImport = (from, to) => {
  let rel = path.relative(path.dirname(path.join(src, from)), path.join(src, to)).replace(/\.ts$/, "");
  if (!rel.startsWith(".")) rel = "./" + rel;
  fs.appendFileSync(path.join(src, from), `\nimport "${rel}";\n`);
};
const add = (kind, from, to, expect) => { probes.push({ kind, from, to, expect }); appendImport(from, to); };
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
probes.push({ kind: "exception-runtime", from: "component.ts", to: "page.ts", expect: "interface-dms-component-page-metadata-type-cycle" });
fs.appendFileSync(path.join(src, "component.ts"), `\nimport type { PageMetadata as OtherPageMetadata } from "./page/metadata";\nexport type OtherPage = OtherPageMetadata;\n`);
probes.push({ kind: "exception-other-target", from: "component.ts", to: "page/metadata.ts", expect: "interface-dms-component-ts-no-upward" });
fs.appendFileSync(path.join(src, "internal/component-builder.ts"), `\nimport type { PageMetadata as BuilderPageMetadata } from "../page";\nexport type BuilderPage = BuilderPageMetadata;\n`);
probes.push({ kind: "exception-other-source", from: "internal/component-builder.ts", to: "page.ts", expect: "interface-dms-component-ts-no-upward" });
fs.appendFileSync(path.join(src, "auth/db/tables/users.table.ts"), `\nimport { DefaultDataTypes as RuntimeTypes } from "../../../base/data-types/default-types";\nexport const runtimeTypes = RuntimeTypes;\n`);
probes.push({ kind: "exception-runtime", from: "auth/db/tables/users.table.ts", to: "base/data-types/default-types.ts", expect: "interface-dms-user-avatar-data-types-type-cycle" });
fs.appendFileSync(path.join(src, "auth/db/tables/users.table.ts"), `\nimport type { FormField as UserField } from "../../../base/form-types";\nexport type UserFormField = UserField;\n`);
probes.push({ kind: "exception-other-target", from: "auth/db/tables/users.table.ts", to: "base/form-types.ts", expect: "interface-dms-auth-no-upward" });
fs.appendFileSync(path.join(src, "auth/db/tables/sessions.table.ts"), `\nimport type { DefaultDataTypes as SessionTypes } from "../../../base/data-types/default-types";\nexport type SessionImage = SessionTypes.ImageValue;\n`);
probes.push({ kind: "exception-other-source", from: "auth/db/tables/sessions.table.ts", to: "base/data-types/default-types.ts", expect: "interface-dms-auth-no-upward" });
const out = execFileSync(path.join(repo, "node_modules/.bin/depcruise"), ["packages/interface-dms/src", "--config", ".dependency-cruiser.cjs", "--output-type", "json"], { cwd: wt, encoding: "utf8", maxBuffer: 1 << 28 });
const violations = JSON.parse(out).summary.violations.map((v) => ({ rule: v.rule.name, from: v.from.replace("packages/interface-dms/src/", ""), to: v.to.replace("packages/interface-dms/src/", "") }));
let failed = 0; const rows = [];
const norm = (p) => `packages/${p.split("/").slice(2).join("/")}`;
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
