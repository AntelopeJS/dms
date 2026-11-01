const assert = require("node:assert/strict");
const { unlinkSync, writeFileSync } = require("node:fs");
const { baseline, runGuard } = require("./context.cjs");
const {
  adversarialImports,
  interfacePath,
  packageProbe,
  relativeImports,
} = require("./import-forms.cjs");

const relativeRejection =
  /relative imports must resolve inside backend|constant specifier|plain string literal|indirect require/;

function relativeForms() {
  const escaped = [];
  for (const input of relativeImports) {
    writeFileSync(packageProbe, input);
    const result = runGuard();
    const rejected =
      result.status === 1 && relativeRejection.test(result.stderr);
    process.stdout.write(`${rejected ? "REJECTED" : "ESCAPED"}: ${input}\n`);
    if (!rejected)
      escaped.push({ input, status: result.status, stderr: result.stderr });
  }
  return escaped;
}

function packageControls() {
  let packageAccepted = 0;
  for (const [index, input] of relativeImports.entries()) {
    const control = input.replaceAll(
      interfacePath,
      "@antelopejs/interface-dms/page",
    );
    writeFileSync(packageProbe, control);
    const result = runGuard();
    const allowed = baseline || index < 6;
    assert.equal(
      result.status,
      allowed ? 0 : 1,
      `${control}\n${result.stderr}`,
    );
    if (allowed) packageAccepted++;
    else assert.match(result.stderr, /plain string literal/);
  }
  return packageAccepted;
}

function adversarialForms() {
  let adversarialRejected = 0;
  for (const input of adversarialImports) {
    writeFileSync(packageProbe, input);
    const result = runGuard();
    const rejected =
      result.status === 1 && relativeRejection.test(result.stderr);
    assert.equal(result.status, 1, `${input}\n${result.stderr}`);
    assert.ok(rejected, result.stderr);
    if (rejected) adversarialRejected++;
    process.stdout.write(`REJECTED: ${input}\n`);
  }
  return adversarialRejected;
}

function packageProbes() {
  assert.equal(adversarialImports.length, 78);
  writeFileSync(packageProbe, "", { flag: "wx" });
  try {
    const healthy = runGuard();
    assert.equal(healthy.status, 0, healthy.stderr);
    const escaped = relativeForms();
    const packageAccepted = packageControls();
    assert.deepEqual(
      escaped,
      [],
      "Relative interface specifiers escaped the guard",
    );
    process.stdout.write(
      `Package import probes passed: ${relativeImports.length} relative forms rejected; ${packageAccepted} literal package controls accepted; ${relativeImports.length - packageAccepted} computed package controls rejected.\n`,
    );
    const adversarialRejected = adversarialForms();
    process.stdout.write(
      `Verifier adversarial probes: ${relativeImports.length + adversarialImports.length} cases; ${relativeImports.length + adversarialRejected} rejected; ${adversarialImports.length - adversarialRejected} escaped.\n`,
    );
  } finally {
    unlinkSync(packageProbe);
  }
}

module.exports = { packageProbes };
