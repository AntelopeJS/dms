/** Stable boolean and choice data types. @packageDocumentation */
import { z } from "zod";
import { FormComponents } from "../../form-schema";
import { DataType, RegisterDataType } from "../core";
import { DefaultDataCompareTypes } from "../compare-types";
import {
  BooleanTypeOptions,
  SelectTypeOptions,
  NumberTypeOptions,
  PriceTypeOptions,
} from "./options";
import { BOOLEAN_INPUTS, SINGLE_PICK_DISPLAYS, SELECT_INPUTS } from "./inputs";
import { NumberType } from "./numbers";
import {
  CURRENCY_FROM_KEY,
  withColumnReference,
} from "../../internal/column-references";

/**
 * The `boolean` data type.
 *
 * @docsApi
 */
@RegisterDataType("boolean")
export class BooleanType extends DataType {
  constructor(public readonly options: BooleanTypeOptions = {}) {
    super(
      [
        DefaultDataCompareTypes.Is,
        DefaultDataCompareTypes.IsNot,
        DefaultDataCompareTypes.IsEmpty,
        DefaultDataCompareTypes.IsNotEmpty,
      ],
      DefaultDataCompareTypes.Is,
      options,
    );
  }

  protected defaultInputComponent() {
    const { display = "switch", icon, label, description } = this.options;
    return BOOLEAN_INPUTS[display]({ icon, label, description });
  }

  override filterComponents() {
    const selectOptions = FormComponents.InputSelect({
      items: [
        { value: "true", label: "$dms.table.filter.boolean.checked" },
        { value: "false", label: "$dms.table.filter.boolean.unchecked" },
      ],
    });

    return {
      default: selectOptions,
      is: selectOptions,
      is_not: selectOptions,
    };
  }

  getValidation() {
    return z.boolean();
  }
}

/**
 * The `select` data type.
 *
 * @docsApi
 */
@RegisterDataType("select")
export class SelectType extends DataType {
  constructor(public readonly options: SelectTypeOptions = { items: [] }) {
    super(
      options.multiple
        ? [
            DefaultDataCompareTypes.Include,
            DefaultDataCompareTypes.Exclude,
            DefaultDataCompareTypes.ArrayContainsString,
            DefaultDataCompareTypes.IsEmpty,
            DefaultDataCompareTypes.IsNotEmpty,
          ]
        : [
            DefaultDataCompareTypes.Is,
            DefaultDataCompareTypes.IsNot,
            DefaultDataCompareTypes.IsEmpty,
            DefaultDataCompareTypes.IsNotEmpty,
          ],
      options.multiple
        ? DefaultDataCompareTypes.Include
        : DefaultDataCompareTypes.Is,
      options,
    );
  }

  protected defaultInputComponent() {
    const { display = "dropdown", ...options } = this.options;
    const shown =
      options.multiple && SINGLE_PICK_DISPLAYS.has(display) ? "cards" : display;
    return SELECT_INPUTS[shown](options);
  }

  override filterComponents() {
    const { display: _display, columns: _columns, ...options } = this.options;
    return { default: FormComponents.InputSelect(options) };
  }

  getValidation():
    | z.ZodNever
    | z.ZodEnum<Record<string, string>>
    | z.ZodArray<z.ZodNever | z.ZodEnum<Record<string, string>>>
    | z.ZodString
    | z.ZodArray<z.ZodString> {
    if (this.options.itemsFrom) {
      return this.options.multiple ? z.array(z.string()) : z.string();
    }
    const [first, ...rest] = this.options.items.map((item) =>
      String(item.value),
    );
    const value = first === undefined ? z.never() : z.enum([first, ...rest]);
    return this.options.multiple ? z.array(value) : value;
  }
}

/**
 * The `price` data type.
 *
 * @docsApi
 */
@RegisterDataType("price")
export class PriceType extends NumberType {
  declare readonly options: PriceTypeOptions;

  constructor(options: PriceTypeOptions = {}) {
    super({
      min: options.min ?? 0,
      step: options.step ?? 0.01,
      ...options,
    });
  }

  protected defaultInputComponent() {
    const { currency, currencyFrom } = this.options;
    return FormComponents.InputNumber(
      withColumnReference(
        {
          min: this.options.min,
          max: this.options.max,
          step: this.options.step,
          placeholder: this.options.placeholder,
          suffix: this.options.suffix,
          width: this.options.width,
          ...(currency && { currency }),
        },
        CURRENCY_FROM_KEY,
        currency ? undefined : currencyFrom,
      ),
    );
  }
}

/**
 * The `percentage` data type.
 *
 * @docsApi
 */
@RegisterDataType("percentage")
export class PercentageType extends NumberType {
  constructor(options: NumberTypeOptions = {}) {
    super({
      min: options.min ?? 0,
      max: options.max ?? 1,
      step: options.step ?? 0.01,
      ...options,
    });
  }

  protected defaultInputComponent() {
    return FormComponents.InputPercentage({
      min: (this.options.min ?? 0) * 100,
      max: (this.options.max ?? 1) * 100,
      step: this.options.step,
      placeholder: this.options.placeholder,
      width: this.options.width,
    });
  }
}
