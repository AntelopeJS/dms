import assert from "node:assert/strict";
import test from "node:test";
import { raisedDmsRange, withDmsRange } from "./dms-range.mjs";
import { satisfiesImplementedRange } from "./release-range.mjs";

const CURRENT = ">=0.13.0 <0.14.0";

await test("a version the range admits writes nothing (catches a hook that rewrites the range on every release)", () => {
  assert.equal(raisedDmsRange("0.13.4", CURRENT), undefined);
  assert.equal(raisedDmsRange("0.13.0", CURRENT), undefined);
});

await test("a floor that lags the version is kept (catches a hook that moves the floor to the version)", () => {
  assert.equal(raisedDmsRange("0.13.9", ">=0.13.2 <0.14.0"), undefined);
});

await test("a minor outside the range writes the canonical next range with the version as floor (catches a floor at .0 or a cap that is not the next minor)", () => {
  assert.equal(raisedDmsRange("0.14.0", CURRENT), ">=0.14.0 <0.15.0");
  assert.equal(raisedDmsRange("0.14.2", CURRENT), ">=0.14.2 <0.15.0");
});

await test("the minor is read as a number (catches string comparison and a cap built by editing digits)", () => {
  assert.equal(raisedDmsRange("0.9.5", ">=0.8.0 <0.9.0"), ">=0.9.5 <0.10.0");
  assert.equal(raisedDmsRange("0.10.0", ">=0.9.1 <0.10.0"), ">=0.10.0 <0.11.0");
});

await test("a version below the range is not left behind (catches a hook that only handles a bump up)", () => {
  assert.equal(raisedDmsRange("0.12.9", CURRENT), ">=0.12.9 <0.13.0");
});

await test("a range of another shape is replaced by the canonical one (catches a hook that trusts any range containing the version)", () => {
  assert.equal(raisedDmsRange("0.13.4", "^0.13.0"), ">=0.13.4 <0.14.0");
  assert.equal(raisedDmsRange("0.13.4", undefined), ">=0.13.4 <0.14.0");
});

await test("every written range passes the release rule (catches a spelling the rule rejects)", () => {
  for (const version of [
    "0.0.1",
    "0.9.5",
    "0.10.0",
    "0.14.0",
    "0.14.2",
    "0.99.7",
  ]) {
    const raised = raisedDmsRange(version, "workspace:*");
    assert.ok(
      raised !== undefined && satisfiesImplementedRange(version, raised),
      version,
    );
  }
});

await test("a major of 1 or more is refused (catches a range such as >=1.0.0 <1.1.0 that the release rule rejects)", () => {
  assert.throws(() => raisedDmsRange("1.0.0", CURRENT), /only covers 0\.x/);
  assert.throws(() => raisedDmsRange("2.3.1", CURRENT), /only covers 0\.x/);
});

await test("a prerelease or build metadata is refused when the range does not admit it (catches a floor such as >=0.14.0-next.0 that the rule rejects)", () => {
  assert.throws(
    () => raisedDmsRange("0.14.0-next.0", CURRENT),
    /plain 0\.M\.p release/,
  );
  assert.throws(
    () => raisedDmsRange("0.13.4-rc.1", CURRENT),
    /plain 0\.M\.p release/,
  );
  assert.throws(
    () => raisedDmsRange("0.14.0+build.1", CURRENT),
    /plain 0\.M\.p release/,
  );
});

await test("a malformed version is refused (catches a parser that reads a leading v, a short version or leading zeros)", () => {
  for (const version of [
    "",
    "abc",
    "v0.14.0",
    "0.14",
    "0.14.0.1",
    "0.014.0",
    "00.14.0",
    " 0.14.0",
  ]) {
    assert.throws(
      () => raisedDmsRange(version, CURRENT),
      /plain 0\.M\.p release/,
      version,
    );
  }
});

await test("a version too long for the rule is refused (catches a hook that does not check its output against the rule)", () => {
  assert.throws(
    () => raisedDmsRange(`0.14.${"1".repeat(300)}`, CURRENT),
    /fails the release rule/,
  );
});

const MANIFEST = `{
  "dependencies": {
    "@antelopejs/interface-dms": ">=0.13.0 <0.14.0",
    "@antelopejs/interface-dms-builder": ">=0.4.0 <1.0.0"
  },
  "antelopeJs": {
    "implements": [
      "@antelopejs/interface-dms"
    ]
  }
}
`;

await test("only the interface dependency is rewritten (catches a global replace of the package name and the -builder neighbour)", () => {
  assert.equal(
    withDmsRange(MANIFEST, ">=0.14.0 <0.15.0"),
    MANIFEST.replace(">=0.13.0 <0.14.0", ">=0.14.0 <0.15.0"),
  );
});

await test("a manifest without exactly one interface dependency is refused (catches a silent no-op or a double rewrite)", () => {
  assert.throws(() => withDmsRange("{}", ">=0.14.0 <0.15.0"), /found 0/);
  const twice = `{"a":{"@antelopejs/interface-dms":"x"},"b":{"@antelopejs/interface-dms":"y"}}`;
  assert.throws(() => withDmsRange(twice, ">=0.14.0 <0.15.0"), /found 2/);
});
