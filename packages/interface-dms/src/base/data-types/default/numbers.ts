/** Stable number, string and date data types. @packageDocumentation */
import type { RequestContext } from "@antelopejs/interface-api";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import { z } from "zod";
import { parseValue } from "../../../utils/internal/value-parser";
import { isString } from "../../../utils/internal/type-check";
import { FormComponents } from "../../form-schema";
import { DataType, RegisterDataType } from "../core";
import { whenValueSet } from "../internal/compare-types";
import { DefaultDataCompareTypes } from "../compare-types";
import {
  NumberTypeOptions,
  StringTypeOptions,
  DateTypeOptions,
} from "./options";

@RegisterDataType("number")
export class NumberType extends DataType {
  constructor(public readonly options: NumberTypeOptions = {}) {
    super(
      [
        DefaultDataCompareTypes.Is,
        DefaultDataCompareTypes.IsNot,
        DefaultDataCompareTypes.GreaterThan,
        DefaultDataCompareTypes.GreaterThanOrEqualTo,
        DefaultDataCompareTypes.LessThan,
        DefaultDataCompareTypes.LessThanOrEqualTo,
        DefaultDataCompareTypes.IsEmpty,
        DefaultDataCompareTypes.IsNotEmpty,
      ],
      DefaultDataCompareTypes.Is,
      options,
    );
  }

  protected defaultInputComponent() {
    return FormComponents.InputNumber({
      min: this.options.min,
      max: this.options.max,
      step: this.options.step,
      placeholder: this.options.placeholder,
      suffix: this.options.suffix,
      width: this.options.width,
    });
  }

  getValidation() {
    let schema = z.number();

    if (this.options.min !== undefined) {
      schema = schema.min(this.options.min);
    }
    if (this.options.max !== undefined) {
      schema = schema.max(this.options.max);
    }

    return schema;
  }
}

@RegisterDataType("string")
export class StringType extends DataType {
  constructor(public readonly options: StringTypeOptions = {}) {
    super(
      [
        DefaultDataCompareTypes.Is,
        DefaultDataCompareTypes.IsNot,
        DefaultDataCompareTypes.Contains,
        DefaultDataCompareTypes.NotContains,
        DefaultDataCompareTypes.IsEmpty,
        DefaultDataCompareTypes.IsNotEmpty,
      ],
      DefaultDataCompareTypes.Contains,
      options,
    );
  }

  protected defaultInputComponent() {
    if (this.options.copyable) {
      return FormComponents.InputCopyableText({
        placeholder: this.options.placeholder,
      });
    }
    return this.editableInputComponent();
  }

  override filterComponents() {
    return { default: this.editableInputComponent() };
  }

  private editableInputComponent() {
    if (this.options.textarea) {
      return FormComponents.InputTextarea({
        placeholder: this.options.placeholder,
        maxLength: this.options.maxLength,
        rows: this.options.rows,
        showCount: this.options.showCount,
      });
    }

    return FormComponents.InputText({
      placeholder: this.options.placeholder,
      maxLength: this.options.maxLength,
      minLength: this.options.minLength,
      showCount: this.options.showCount,
      width: this.options.width,
    });
  }

  getValidation() {
    let schema = z.string();

    if (this.options.minLength !== undefined) {
      schema = schema.min(this.options.minLength);
    }
    if (this.options.maxLength !== undefined) {
      schema = schema.max(this.options.maxLength);
    }

    return schema;
  }
}

/** Before or after an instant: `less_than` / `greater_than` on a date. */
const INSTANT_COMPARISONS: typeof DAY_COMPARISONS = {
  greater_than: (stored, instant) => stored.gt(instant),
  less_than: (stored, instant) => stored.lt(instant),
};

/**
 * Before or after a whole day, as `is` and `is_between` read a day:
 * "greater than" starts at the next day, "less than" ends before it.
 */
const DAY_COMPARISONS: Record<
  string,
  (stored: ValueProxy<unknown>, dayStart: Date) => ValueProxyOrValue<boolean>
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- Dynamic modes.
> = {
  greater_than: (stored, dayStart) => {
    const nextDay = new Date(dayStart);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return stored.ge(nextDay);
  },
  less_than: (stored, dayStart) => stored.lt(dayStart),
};

/** A calendar day as the date picker sends it, without a time. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

@RegisterDataType("date")
export class DateType extends DataType {
  constructor(public readonly options: DateTypeOptions = {}) {
    super(
      [
        DefaultDataCompareTypes.Is,
        DefaultDataCompareTypes.LessThan,
        DefaultDataCompareTypes.GreaterThan,
        DefaultDataCompareTypes.IsBetween,
        DefaultDataCompareTypes.IsEmpty,
        DefaultDataCompareTypes.IsNotEmpty,
      ],
      DefaultDataCompareTypes.Is,
      options,
    );
  }

  protected defaultInputComponent() {
    return FormComponents.DatePicker({
      range: this.options.range,
      multiple: this.options.multiple,
      minDate: this.options.minDate,
      maxDate: this.options.maxDate,
    });
  }

  // oxlint-disable-next-line eslint/max-params -- This override preserves the positional DataType.filter contract used by callers.
  override filter(
    context: RequestContext,
    proxy: ValueProxy<unknown>,
    key: string,
    value: string,
    mode: string,
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Preserve DataType.filter's public row type.
    row: ValueProxy<Record<string, unknown>>,
  ): ValueProxyOrValue<boolean> {
    if (mode === "is" || mode === "is_not") {
      return this.sameDayFilter(proxy, value, mode === "is_not");
    }
    if (mode === "is_between") {
      return whenValueSet(proxy, this.dayRangeFilter(proxy, value));
    }
    if (Object.hasOwn(INSTANT_COMPARISONS, mode)) {
      return whenValueSet(proxy, this.orderFilter(proxy, value, mode));
    }
    return super.filter(context, proxy, key, value, mode, row);
  }

  private instant(value: string): Date {
    const parsed = parseValue(value);
    if (!(parsed instanceof Date)) {
      throw new Error(`Date filter expects a date value. Got: ${value}`);
    }
    return parsed;
  }

  private orderFilter(
    stored: ValueProxy<unknown>,
    value: string,
    mode: string,
  ): ValueProxyOrValue<boolean> {
    const instant = this.instant(value);
    if (CALENDAR_DAY.test(value.trim())) {
      return DAY_COMPARISONS[mode](stored, this.startOfUtcDay(instant));
    }
    return INSTANT_COMPARISONS[mode](stored, instant);
  }

  private startOfUtcDay(date: Date): Date {
    const result = new Date(date);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }

  private nextUtcDay(date: Date): Date {
    const result = this.startOfUtcDay(date);
    result.setUTCDate(result.getUTCDate() + 1);
    return result;
  }

  private sameDayFilter(
    proxy: ValueProxy<unknown>,
    value: string,
    negate: boolean,
  ): ValueProxyOrValue<boolean> {
    const parsed = parseValue(value);
    if (!(parsed instanceof Date)) {
      throw new Error(
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Diagnostic.
        `Date filter expects a date value. Got: ${typeof parsed}`,
      );
    }
    const dayStart = this.startOfUtcDay(parsed);
    const dayEnd = this.nextUtcDay(parsed);

    const matchesDay = proxy.ge(dayStart).and(proxy.lt(dayEnd));

    return negate ? matchesDay.not() : matchesDay;
  }

  private dayRangeFilter(
    proxy: ValueProxy<unknown>,
    value: string,
  ): ValueProxyOrValue<boolean> {
    const [rawStart, rawEnd] = value
      .split(",")
      .map((v) => parseValue(v.trim()));

    if (!(rawStart instanceof Date) || !(rawEnd instanceof Date)) {
      throw new Error(
        `Date is_between filter expects two date values. Got: ${value}`,
      );
    }

    const rangeStart = this.startOfUtcDay(rawStart);
    const rangeEnd = this.nextUtcDay(rawEnd);

    return proxy.ge(rangeStart).and(proxy.lt(rangeEnd));
  }

  override filterComponents() {
    const datepicker = FormComponents.DatePicker({
      range: this.options.range,
      multiple: this.options.multiple,
      minDate: this.options.minDate,
      maxDate: this.options.maxDate,
    });

    return {
      default: datepicker,
      is_between: FormComponents.DatePickerRange({
        minDate: this.options.minDate,
        maxDate: this.options.maxDate,
      }),
    };
  }

  getValidation() {
    if (this.options.range) {
      return z
        .union([
          z.tuple([this.singleDateValidation(), this.singleDateValidation()]),
          z.object({
            start: this.singleDateValidation(),
            end: this.singleDateValidation(),
          }),
        ])
        .transform((range) =>
          Array.isArray(range) ? { start: range[0], end: range[1] } : range,
        )
        .refine((range) => range.start <= range.end, {
          message: "The range must end on or after its start",
          path: ["end"],
        });
    }

    if (this.options.multiple) {
      return z.array(this.singleDateValidation());
    }

    return this.singleDateValidation();
  }

  private singleDateValidation(): z.ZodType<Date, z.ZodTypeDef, string | Date> {
    let singleDateSchema: z.ZodType<Date, z.ZodTypeDef, string | Date> = z
      .union([
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/),
        z.date(),
      ])
      .transform((val) => {
        return isString(val) ? new Date(val) : val;
      });

    if (this.options.minDate) {
      const minDate = new Date(this.options.minDate);
      singleDateSchema = singleDateSchema.refine((date) => date >= minDate, {
        message: `Date must be after ${minDate.toISOString()}`,
      });
    }

    if (this.options.maxDate) {
      const maxDate = new Date(this.options.maxDate);
      singleDateSchema = singleDateSchema.refine((date) => date <= maxDate, {
        message: `Date must be before ${maxDate.toISOString()}`,
      });
    }

    return singleDateSchema;
  }
}
