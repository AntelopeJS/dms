import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { jsonSchemaToZod, type JsonSchema } from "json-schema-to-zod";
import {
  buildValidationSchema,
  makeFieldSchemaRequired,
} from "../layers/dms-ui/app/composables/form/useForm";

// Rebuild the exact client-side schema the form uses: the backend serializes an
// optional field as `nullable().optional()`, `zodToJsonSchema` emits
// `{"type":["string","null"]}`, and `json-schema-to-zod` reconstructs it as
// `z.union([z.string(), z.null()]).optional()`.
function roundTrippedOptionalString(): z.ZodTypeAny {
  const source = z.object({ value: z.string().nullable().optional() });
  const json = zodToJsonSchema(source) as unknown as JsonSchema;
  const code = jsonSchemaToZod(json, { module: "none" }).replace(
    /\.strict\(\)$/,
    ".passthrough()",
  );
  const reconstructed = new Function("z", `"use strict"; return (${code})`)(
    z,
  ) as z.ZodObject<{ value: z.ZodTypeAny }>;
  return reconstructed.shape.value;
}

describe("makeFieldSchemaRequired", () => {
  it("enforces a non-empty value through the nullable+optional round-trip", () => {
    const required = makeFieldSchemaRequired(roundTrippedOptionalString());

    expect(required.safeParse(undefined).success).to.equal(false);
    expect(required.safeParse("").success).to.equal(false);
    expect(required.safeParse(null).success).to.equal(false);
    expect(required.safeParse("Ada").success).to.equal(true);
  });

  it("requires a non-empty array for an optional array field", () => {
    const required = makeFieldSchemaRequired(z.array(z.string()).optional());

    expect(required.safeParse([]).success).to.equal(false);
    expect(required.safeParse(["role"]).success).to.equal(true);
  });

  it("leaves a union it cannot reduce to a single type untouched", () => {
    const union = z.union([z.string(), z.number()]);
    expect(makeFieldSchemaRequired(union)).to.equal(union);
  });
});

describe("buildValidationSchema", () => {
  const baseSchema = z.object({
    firstname: roundTrippedOptionalString(),
    lastname: roundTrippedOptionalString(),
  }) as z.ZodObject<Record<string, z.ZodTypeAny>>;

  it("returns the base schema when nothing is toggled", () => {
    expect(
      buildValidationSchema(baseSchema, undefined, undefined, undefined),
    ).to.equal(baseSchema);
  });

  it("makes only the required fields non-empty", () => {
    const schema = buildValidationSchema(
      baseSchema,
      undefined,
      undefined,
      new Set(["firstname"]),
    );

    expect(schema.safeParse({ firstname: "", lastname: "" }).success).to.equal(
      false,
    );
    expect(
      schema.safeParse({ firstname: "Ada", lastname: "" }).success,
    ).to.equal(true);
  });

  it("keeps a hidden field optional even when also required", () => {
    const schema = buildValidationSchema(
      baseSchema,
      undefined,
      new Set(["firstname"]),
      new Set(["firstname"]),
    );

    expect(schema.safeParse({ firstname: "" }).success).to.equal(true);
  });
});
