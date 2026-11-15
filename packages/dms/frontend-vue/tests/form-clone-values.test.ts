import { describe, expect, it } from "vitest";
import {
  cloneFormValue,
  snapshotFormState,
} from "../layers/dms-ui/app/composables/form/useForm";
import {
  cloneRecordValues,
  createBaseValidationSchema,
} from "../layers/dms-ui/app/build/composables/form/useFormModel";

describe("cloneRecordValues", () => {
  it("clones a record by value", () => {
    const record = { tags: ["a"], title: "t" };
    const cloned = cloneRecordValues(record);
    expect(cloned).toEqual(record);
    expect(cloned.tags).not.toBe(record.tags);
  });

  it("clones a record that is not a plain record to an empty one", () => {
    expect(cloneRecordValues(JSON.parse("null"))).toEqual({});
    expect(cloneRecordValues(JSON.parse("[1, 2]"))).toEqual({});
  });
});

describe("cloneFormValue", () => {
  it("keeps a value without clone as undefined", () => {
    expect(cloneFormValue(undefined)).toBeUndefined();
  });

  it("reads a date back as the string a JSON clone makes of it", () => {
    expect(cloneFormValue(new Date("2026-01-02T03:04:05.000Z"))).toBe(
      "2026-01-02T03:04:05.000Z",
    );
  });
});

describe("snapshotFormState", () => {
  it("leaves out a field that holds nothing", () => {
    expect(
      Object.keys(snapshotFormState({ title: "saved", note: undefined })),
    ).toEqual(["title"]);
  });
});

describe("createBaseValidationSchema", () => {
  it("falls back to an empty object schema for a schema that is not an object", () => {
    const schema = createBaseValidationSchema({ type: "string" });
    expect(Object.keys(schema.shape)).toEqual([]);
  });

  it("builds the object schema of an object schema", () => {
    const schema = createBaseValidationSchema({
      type: "object",
      properties: { title: { type: "string" } },
    });
    expect(Object.keys(schema.shape)).toEqual(["title"]);
  });
});
