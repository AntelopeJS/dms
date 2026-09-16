import { expect } from "chai";
import {
  isBigint,
  isBoolean,
  isDate,
  isFunction,
  isJSON,
  isNull,
  isNumber,
  isObject,
  isPrimitive,
  isString,
  isSymbol,
  isUndefined,
} from "@antelopejs/interface-dms/utils/type-check";

const SAMPLE_STRING = "hello";
const SAMPLE_NUMBER = 42;
const SAMPLE_BIGINT = 10n;
const SAMPLE_OBJECT_JSON = '{"a":1}';
const SAMPLE_ARRAY_JSON = "[1,2,3]";
const SAMPLE_NUMBER_JSON = "5";
const SAMPLE_INVALID_JSON = "not json";

describe("[unit] utils/type-check", () => {
  describe("isString", () => {
    it("returns true for a string", () => {
      expect(isString(SAMPLE_STRING)).to.equal(true);
    });

    it("returns false for non-strings", () => {
      expect(isString(SAMPLE_NUMBER)).to.equal(false);
      expect(isString(null)).to.equal(false);
      expect(isString(undefined)).to.equal(false);
    });
  });

  describe("isNumber", () => {
    it("returns true for numbers including NaN", () => {
      expect(isNumber(SAMPLE_NUMBER)).to.equal(true);
      expect(isNumber(Number.NaN)).to.equal(true);
    });

    it("returns false for non-numbers", () => {
      expect(isNumber(SAMPLE_STRING)).to.equal(false);
      expect(isNumber(SAMPLE_BIGINT)).to.equal(false);
    });
  });

  describe("isBoolean", () => {
    it("returns true for booleans", () => {
      expect(isBoolean(true)).to.equal(true);
      expect(isBoolean(false)).to.equal(true);
    });

    it("returns false for truthy/falsy non-booleans", () => {
      expect(isBoolean(1)).to.equal(false);
      expect(isBoolean(0)).to.equal(false);
      expect(isBoolean("true")).to.equal(false);
    });
  });

  describe("isUndefined", () => {
    it("returns true only for undefined", () => {
      expect(isUndefined(undefined)).to.equal(true);
      expect(isUndefined(null)).to.equal(false);
    });
  });

  describe("isObject", () => {
    it("returns true for plain objects, arrays and null", () => {
      expect(isObject({})).to.equal(true);
      expect(isObject([])).to.equal(true);
      expect(isObject(null)).to.equal(true);
    });

    it("returns false for primitives", () => {
      expect(isObject(SAMPLE_STRING)).to.equal(false);
      expect(isObject(SAMPLE_NUMBER)).to.equal(false);
    });
  });

  describe("isFunction", () => {
    it("returns true for functions", () => {
      expect(isFunction(() => undefined)).to.equal(true);
      expect(isFunction(function namedFunction() {})).to.equal(true);
    });

    it("returns false for non-functions", () => {
      expect(isFunction({})).to.equal(false);
    });
  });

  describe("isBigint", () => {
    it("returns true for bigints", () => {
      expect(isBigint(SAMPLE_BIGINT)).to.equal(true);
    });

    it("returns false for plain numbers", () => {
      expect(isBigint(SAMPLE_NUMBER)).to.equal(false);
    });
  });

  describe("isSymbol", () => {
    it("returns true for symbols", () => {
      expect(isSymbol(Symbol("x"))).to.equal(true);
    });

    it("returns false for strings", () => {
      expect(isSymbol(SAMPLE_STRING)).to.equal(false);
    });
  });

  describe("isNull", () => {
    it("returns true only for null", () => {
      expect(isNull(null)).to.equal(true);
      expect(isNull(undefined)).to.equal(false);
      expect(isNull(0)).to.equal(false);
    });
  });

  describe("isDate", () => {
    it("returns true for valid Date instances", () => {
      expect(isDate(new Date())).to.equal(true);
    });

    it("returns false for invalid Date instances", () => {
      expect(isDate(new Date("not-a-date"))).to.equal(false);
    });

    it("returns false for non-Date values", () => {
      expect(isDate("2024-01-01")).to.equal(false);
      expect(isDate(0)).to.equal(false);
    });
  });

  describe("isPrimitive", () => {
    it("returns true for primitive values", () => {
      const primitives: unknown[] = [
        SAMPLE_STRING,
        SAMPLE_NUMBER,
        true,
        undefined,
        SAMPLE_BIGINT,
        Symbol("s"),
      ];
      for (const value of primitives) {
        expect(isPrimitive(value), `value=${String(value)}`).to.equal(true);
      }
    });

    it("returns false for objects and functions", () => {
      const nonPrimitives: unknown[] = [{}, [], () => undefined, new Date()];
      for (const value of nonPrimitives) {
        expect(isPrimitive(value), `value=${String(value)}`).to.equal(false);
      }
    });
  });

  describe("isJSON", () => {
    it("returns true for JSON objects and arrays", () => {
      expect(isJSON(SAMPLE_OBJECT_JSON)).to.equal(true);
      expect(isJSON(SAMPLE_ARRAY_JSON)).to.equal(true);
    });

    it("returns false for invalid JSON strings", () => {
      expect(isJSON(SAMPLE_INVALID_JSON)).to.equal(false);
    });

    it("returns false for JSON primitives (numbers)", () => {
      expect(isJSON(SAMPLE_NUMBER_JSON)).to.equal(false);
    });

    it("returns false for non-strings", () => {
      expect(isJSON(SAMPLE_NUMBER)).to.equal(false);
      expect(isJSON(null)).to.equal(false);
    });
  });
});
