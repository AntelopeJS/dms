import type { RequestContext } from "@antelopejs/interface-api";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import {
  assertPrimitiveValue,
  parseValue,
  type Primitive,
} from "../../utils/internal/value-parser";
import { isNumber } from "../../utils/internal/type-check";
import { whenValueSet } from "./internal/compare-types";
import { type DataCompareMode, RegisterDataCompareMode } from "./core";

export namespace DefaultDataCompareTypes {
  @RegisterDataCompareMode("is")
  export class Is implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);
      assertPrimitiveValue(parsedValue);

      if (parsedValue instanceof Date) {
        return proxy.eq(parsedValue.getTime());
      }
      return proxy.eq(parsedValue);
    }
  }

  @RegisterDataCompareMode("is_not")
  export class IsNot implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);
      assertPrimitiveValue(parsedValue);

      if (parsedValue instanceof Date) {
        return proxy.ne(parsedValue.getTime());
      }
      return proxy.ne(parsedValue);
    }
  }

  @RegisterDataCompareMode("greater_than")
  export class GreaterThan implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);

      if (!isNumber(parsedValue) && !(parsedValue instanceof Date)) {
        throw new Error(
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the existing diagnostic representation for rejected parsed filter values.
          `Value must be a number or Date for greater than comparison. Got: ${typeof parsedValue}`,
        );
      }

      if (parsedValue instanceof Date) {
        return whenValueSet(proxy, proxy.gt(parsedValue.getTime()));
      }
      return whenValueSet(proxy, proxy.gt(parsedValue));
    }
  }

  @RegisterDataCompareMode("less_than")
  export class LessThan implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);

      if (!isNumber(parsedValue) && !(parsedValue instanceof Date)) {
        throw new Error(
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the existing diagnostic representation for rejected parsed filter values.
          `Value must be a number or Date for less than comparison. Got: ${typeof parsedValue}`,
        );
      }

      if (parsedValue instanceof Date) {
        return whenValueSet(proxy, proxy.lt(parsedValue.getTime()));
      }
      return whenValueSet(proxy, proxy.lt(parsedValue));
    }
  }

  @RegisterDataCompareMode("greater_than_or_equal_to")
  export class GreaterThanOrEqualTo implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);

      if (!isNumber(parsedValue) && !(parsedValue instanceof Date)) {
        throw new Error(
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the existing diagnostic representation for rejected parsed filter values.
          `Value must be a number or Date for greater than or equal to comparison. Got: ${typeof parsedValue}`,
        );
      }

      if (parsedValue instanceof Date) {
        return whenValueSet(proxy, proxy.ge(parsedValue.getTime()));
      }
      return whenValueSet(proxy, proxy.ge(parsedValue));
    }
  }

  @RegisterDataCompareMode("less_than_or_equal_to")
  export class LessThanOrEqualTo implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const parsedValue = parseValue(value);

      if (!isNumber(parsedValue) && !(parsedValue instanceof Date)) {
        throw new Error(
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the existing diagnostic representation for rejected parsed filter values.
          `Value must be a number or Date for less than or equal to comparison. Got: ${typeof parsedValue}`,
        );
      }

      if (parsedValue instanceof Date) {
        return whenValueSet(proxy, proxy.le(parsedValue.getTime()));
      }
      return whenValueSet(proxy, proxy.le(parsedValue));
    }
  }

  @RegisterDataCompareMode("is_empty", true)
  export class IsEmpty implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      _value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      return proxy.default(null).eq(null);
    }
  }

  @RegisterDataCompareMode("is_not_empty", true)
  export class IsNotEmpty implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      _value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      return proxy.default(null).ne(null);
    }
  }

  function epochBound(bound: Primitive): number | undefined {
    if (bound instanceof Date) {
      return bound.getTime();
    }
    return isNumber(bound) ? bound : undefined;
  }

  @RegisterDataCompareMode("is_between")
  export class IsBetween implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const bounds = value
        .split(",")
        .map((bound) => epochBound(parseValue(bound.trim())));
      const [min, max] = bounds;

      if (bounds.length !== 2 || min === undefined || max === undefined) {
        throw new Error(
          `Value must be an array of two numbers or dates for is_between comparison. Got: ${value}`,
        );
      }

      return whenValueSet(proxy, proxy.ge(min).and(proxy.le(max)));
    }
  }

  function arrayOrEmpty(proxy: ValueProxy<unknown>): ValueProxy<unknown[]> {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The public unknown proxy does not establish an array field; inclusion modes delegate that assumption to the database.
    return (proxy as ValueProxy<unknown[]>).default([]);
  }

  @RegisterDataCompareMode("include")
  export class Include implements DataCompareMode {
    filter(
      _context: RequestContext,
      proxy: ValueProxy<unknown>,
      _key: string,
      value: string,
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
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
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
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
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const dbVal = proxy;
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
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      const dbVal = proxy;
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
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published comparator accepts arbitrary application rows, even though this mode does not read them.
      _row: ValueProxy<Record<string, unknown>>,
    ): ValueProxyOrValue<boolean> {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The public unknown proxy does not establish string elements; the existing mode delegates array matching to the database.
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
