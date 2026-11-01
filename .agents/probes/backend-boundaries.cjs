const { boundaryMatrix } = require("./backend-boundaries/boundary-matrix.cjs");
const {
  layerMatrix,
  symlinkProbes,
} = require("./backend-boundaries/layer-matrix.cjs");
const { packageProbes } = require("./backend-boundaries/package-probe.cjs");
const {
  literalPolicy,
  sourcePolicy,
} = require("./backend-boundaries/policy-matrices.cjs");
const { round9Targets } = require("./backend-boundaries/round9.cjs");
const {
  round10Pins,
  round10Targets,
} = require("./backend-boundaries/round10.cjs");
const { round11Targets } = require("./backend-boundaries/round11.cjs");
const { round12Targets } = require("./backend-boundaries/round12.cjs");
const {
  packageTargets,
  runtimeTargets,
  sourceDistTargets,
} = require("./backend-boundaries/target-probes.cjs");
const { verifierMatrix } = require("./backend-boundaries/verifier-matrix.cjs");

if (process.argv.includes("--round12-targets")) {
  round12Targets();
  process.exit(0);
}
if (process.argv.includes("--round11-targets")) {
  round11Targets();
  process.exit(0);
}
if (process.argv.includes("--round10-pins")) {
  round10Pins();
  process.exit(0);
}
if (process.argv.includes("--round10-targets")) {
  round10Targets();
  round10Pins();
  process.exit(0);
}
if (process.argv.includes("--round9-targets")) {
  round9Targets();
  process.exit(0);
}
if (process.argv.includes("--source-dist-targets")) {
  sourceDistTargets();
  process.exit(0);
}
runtimeTargets();
packageTargets();
round9Targets();
round10Targets();
round10Pins();
round11Targets();
round12Targets();
if (process.argv.includes("--runtime-targets")) process.exit(0);
sourceDistTargets();
boundaryMatrix();
packageProbes();
literalPolicy();
verifierMatrix();
sourcePolicy();
layerMatrix();
symlinkProbes();
