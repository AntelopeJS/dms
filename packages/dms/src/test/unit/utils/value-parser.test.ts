import { expect } from "chai";
import {
  assertPrimitiveValue,
  isStringDate,
  isStringJSON,
  isStringKeyword,
  isStringNumber,
  parseObject,
  parseValue,
} from "@antelopejs/interface-dms/utils/value-parser";

const KEYWORD_TRUE = "true";
const KEYWORD_FALSE = "false";
const KEYWORD_NULL = "null";
const KEYWORD_UNDEFINED = "undefined";
const INTEGER_STRING = "42";
const FLOAT_STRING = "3.14";
const ISO_DATE_STRING = "2024-01-01";
const ISO_DATETIME_STRING = "2024-01-01T12:00:00Z";
const OBJECT_JSON_STRING = '{"key":"value"}';
const ARRAY_JSON_STRING = "[1,2,3]";
const ARROW_FUNCTION_STRING = "(x) => x + 1";
const NAMED_ARROW_FUNCTION_STRING = "x => x * 2";
const CLASSIC_FUNCTION_STRING = "function(a) { return a }";
const FUNCTION_STRINGS = [
  ARROW_FUNCTION_STRING,
  NAMED_ARROW_FUNCTION_STRING,
  CLASSIC_FUNCTION_STRING,
  '(() => { throw new Error("Input executed"); })()',
  'function() {} , (() => { throw new Error("Input executed"); })()',
];
const PLAIN_STRING = "hello world";
const INVALID_DATE_STRING = "2024-13-45";
const NOT_A_NUMBER_STRING = "abc";

describe("[unit] utils/value-parser", () => {
  describe("isStringKeyword", () => {
    it("recognises the four reserved keywords", () => {
      expect(isStringKeyword(KEYWORD_TRUE)).to.equal(true);
      expect(isStringKeyword(KEYWORD_FALSE)).to.equal(true);
      expect(isStringKeyword(KEYWORD_NULL)).to.equal(true);
      expect(isStringKeyword(KEYWORD_UNDEFINED)).to.equal(true);
    });

    it("returns false for other strings", () => {
      expect(isStringKeyword(PLAIN_STRING)).to.equal(false);
      expect(isStringKeyword("TRUE")).to.equal(false);
    });
  });

  describe("isStringNumber", () => {
    it("recognises integers and floats", () => {
      expect(isStringNumber(INTEGER_STRING)).to.equal(true);
      expect(isStringNumber(FLOAT_STRING)).to.equal(true);
      expect(isStringNumber("-5")).to.equal(true);
    });

    it("rejects the empty string and non-numeric strings", () => {
      expect(isStringNumber("")).to.equal(false);
      expect(isStringNumber(NOT_A_NUMBER_STRING)).to.equal(false);
    });
  });

  describe("isStringDate", () => {
    it("recognises ISO date strings", () => {
      expect(isStringDate(ISO_DATE_STRING)).to.equal(true);
      expect(isStringDate(ISO_DATETIME_STRING)).to.equal(true);
    });

    it("rejects invalid calendar dates", () => {
      expect(isStringDate(INVALID_DATE_STRING)).to.equal(false);
    });

    it("rejects non-ISO-shaped strings", () => {
      expect(isStringDate("01/01/2024")).to.equal(false);
      expect(isStringDate(PLAIN_STRING)).to.equal(false);
    });
  });

  describe("isStringJSON", () => {
    it("accepts objects, arrays, and JSON primitives", () => {
      expect(isStringJSON(OBJECT_JSON_STRING)).to.equal(true);
      expect(isStringJSON(ARRAY_JSON_STRING)).to.equal(true);
      expect(isStringJSON(INTEGER_STRING)).to.equal(true);
    });

    it("rejects malformed JSON strings", () => {
      expect(isStringJSON("{invalid}")).to.equal(false);
    });
  });

  describe("parseValue", () => {
    const cases: Array<{ label: string; input: string; expected: unknown }> = [
      { label: "true keyword", input: KEYWORD_TRUE, expected: true },
      { label: "false keyword", input: KEYWORD_FALSE, expected: false },
      { label: "null keyword", input: KEYWORD_NULL, expected: null },
      {
        label: "undefined keyword",
        input: KEYWORD_UNDEFINED,
        expected: undefined,
      },
      { label: "integer string", input: INTEGER_STRING, expected: 42 },
      { label: "float string", input: FLOAT_STRING, expected: 3.14 },
    ];

    for (const { label, input, expected } of cases) {
      it(`parses ${label}`, () => {
        expect(parseValue(input)).to.equal(expected);
      });
    }

    it("parses an ISO date string into a Date", () => {
      const parsed = parseValue(ISO_DATE_STRING);
      expect(parsed).to.be.instanceOf(Date);
      expect((parsed as Date).toISOString().startsWith("2024-01-01")).to.equal(
        true,
      );
    });

    it("parses a JSON object string", () => {
      expect(parseValue(OBJECT_JSON_STRING)).to.deep.equal({ key: "value" });
    });

    it("parses a JSON array string", () => {
      expect(parseValue(ARRAY_JSON_STRING)).to.deep.equal([1, 2, 3]);
    });

    for (const input of FUNCTION_STRINGS) {
      it(`preserves function syntax without execution: ${input}`, () => {
        expect(parseValue(input)).to.equal(input);
      });
    }

    it("returns the original string when no parser matches", () => {
      expect(parseValue(PLAIN_STRING)).to.equal(PLAIN_STRING);
    });
  });

  describe("parseObject", () => {
    it("returns an empty object for an empty array", () => {
      expect(parseObject([])).to.deep.equal({});
    });

    it("preserves function strings without executing them", () => {
      for (const value of FUNCTION_STRINGS) {
        expect(parseObject([{ key: "filter", value }])).to.deep.equal({
          filter: value,
        });
      }
    });

    it("parses key-value pairs into typed values", () => {
      const result = parseObject([
        { key: "enabled", value: KEYWORD_TRUE },
        { key: "count", value: INTEGER_STRING },
        { key: "name", value: PLAIN_STRING },
      ]);
      expect(result).to.deep.equal({
        enabled: true,
        count: 42,
        name: PLAIN_STRING,
      });
    });

    it("overwrites duplicate keys with the latest value", () => {
      const result = parseObject([
        { key: "count", value: "1" },
        { key: "count", value: "2" },
      ]);
      expect(result).to.deep.equal({ count: 2 });
    });
  });

  describe("assertPrimitiveValue", () => {
    it("does not throw for valid primitive values", () => {
      const validValues: unknown[] = [
        PLAIN_STRING,
        42,
        true,
        false,
        null,
        new Date(),
      ];
      for (const value of validValues) {
        expect(() => assertPrimitiveValue(value)).not.to.throw();
      }
    });

    it("throws for unsupported values", () => {
      const invalidValues: unknown[] = [undefined, {}, [], Symbol("x")];
      for (const value of invalidValues) {
        expect(() => assertPrimitiveValue(value)).to.throw();
      }
    });
  });
});
