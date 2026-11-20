/** Stable formatted-string data types. @packageDocumentation */
import { z } from "zod";
import { FormComponents } from "../../form-schema";
import { DataType, RegisterDataType } from "../core";
import { DefaultDataCompareTypes } from "../compare-types";
import {
  EmailTypeOptions,
  ColorTypeOptions,
  PasswordTypeOptions,
  UrlTypeOptions,
  PhoneTypeOptions,
} from "./options";
import { toE164 } from "../internal/phone-number";

const INVALID_PHONE_MESSAGE = "$dms.field_errors.invalid_phone";

/**
 * The `email` data type.
 *
 * @docsApi
 */
@RegisterDataType("email")
export class EmailType extends DataType {
  constructor(public readonly options: EmailTypeOptions = {}) {
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
    return FormComponents.InputEmail({
      placeholder: this.options.placeholder,
    });
  }

  getValidation() {
    return z.string().email();
  }
}

/**
 * The `color` data type.
 *
 * @docsApi
 */
@RegisterDataType("color")
export class ColorType extends DataType {
  constructor(public readonly options: ColorTypeOptions = {}) {
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
    return FormComponents.InputColor({
      placeholder: this.options.placeholder,
    });
  }

  getValidation() {
    return z.string().regex(/^#[0-9a-fA-F]{6}$/);
  }
}

/**
 * The `password` data type.
 *
 * @docsApi
 */
@RegisterDataType("password")
export class PasswordType extends DataType {
  constructor(public readonly options: PasswordTypeOptions = {}) {
    super([], undefined, options);
  }

  protected defaultInputComponent() {
    return FormComponents.InputPassword({
      placeholder: this.options.placeholder,
      minLength: this.options.minLength,
      confirmPassword: this.options.confirmPassword,
      confirmPlaceholder: this.options.confirmPlaceholder,
    });
  }

  getValidation() {
    let schema = z.string();

    if (this.options.minLength !== undefined) {
      schema = schema.min(this.options.minLength);
    }

    return schema;
  }
}

/**
 * The `url` data type.
 *
 * @docsApi
 */
@RegisterDataType("url")
export class UrlType extends DataType {
  constructor(public readonly options: UrlTypeOptions = {}) {
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
    return FormComponents.InputText({
      placeholder: this.options.placeholder,
      preview: this.options.preview,
    });
  }

  getValidation() {
    return z.string().url();
  }
}

/**
 * The `phone` data type.
 *
 * @docsApi
 */
@RegisterDataType("phone")
export class PhoneType extends DataType {
  constructor(public readonly options: PhoneTypeOptions = {}) {
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
    return FormComponents.InputPhone({
      placeholder: this.options.placeholder,
      requiredPrefix: this.options.requiredPrefix,
      defaultCountry: this.options.defaultCountry,
    });
  }

  getValidation() {
    const { requiredPrefix, defaultCountry } = this.options;
    if (!requiredPrefix && !defaultCountry) return z.string();

    const country = requiredPrefix ? undefined : defaultCountry;
    return z.string().transform((value, context) => {
      const number = toE164(value, country);
      if (number) return number;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: INVALID_PHONE_MESSAGE,
      });
      return z.NEVER;
    });
  }
}
