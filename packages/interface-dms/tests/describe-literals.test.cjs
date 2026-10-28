const assert = require("node:assert/strict");
const test = require("node:test");
const { z } = require("zod");
const {
  RegisterBlockType,
  GetBlockType,
} = require("../dist/base/block-registry/registry");

function describeOption(option) {
  const type = `LiteralProbe${Math.random().toString(36).slice(2)}`;
  RegisterBlockType({
    type,
    componentName: "dms-literal-probe",
    meta: { name: type },
    schema: z.object({ option }),
  });
  return GetBlockType(type).config.option;
}

test("string, number and boolean literals keep their kind and carry their value", () => {
  assert.deepEqual(describeOption(z.literal("a")), {
    type: "string",
    enum: ["a"],
  });
  assert.deepEqual(describeOption(z.literal(3)), {
    type: "number",
    enum: [3],
  });
  assert.deepEqual(describeOption(z.literal(true)), {
    type: "boolean",
    enum: [true],
  });
  assert.deepEqual(describeOption(z.literal(false)), {
    type: "boolean",
    enum: [false],
  });
});

test("a literal JSON cannot hold is unknown with no enum, never a string enum of that value", () => {
  for (const literal of [
    z.literal(null),
    z.literal(undefined),
    z.literal(10n),
    z.literal(Symbol("s")),
    z.literal(Number.NaN),
    z.literal(Number.POSITIVE_INFINITY),
  ]) {
    assert.deepEqual(describeOption(literal), { type: "unknown" });
  }
});

test("a descriptor holding a bigint literal still serializes to JSON", () => {
  const described = describeOption(z.literal(10n));
  assert.equal(JSON.stringify(described), '{"type":"unknown"}');
});

test("a union of boolean literals merges into one boolean enum", () => {
  assert.deepEqual(
    describeOption(z.union([z.literal(true), z.literal(false)])),
    { type: "boolean", enum: [true, false] },
  );
});

test("a union of a string literal and null keeps both branches rather than a string enum holding null", () => {
  const described = describeOption(z.union([z.literal("a"), z.literal(null)]));
  assert.deepEqual(described, {
    type: "union",
    oneOf: [{ type: "string", enum: ["a"] }, { type: "unknown" }],
  });
});
