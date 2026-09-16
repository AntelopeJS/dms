import { describe, expect, it } from "vitest";
import {
  parse,
  parseObject,
} from "../layers/dms-core/app/utils/stringTypeParser";

const FUNCTION_STRINGS = [
  "(x) => x + 1",
  "x => x * 2",
  "function(a) { return a }",
  '(() => { throw new Error("Input executed"); })()',
  'function() {} , (() => { throw new Error("Input executed"); })()',
];

describe("stringTypeParser", () => {
  it("preserves supported data conversions", () => {
    expect(
      parseObject([
        { key: "enabled", value: "true" },
        { key: "disabled", value: "false" },
        { key: "count", value: "42" },
        { key: "ratio", value: "3.14" },
        { key: "empty", value: "null" },
        { key: "missing", value: "undefined" },
        { key: "date", value: "2024-01-01" },
        { key: "object", value: '{"key":"value"}' },
        { key: "array", value: "[1,2,3]" },
        { key: "name", value: "hello world" },
      ]),
    ).toEqual({
      enabled: true,
      disabled: false,
      count: 42,
      ratio: 3.14,
      empty: null,
      missing: undefined,
      date: new Date("2024-01-01T00:00:00.000Z"),
      object: { key: "value" },
      array: [1, 2, 3],
      name: "hello world",
    });
  });

  it.each(FUNCTION_STRINGS)("preserves function syntax: %s", (input) => {
    expect(parse(input)).toBe(input);
    expect(parseObject([{ key: "filter", value: input }])).toEqual({
      filter: input,
    });
  });
});
