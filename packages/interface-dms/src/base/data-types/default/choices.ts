/** Stable boolean and choice data types. @packageDocumentation */
import { z } from "zod";
import { FormComponents } from "../../form-schema";
import { DataType, RegisterDataType } from "../core";
import { DefaultDataCompareTypes } from "../compare-types";
import {
  BooleanTypeOptions,
  SelectTypeOptions,
  NumberTypeOptions,
} from "./options";
import { BOOLEAN_INPUTS, SINGLE_PICK_DISPLAYS, SELECT_INPUTS } from "./inputs";
import { NumberType } from "./numbers";

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
      [
        options.multiple
          ? DefaultDataCompareTypes.Include
          : DefaultDataCompareTypes.Is,
        options.multiple
          ? DefaultDataCompareTypes.Exclude
          : DefaultDataCompareTypes.IsNot,
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

  getValidation() {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Items may be empty; preserve the existing Zod enum call.
    const validValues = this.options.items.map((item) =>
      String(item.value),
    ) as [string, ...string[]];

    if (this.options.multiple) {
      return z.array(z.enum(validValues));
    }

    return z.enum(validValues);
  }
}

/**
 * The `price` data type.
 *
 * @docsApi
 */
@RegisterDataType("price")
export class PriceType extends NumberType {
  constructor(options: NumberTypeOptions = {}) {
    super({
      min: options.min ?? 0,
      step: options.step ?? 0.01,
      ...options,
    });
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
