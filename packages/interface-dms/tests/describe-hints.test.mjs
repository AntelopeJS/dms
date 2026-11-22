import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { ui } from "../dist/base/block-registry/helpers.js";
import {
  RegisterBlockType,
  GetBlockType,
} from "../dist/base/block-registry/registry.js";

/** @param {import("zod").ZodType} option */
function describeOption(option) {
  const type = `HintProbe${Math.random().toString(36).slice(2)}`;
  RegisterBlockType({
    type,
    componentName: "dms-hint-probe",
    meta: { name: type },
    schema: z.object({ option }),
  });
  return GetBlockType(type).config.option;
}

await test("hints and a description set before a refine survive it, though zod 4 clones the schema rather than wrapping it", () => {
  const option = ui(z.string().describe("Where it goes."), {
    label: "Link",
    widget: "url",
  })
    .refine((value) => value.startsWith("/"))
    .optional();
  assert.deepEqual(describeOption(option), {
    type: "string",
    optional: true,
    description: "Where it goes.",
    ui: { label: "Link", widget: "url" },
  });
});

await test("a transformed option is described by the input it accepts, and a preprocessed one by the schema it feeds", () => {
  assert.deepEqual(
    describeOption(z.string().transform((value) => value.length)),
    { type: "string" },
  );
  assert.deepEqual(
    describeOption(z.preprocess((value) => Number(value), z.number())),
    {
      type: "number",
    },
  );
});
