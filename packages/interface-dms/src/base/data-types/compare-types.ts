// The default comparators: what each data type can do as a filter, and the
// shape its operand takes.
//
// A namespace of its own, separate from DefaultDataTypes and without a
// decorator: splitting it touches no registration.
//
// Split out of default-types.ts.

// Every DataCompareMode receives a `ValueProxy<unknown>` from the interface and
// narrows it to the shape its own data type stores. The two never overlap, so
// each of the thirteen narrowings needs the chain; the alternative is a generic
// on DataCompareMode.filter, which would ripple through every implementation.
/* oxlint-disable anti-slop/no-chained-type-assertions */
import type { RequestContext } from "@antelopejs/interface-api";
import { DataAPIMeta } from "@antelopejs/interface-data-api/metadata";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import { assertPrimitiveValue, parseValue } from "../../utils/value-parser";
import { isNumber } from "../../utils/type-check";
// Import from the defining leaf, not the table-view barrel: the barrel pulls
// in the assembled routes, whose composition runs at module evaluation — and
// this module sits on the import path of the pieces being composed.
// The cycle is what registers the default data types: they declare
// themselves through decorators, and this barrel is the only value
// path that evaluates them. Breaking it left the registry empty and
// every column serialised without a type, silently. Safe because
// neither side dereferences the other while it evaluates.
// oxlint-disable-next-line import/no-cycle
import { type DataCompareMode, RegisterDataCompareMode } from "./core";
export function absolutizeJoinedSchemas(meta: DataAPIMeta): void {
  if (meta.schemaName == null) {
    return;
  }
  for (const field of Object.values(meta.fields)) {
    if (field.joined && field.joined.schemaName == null) {
      field.joined.schemaName = meta.schemaName;
    }
  }
}

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
        return dbVal.gt(parsedValue.getTime());
      }
      return dbVal.gt(parsedValue);
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
        return dbVal.lt(parsedValue.getTime());
      }
      return dbVal.lt(parsedValue);
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
        return dbVal.ge(parsedValue.getTime());
      }
      return dbVal.ge(parsedValue);
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
        return dbVal.le(parsedValue.getTime());
      }
      return dbVal.le(parsedValue);
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

      return dbVal.ge(min as number).and(dbVal.le(max as number));
    }
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

      const dbVal = proxy as unknown as ValueProxy<unknown[]>;
      return dbVal.includes(parsedValue);
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

      const dbVal = proxy as unknown as ValueProxy<unknown[]>;
      return dbVal.includes(parsedValue).not();
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
