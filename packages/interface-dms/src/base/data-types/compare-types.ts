/* oxlint-disable anti-slop/no-chained-type-assertions -- A direct cast compiles; keep the chain through unknown unchanged so this link stays comment-only. */
import type { RequestContext } from "@antelopejs/interface-api";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import {
  assertPrimitiveValue,
  parseValue,
} from "../../utils/internal/value-parser";
import { isNumber } from "../../utils/internal/type-check";
import { whenValueSet } from "./internal/compare-types";
// oxlint-disable-next-line import/no-cycle -- Built-in comparator decorators register through the shared core registry before column serialization.
import { type DataCompareMode, RegisterDataCompareMode } from "./core";

export namespace DefaultDataCompareTypes {
  @RegisterDataCompareMode("is")
  export class Is implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);
      assertPrimitiveValue(parsedValue);

      const dbVal = proxy as unknown as ValueProxy<number>;
      if (parsedValue instanceof Date) {
        return dbVal.eq(parsedValue.getTime());
      }
      return dbVal.eq(parsedValue);
    }
  }

  @RegisterDataCompareMode("is_not")
  export class IsNot implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);
      assertPrimitiveValue(parsedValue);

      const dbVal = proxy as unknown as ValueProxy<number>;
      if (parsedValue instanceof Date) {
        return dbVal.ne(parsedValue.getTime());
      }
      return dbVal.ne(parsedValue);
    }
  }

  @RegisterDataCompareMode("greater_than")
  export class GreaterThan implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);

      if (!isNumber(parsedValue) && !(parsedValue instanceof Date)) {
        throw new Error(
          `Value must be a number or Date for greater than comparison. Got: ${typeof parsedValue}`,
        );
      }

      const dbVal = proxy as unknown as ValueProxy<number>;
      if (parsedValue instanceof Date) {
        return whenValueSet(proxy, dbVal.gt(parsedValue.getTime()));
      }
      return whenValueSet(proxy, dbVal.gt(parsedValue));
    }
  }

  @RegisterDataCompareMode("less_than")
  export class LessThan implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);

      if (!isNumber(parsedValue) && !(parsedValue instanceof Date)) {
        throw new Error(
          `Value must be a number or Date for less than comparison. Got: ${typeof parsedValue}`,
        );
      }

      const dbVal = proxy as unknown as ValueProxy<number>;
      if (parsedValue instanceof Date) {
        return whenValueSet(proxy, dbVal.lt(parsedValue.getTime()));
      }
      return whenValueSet(proxy, dbVal.lt(parsedValue));
    }
  }

  @RegisterDataCompareMode("greater_than_or_equal_to")
  export class GreaterThanOrEqualTo implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);

      if (!isNumber(parsedValue) && !(parsedValue instanceof Date)) {
        throw new Error(
          `Value must be a number or Date for greater than or equal to comparison. Got: ${typeof parsedValue}`,
        );
      }

      const dbVal = proxy as unknown as ValueProxy<number>;
      if (parsedValue instanceof Date) {
        return whenValueSet(proxy, dbVal.ge(parsedValue.getTime()));
      }
      return whenValueSet(proxy, dbVal.ge(parsedValue));
    }
  }

  @RegisterDataCompareMode("less_than_or_equal_to")
  export class LessThanOrEqualTo implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);

      if (!isNumber(parsedValue) && !(parsedValue instanceof Date)) {
        throw new Error(
          `Value must be a number or Date for less than or equal to comparison. Got: ${typeof parsedValue}`,
        );
      }

      const dbVal = proxy as unknown as ValueProxy<number>;
      if (parsedValue instanceof Date) {
        return whenValueSet(proxy, dbVal.le(parsedValue.getTime()));
      }
      return whenValueSet(proxy, dbVal.le(parsedValue));
    }
  }

  @RegisterDataCompareMode("is_empty", true)
  export class IsEmpty implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      _value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const dbVal = proxy as unknown as ValueProxy<string>;
      return dbVal.default(null).eq(null);
    }
  }

  @RegisterDataCompareMode("is_not_empty", true)
  export class IsNotEmpty implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      _value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const dbVal = proxy as unknown as ValueProxy<string>;
      return dbVal.default(null).ne(null);
    }
  }

  @RegisterDataCompareMode("is_between")
  export class IsBetween implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedArray = value.split(",").map((v) => parseValue(v.trim())) as [
        number | Date,
        number | Date,
      ];

      if (
        parsedArray.length !== 2 ||
        parsedArray.some((v) => {
          return !isNumber(v) && !(v instanceof Date);
        })
      ) {
        throw new Error(
          `Value must be an array of two numbers or dates for is_between comparison. Got: ${value}`,
        );
      }
      const [min, max] = parsedArray;
      const dbVal = proxy as unknown as ValueProxy<number>;

      return whenValueSet(
        proxy,
        dbVal.ge(min as number).and(dbVal.le(max as number)),
      );
    }
  }

  function arrayOrEmpty(proxy: ValueProxy<unknown>): ValueProxy<unknown[]> {
    return (proxy as unknown as ValueProxy<unknown[]>).default([]);
  }

  @RegisterDataCompareMode("include")
  export class Include implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);
      assertPrimitiveValue(parsedValue);

      return arrayOrEmpty(proxy).includes(parsedValue);
    }
  }

  @RegisterDataCompareMode("exclude")
  export class Exclude implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);
      assertPrimitiveValue(parsedValue);

      return arrayOrEmpty(proxy).includes(parsedValue).not();
    }
  }

  const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

  export function escapeRegex(str: string): string {
    return str.replace(REGEX_SPECIAL_CHARS, "\\$&");
  }

  @RegisterDataCompareMode("contains")
  export class Contains implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const dbVal = proxy as ValueProxy<string>;
      const escapedValue = escapeRegex(value);
      return dbVal.match(`(?i)${escapedValue}`);
    }
  }

  @RegisterDataCompareMode("not_contains")
  export class NotContains implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const dbVal = proxy as ValueProxy<string>;
      const escapedValue = escapeRegex(value);
      return dbVal.match(`(?i)${escapedValue}`).not();
    }
  }

  @RegisterDataCompareMode("array_contains_string")
  export class ArrayContainsString implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const dbVal = proxy as ValueProxy<string[]>;
      const escapedValue = escapeRegex(value);

      return dbVal
        .default([])
        .filter((item: ValueProxy<string>) => {
          return item.match(`(?i)${escapedValue}`);
        })
        .count()
        .gt(0);
    }
  }
}
