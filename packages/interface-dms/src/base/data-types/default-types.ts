import "@antelopejs/interface-core";
import "@antelopejs/interface-data-api/metadata";
import "@antelopejs/interface-file-storage";
import "zod";
import "../../utils/internal/value-parser";
import "../../utils/internal/type-check";
import "../../attachments";
import "../form-schema";
// oxlint-disable-next-line import/no-cycle -- Preserve the existing table metadata evaluation before built-in registration.
import "../table-view/meta";
import "../types";
import "./core";
import * as FieldTypes from "./field-types";
import "./internal/compare-types";
import "./compare-types";
import * as defaultOptions from "./default/options";
import * as defaultNumbers from "./default/numbers";
import * as defaultChoices from "./default/choices";
import * as defaultStrings from "./default/strings";
import * as defaultRelations from "./default/relations";
import * as defaultAddress from "./default/address";
import * as defaultFiles from "./default/files";
/** How a `SelectType` shows its options. */
export const SELECT_DISPLAYS = [
  "dropdown",
  "cards",
  "segmented",
  "radio",
] as const;

/** How a `BooleanType` shows its value. */
export const BOOLEAN_DISPLAYS = ["switch", "checkbox", "card"] as const;

export type { SelectDisplay, BooleanDisplay } from "./default/inputs";

export namespace DefaultDataTypes {
  export import NumberTypeOptions = defaultOptions.NumberTypeOptions;
  export import StringTypeOptions = defaultOptions.StringTypeOptions;
  export import DateTypeOptions = defaultOptions.DateTypeOptions;
  export import BooleanTypeOptions = defaultOptions.BooleanTypeOptions;
  export import SelectTypeOptions = defaultOptions.SelectTypeOptions;
  export import EmailTypeOptions = defaultOptions.EmailTypeOptions;
  export import ColorTypeOptions = defaultOptions.ColorTypeOptions;
  export import PasswordTypeOptions = defaultOptions.PasswordTypeOptions;
  export import UrlTypeOptions = defaultOptions.UrlTypeOptions;
  export import PhoneTypeOptions = defaultOptions.PhoneTypeOptions;
  export import RichTextTypeOptions = defaultOptions.RichTextTypeOptions;
  export import StringTimeTypeOptions = defaultOptions.StringTimeTypeOptions;
  export import NumberType = defaultNumbers.NumberType;
  export import StringType = defaultNumbers.StringType;
  export import DateType = defaultNumbers.DateType;
  export import BooleanType = defaultChoices.BooleanType;
  export import SelectType = defaultChoices.SelectType;
  export import PriceType = defaultChoices.PriceType;
  export import PercentageType = defaultChoices.PercentageType;
  export import EmailType = defaultStrings.EmailType;
  export import ColorType = defaultStrings.ColorType;
  export import PasswordType = defaultStrings.PasswordType;
  export import UrlType = defaultStrings.UrlType;
  export import PhoneType = defaultStrings.PhoneType;
  export import RelationFilterBy = defaultRelations.RelationFilterBy;
  export import RelationType = defaultRelations.RelationType;
  export import CascaderRelationType = defaultRelations.CascaderRelationType;
  export import Address = defaultAddress.Address;
  export import AddressAutocomplete = defaultAddress.AddressAutocomplete;
  export import AddressType = defaultAddress.AddressType;
  export import RichTextType = defaultFiles.RichTextType;
  export import StringTimeType = defaultFiles.StringTimeType;
  export import FileTypeOptions = defaultFiles.FileTypeOptions;
  export import FileType = defaultFiles.FileType;
  export import ImageValue = defaultFiles.ImageValue;
  export import ImageTypeOptions = defaultFiles.ImageTypeOptions;
  export import ImageType = defaultFiles.ImageType;

  export const ArrayType = FieldTypes.ArrayType;

  export type ArrayType = FieldTypes.ArrayType;

  export type ArrayTypeOptions = FieldTypes.ArrayTypeOptions;

  export const KeyValueType = FieldTypes.KeyValueType;

  export type KeyValueType = FieldTypes.KeyValueType;

  export type KeyValueTypeOptions = FieldTypes.KeyValueTypeOptions;

  export const SecretType = FieldTypes.SecretType;

  export type SecretType = FieldTypes.SecretType;

  export type SecretTypeOptions = FieldTypes.SecretTypeOptions;

  export const CodeType = FieldTypes.CodeType;

  export type CodeType = FieldTypes.CodeType;

  export type CodeTypeOptions = FieldTypes.CodeTypeOptions;

  export const TagsType = FieldTypes.TagsType;

  export type TagsType = FieldTypes.TagsType;

  export type TagsTypeOptions = FieldTypes.TagsTypeOptions;
}
