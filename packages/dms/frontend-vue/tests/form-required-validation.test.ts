import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { jsonSchemaToZod, type JsonSchema } from "json-schema-to-zod";
import {
  formIssueMessage,
  isBlankValue,
  REQUIRED_MESSAGE,
} from "../layers/dms-core/app/composables/useFormValidation";
import {
  type FormValidationField,
  type FormValidationIssue,
  unwrapUnionIssue,
  validateFormState,
} from "../layers/dms-ui/app/composables/form/formValidation";

// The client rebuilds the schema the backend serializes (see useForm's
// createBaseValidationSchema): the same round trip here, so each case reads
// what the form really validates with.
function roundTrip(
  shape: Record<string, z.ZodTypeAny>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const json = zodToJsonSchema(z.object(shape)) as unknown as JsonSchema;
  const code = jsonSchemaToZod(json, { module: "none" }).replace(
    /\.strict\(\)$/,
    ".passthrough()",
  );
  return new Function("z", `"use strict"; return (${code})`)(z);
}

// The backend's adaptFieldValidationSchema: optional is nullable+optional,
// required makes a text or a list non-empty.
function optional(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema.nullable().optional();
}

// DefaultDataTypes.DateType: an ISO date string or a Date.
function date(): z.ZodTypeAny {
  return z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/),
      z.date(),
    ])
    .transform((value) =>
      typeof value === "string" ? new Date(value) : value,
    );
}

function dateRange(): z.ZodTypeAny {
  return z.union([z.array(date()), z.object({ start: date(), end: date() })]);
}

// DefaultDataTypes.AddressType.
function address(): z.ZodTypeAny {
  return z.object({
    streetName: z.string().min(1),
    houseNumber: z.string().optional(),
    postalCode: z.string().min(1),
    city: z.string().min(1),
    countryCode: z.string().length(2),
  });
}

const REQUIRED = "This field is required.";
// What the form's error map does with a blank part: the required wording.
const errorMap: z.ZodErrorMap = (issue, context) => ({
  message:
    formIssueMessage(issue, context.data) === REQUIRED_MESSAGE
      ? REQUIRED
      : (issue.message ?? context.defaultError),
});

async function issuesOf(
  shape: Record<string, z.ZodTypeAny>,
  fields: FormValidationField[],
  state: Record<string, unknown>,
): Promise<FormValidationIssue[]> {
  const result = await validateFormState(roundTrip(shape), state, {
    fields,
    requiredMessage: REQUIRED,
    locale: "en",
    parseParams: { errorMap },
  });
  return "issues" in result ? result.issues : [];
}

async function valueOf(
  shape: Record<string, z.ZodTypeAny>,
  fields: FormValidationField[],
  state: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const result = await validateFormState(roundTrip(shape), state, {
    fields,
    requiredMessage: REQUIRED,
    locale: "en",
    parseParams: { errorMap },
  });
  return "value" in result ? result.value : undefined;
}

const required = (id: string, type?: string): FormValidationField => ({
  id,
  type,
  required: true,
});

describe("isBlankValue: what counts as empty, per type", () => {
  it.each([
    ["nothing", undefined, undefined],
    ["null", null, undefined],
    ["a blank text", "  ", undefined],
    ["no item", [], undefined],
    ["a cleared number", Number.NaN, undefined],
    ["an unpicked range", { start: undefined, end: undefined }, "date"],
    ["a range list of nothing", [undefined, undefined], "date"],
    ["an empty rich-text document", "<p></p>", "rich_text"],
    [
      "a rich-text document of spaces",
      "<p>&nbsp; </p><p><br></p>",
      "rich_text",
    ],
    [
      "an address of empty parts",
      { streetName: "", postalCode: "", city: "", countryCode: "" },
      "address",
    ],
    [
      "an image without a file",
      { key: "", alt: "", principal: false },
      "image",
    ],
    ["translations all blank", { en: "", fr: " " }, "string"],
  ])("%s is empty", (_label, value, type) => {
    expect(isBlankValue(value, type)).toBe(true);
  });

  it.each([
    ["zero", 0, "number"],
    ["false", false, "boolean"],
    ["a rich-text document with text", "<p>Hi</p>", "rich_text"],
    [
      "a rich-text document with only an image",
      '<p><img src="a"></p>',
      "rich_text",
    ],
    ["an address with a street", { streetName: "Rue", city: "" }, "address"],
    ["a picked date", "2026-10-02", "date"],
  ])("%s is a value", (_label, value, type) => {
    expect(isBlankValue(value, type)).toBe(false);
  });
});

describe("validateFormState: a required field left empty", () => {
  it("flags an unpicked date as required, not as an invalid value", async () => {
    const issues = await issuesOf(
      { due: date() },
      [required("due", "date")],
      {},
    );
    expect(issues).toEqual([{ message: REQUIRED, path: ["due"] }]);
  });

  it.each([
    ["a date", "date", date(), null],
    ["a date range", "date", dateRange(), { start: undefined, end: undefined }],
    ["a list of dates", "date", z.array(date()).min(1), []],
    ["a rich text", "rich_text", z.string().min(1), "<p></p>"],
    ["a number cleared to text", "number", z.number(), ""],
    ["a number cleared", "number", z.number(), Number.NaN],
    ["a select", "select", z.enum(["a", "b"]), undefined],
    ["a file", "file", z.string().min(1), ""],
    ["a gallery", "image", z.array(z.object({ key: z.string() })).min(1), []],
    ["a time", "string_time", z.number(), null],
  ])("flags %s as required", async (_label, type, schema, value) => {
    const issues = await issuesOf(
      { field: schema },
      [required("field", type)],
      { field: value },
    );
    expect(issues).toEqual([{ message: REQUIRED, path: ["field"] }]);
  });

  it("gives an empty address one required issue, not one per part", async () => {
    const issues = await issuesOf(
      { address: address() },
      [required("address", "address")],
      {
        address: { streetName: "", postalCode: "", city: "", countryCode: "" },
      },
    );
    expect(issues).toEqual([{ message: REQUIRED, path: ["address"] }]);
  });

  it("puts the error of a localized field on the language it shows", async () => {
    const issues = await issuesOf(
      { title: z.record(z.string(), z.string()) },
      [{ id: "title", type: "string", localized: true, required: true }],
      { title: { en: "", fr: "" } },
    );
    expect(issues).toEqual([{ message: REQUIRED, path: ["title", "en"] }]);
  });

  it("takes 0 as a value", async () => {
    const value = await valueOf(
      { count: z.number() },
      [required("count", "number")],
      { count: 0 },
    );
    expect(value).toEqual({ count: 0 });
  });

  it("lists the issues in the order of the fields", async () => {
    const issues = await issuesOf(
      { email: z.string().email(), due: date(), name: z.string().min(1) },
      [required("name"), required("email", "email"), required("due", "date")],
      { email: "nope" },
    );
    expect(issues.map((issue) => issue.path[0])).toEqual([
      "name",
      "email",
      "due",
    ]);
  });
});

describe("validateFormState: other errors", () => {
  it("names the missing part of a partly filled address", async () => {
    const issues = await issuesOf(
      { address: address() },
      [required("address", "address")],
      {
        address: {
          streetName: "Rue Neuve",
          postalCode: "",
          city: "Brussels",
          countryCode: "",
        },
      },
    );
    expect(issues).toEqual([
      { message: REQUIRED, path: ["address", "postalCode"] },
      { message: REQUIRED, path: ["address", "countryCode"] },
    ]);
  });

  it("names the missing end of a half-picked range", async () => {
    const issues = await issuesOf(
      { vacation: dateRange() },
      [required("vacation", "date")],
      { vacation: { start: "2026-10-01" } },
    );
    expect(issues).toEqual([{ message: REQUIRED, path: ["vacation", "end"] }]);
  });

  it("accepts a range as { start, end } or as a list", async () => {
    const fields = [required("vacation", "date")];
    for (const vacation of [
      { start: "2026-10-01", end: "2026-10-05" },
      ["2026-10-01", "2026-10-05"],
    ]) {
      expect(
        await issuesOf({ vacation: dateRange() }, fields, { vacation }),
      ).toEqual([]);
    }
  });

  it("keeps a type error once the field holds something", async () => {
    const issues = await issuesOf(
      { email: z.string().email() },
      [required("email", "email")],
      { email: "nope" },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toEqual(["email"]);
    expect(issues[0]!.message).not.toBe(REQUIRED);
  });
});

describe("validateFormState: an optional field left empty", () => {
  const optionalField = (id: string, type?: string): FormValidationField => ({
    id,
    type,
    required: false,
  });

  it("submits a cleared optional email as null instead of refusing it", async () => {
    const value = await valueOf(
      { email: optional(z.string().email()) },
      [optionalField("email", "email")],
      { email: "" },
    );
    expect(value).toEqual({ email: null });
  });

  it("submits an optional address of empty parts as null", async () => {
    const value = await valueOf(
      { address: optional(address()) },
      [optionalField("address", "address")],
      {
        address: { streetName: "", postalCode: "", city: "", countryCode: "" },
      },
    );
    expect(value).toEqual({ address: null });
  });

  it("keeps a blank optional text as it is when its type takes it", async () => {
    const value = await valueOf(
      { notes: optional(z.string()) },
      [optionalField("notes", "string")],
      { notes: "" },
    );
    expect(value).toEqual({ notes: "" });
  });

  it("reads a switch never touched as off", async () => {
    const value = await valueOf(
      { done: z.boolean() },
      [optionalField("done", "boolean")],
      {},
    );
    expect(value).toEqual({ done: false });
  });

  it("names the missing part of a partly filled optional address", async () => {
    const issues = await issuesOf(
      { address: optional(address()) },
      [optionalField("address", "address")],
      {
        address: {
          streetName: "Rue Neuve",
          postalCode: "1000",
          city: "",
          countryCode: "BE",
        },
      },
    );
    expect(issues).toEqual([{ message: REQUIRED, path: ["address", "city"] }]);
  });
});

describe("unwrapUnionIssue", () => {
  it("keeps a union issue when several branches are of the value's type", () => {
    const schema = z.union([z.string().email(), z.string().url()]);
    const result = schema.safeParse("nope");
    expect(result.success).toBe(false);
    const [issue] = result.error!.issues;
    expect(unwrapUnionIssue(issue!)).toEqual([issue]);
  });

  it("takes the issues of the one branch of the value's type", () => {
    const schema = z.union([z.object({ a: z.string() }), z.null()]);
    const result = schema.safeParse({});
    const issues = result.error!.issues.flatMap(unwrapUnionIssue);
    expect(issues.map((issue) => issue.path)).toEqual([["a"]]);
  });
});
