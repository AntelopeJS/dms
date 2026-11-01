const assert = require("node:assert/strict");
const { unlinkSync, writeFileSync } = require("node:fs");
const {
  dependencyViolations,
  join,
  relative,
  root,
  source,
  specifier,
} = require("./context.cjs");

const tiers = [
  ["routes", "dev", "page-extensions"],
  ["pages"],
  ["implementations"],
  ["store", "attachments", "realtime", "automation", "crons", "hooks"],
  ["db"],
  ["validation", "utils"],
  ["config"],
  ["types"],
];
const entries = new Map(
  tiers
    .flat()
    .map((name) => [
      name,
      name === "implementations"
        ? "implementations/dms/page.ts"
        : `${name}/index.ts`,
    ]),
);
const privateFiles = {
  routes: "auth/signup.ts",
  dev: "module-update-notifications.ts",
  "page-extensions": "pending-report.ts",
  pages: "settings/users/account-credentials.ts",
  implementations: "dms/permission-preview.ts",
  store: "activity.ts",
  attachments: "save.ts",
  realtime: "broker.ts",
  automation: "actions.ts",
  crons: "sweep-stale-exports.ts",
  hooks: "invite-extensions.ts",
  db: "guard-row.ts",
  validation: "auth.schema.ts",
  config: "internal/state.ts",
  utils: "page-access.ts",
  types: "realtime.ts",
};

function write(path, targets, files) {
  writeFileSync(
    path,
    targets
      .map((target) => `import ${JSON.stringify(specifier(path, target))};`)
      .join("\n"),
    { flag: "wx" },
  );
  files.push(path);
}

function importTargets(domain, rank) {
  const targets = [];
  const upward = [];
  for (const [toRank, toTier] of tiers.entries()) {
    for (const target of toTier) {
      if (target === domain) continue;
      const destination = join(source, entries.get(target));
      targets.push(destination);
      if (toRank <= rank) upward.push(destination);
    }
  }
  return { targets, upward };
}

function writeDomainProbe(domain, rank, files, expected) {
  const path = join(source, domain, `__boundary_probe_${process.pid}.ts`);
  const { targets, upward } = importTargets(domain, rank);
  for (const destination of upward) {
    expected.push([
      `backend-${domain}-no-upward`,
      relative(root, path),
      relative(root, destination),
    ]);
  }
  write(path, targets, files);
}

function writeOutsiderProbe(files, expected) {
  const outsider = join(source, "test", `__boundary_probe_${process.pid}.ts`);
  write(
    outsider,
    Object.entries(privateFiles).map(([domain, name]) =>
      join(source, domain, name),
    ),
    files,
  );
  for (const [domain, name] of Object.entries(privateFiles)) {
    expected.push([
      `backend-${domain}-entry-only`,
      relative(root, outsider),
      `packages/dms/src/${domain}/${name}`,
    ]);
  }
}

function boundaryMatrix() {
  const files = [];
  const expected = [];
  try {
    for (const [rank, tier] of tiers.entries()) {
      for (const domain of tier)
        writeDomainProbe(domain, rank, files, expected);
    }
    writeOutsiderProbe(files, expected);
    const actual = dependencyViolations().map((item) => [
      item.rule.name,
      item.from,
      item.to,
    ]);
    const normalize = (rows) => rows.map((row) => row.join("\t")).sort();
    assert.deepEqual(normalize(actual), normalize(expected));
    process.stdout.write(
      `Backend boundary probes passed: ${expected.length} forbidden imports; every allowed rank/peer import accepted.\n`,
    );
  } finally {
    for (const path of files) unlinkSync(path);
  }
}

module.exports = { boundaryMatrix };
