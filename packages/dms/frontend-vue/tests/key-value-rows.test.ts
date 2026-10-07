import { describe, expect, it } from "vitest";
import {
  keyValueObject,
  keyValueProblem,
  keyValueRows,
} from "../layers/dms-ui/app/build/composables/form/keyValueRows";

describe("key-value rows", () => {
  it("reads an object as rows, and back", () => {
    const value = { Accept: "*/*", "X-Trace": "on" };
    const rows = keyValueRows(value, false);
    expect(rows).toEqual([
      { key: "Accept", value: "*/*" },
      { key: "X-Trace", value: "on" },
    ]);
    expect(keyValueObject(rows, false)).toEqual(value);
  });

  it("reads and writes { value, enabled } when toggleable", () => {
    const value = { retries: { value: 3, enabled: false } };
    const rows = keyValueRows(value, true);
    expect(rows).toEqual([{ key: "retries", value: 3, enabled: false }]);
    expect(keyValueObject(rows, true)).toEqual(value);
    expect(keyValueObject([{ key: "new" }], true)).toEqual({
      new: { value: null, enabled: true },
    });
  });

  it("drops the rows nobody filled, and trims the names", () => {
    expect(keyValueObject([{}, { key: " a ", value: "1" }], false)).toEqual({
      a: "1",
    });
  });

  it("says when a value has no name, or a name comes twice", () => {
    expect(keyValueProblem([{ key: "", value: "x" }])).toBe(
      "$dms.field_errors.key_missing",
    );
    expect(
      keyValueProblem([
        { key: "a", value: "1" },
        { key: "a ", value: "2" },
      ]),
    ).toBe("$dms.field_errors.key_duplicate");
    expect(keyValueProblem([{}, { key: "a", value: "1" }])).toBeUndefined();
  });

  it("reads nothing as no rows", () => {
    expect(keyValueRows(null, false)).toEqual([]);
    expect(keyValueRows(undefined, true)).toEqual([]);
  });
});
