import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  RegisterBlockType,
  GetBlockType,
} from "../dist/base/block-registry/registry.js";

/** @param {import("zod").ZodTypeAny} option */
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

await test("string, number and boolean literals keep their kind and carry their value", () => {
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

await test("a literal JSON cannot hold is unknown with no enum, never a string enum of that value", () => {
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

await test("a descriptor holding a bigint literal still serializes to JSON", () => {
  const described = describeOption(z.literal(10n));
  assert.equal(JSON.stringify(described), '{"type":"unknown"}');
});

await test("a union of boolean literals merges into one boolean enum", () => {
  assert.deepEqual(
    describeOption(z.union([z.literal(true), z.literal(false)])),
    { type: "boolean", enum: [true, false] },
  );
});

await test("a union of a string literal and null keeps both branches rather than a string enum holding null", () => {
  const described = describeOption(z.union([z.literal("a"), z.literal(null)]));
  assert.deepEqual(described, {
    type: "union",
    oneOf: [{ type: "string", enum: ["a"] }, { type: "unknown" }],
  });
});

await test("an enum option lists its values in a copy, so freezing the descriptor never reaches zod's own list", () => {
  const schema = z.enum(["draft", "sent"]);
  const described = describeOption(schema);
  assert.deepEqual(described.enum, ["draft", "sent"]);
  assert.notEqual(described.enum, schema.options);
});
