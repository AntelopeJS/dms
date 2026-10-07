// Form field types built from the others: rows of fields, key-value pairs,
// secrets, code and tags. They live apart from `default-types.ts`, which
// re-exports them in `DefaultDataTypes`.
import { z } from "zod";
import { adaptFieldValidationSchema, FormComponents } from "../form-schema";
import { DefaultDataCompareTypes } from "./compare-types";
import { DataType, getDataTypeId, RegisterDataType } from "./core";

/** A field of the rows an `ArrayType` holds, with a column header. */
export interface ArrayItemField {
  type: DataType;
  /** Header of its column (i18n key or literal); the key by default. */
  label?: string;
  /** A row is refused without it. */
  required?: boolean;
}

/** A field of an `ArrayType`'s rows: its type alone, or with a header. */
export type ArrayItemFieldInput = DataType | ArrayItemField;

/** The options `ArrayType` takes. */
export type ArrayTypeOptions = {
  /** The fields of a row, by key: each row is an object of them. */
  of: Record<string, ArrayItemFieldInput>;
  /** Rows reordered by a drag handle. */
  sortable?: boolean;
  min?: number;
  max?: number;
  /** Label of the "+ Add …" button (i18n key or literal). */
  addLabel?: string;
  fallback?: string;
};

/** The options `KeyValueType` takes. */
export type KeyValueTypeOptions = {
  /** Type of the values; a text by default. */
  valueType?: DataType;
  /**
   * Each pair has a box turning it on or off: the value of a key becomes
   * `{ value, enabled }`.
   */
  toggleable?: boolean;
  addLabel?: string;
  /** Header of the key column (i18n key or literal). */
  keyLabel?: string;
  /** Header of the value column (i18n key or literal). */
  valueLabel?: string;
  fallback?: string;
};

/** The options `SecretType` takes. */
export type SecretTypeOptions = {
  /** "Show" reveals the value, in the browser only. Default `true`. */
  revealable?: boolean;
  /** A button copies the value. Default `true`. */
  copyable?: boolean;
  /**
   * POSTed after a confirmation, answering `{ value }`: "Rotate…" replaces
   * the secret with a new one.
   */
  rotateUrl?: string;
  placeholder?: string;
  fallback?: string;
};

/** Languages a `CodeType` highlights. */
export const CODE_LANGUAGES = [
  "json",
  "sql",
  "html",
  "javascript",
  "text",
] as const;

/** A language a `CodeType` highlights: see `CODE_LANGUAGES`. */
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

/** The options `CodeType` takes. */
export type CodeTypeOptions = {
  language: CodeLanguage;
  /** A gutter numbering the lines. Default `true`. */
  lineNumbers?: boolean;
  /** Height of the editor, in lines, before it grows with its text. */
  minLines?: number;
  /** Lines shown before the editor scrolls. */
  maxLines?: number;
  /**
   * GET, answering `{ items }` (or a list) of `{ label, detail?, icon? }`:
   * suggestions merged with `completions` and the language's keywords.
   */
  completionsUrl?: string;
  completions?: FormComponents.CodeCompletion[];
  placeholder?: string;
  fallback?: string;
};

/** What the tags of a `TagsType` are. */
export const TAG_ITEM_TYPES = ["string", "email"] as const;

/** What the tags of a `TagsType` are: see `TAG_ITEM_TYPES`. */
export type TagItemType = (typeof TAG_ITEM_TYPES)[number];

/** The options `TagsType` takes. */
export type TagsTypeOptions = {
  /** `string` (default) or `email`: an address that is not one is refused. */
  itemType?: TagItemType;
  max?: number;
  /** Offered as the user types. */
  suggestions?: string[];
  placeholder?: string;
  fallback?: string;
};

const PRESENCE_COMPARE_MODES = [
  DefaultDataCompareTypes.IsEmpty,
  DefaultDataCompareTypes.IsNotEmpty,
];

const INVALID_JSON_MESSAGE = "$dms.field_errors.invalid_json";

function itemField(input: ArrayItemFieldInput): ArrayItemField {
  return input instanceof DataType ? { type: input } : input;
}

/**
 * A list of rows, each an object of the fields `of` declares, edited as a
 * repeater: a row per item, a column per field, rows added, removed and,
 * when `sortable`, reordered. The value is the list of objects.
 */
@RegisterDataType("array")
export class ArrayType extends DataType {
  constructor(public readonly options: ArrayTypeOptions) {
    super(PRESENCE_COMPARE_MODES, undefined, { ...options });
  }

  private fields(): Array<[string, ArrayItemField]> {
    return Object.entries(this.options.of).map(([id, input]) => [
      id,
      itemField(input),
    ]);
  }

  protected defaultInputComponent() {
    return FormComponents.InputRepeater({
      columns: this.fields().map(([id, field]) => ({
        id,
        label: field.label ?? id,
        type: getDataTypeId(field.type),
        component: field.type.inputComponent(),
        required: field.required,
      })),
      sortable: this.options.sortable,
      min: this.options.min,
      max: this.options.max,
      addLabel: this.options.addLabel,
    });
  }

  getValidation() {
    const shape = Object.fromEntries(
      this.fields().map(([id, field]) => [
        id,
        adaptFieldValidationSchema(field.type.getValidation(), {
          required: field.required,
        }),
      ]),
    );
    let schema = z.array(z.object(shape));
    if (this.options.min !== undefined) schema = schema.min(this.options.min);
    if (this.options.max !== undefined) schema = schema.max(this.options.max);
    return schema;
  }
}

/**
 * Pairs of a name and a value (headers, labels, environment variables),
 * edited as a repeater of two columns. The value is an object, a key per
 * pair: its value, or `{ value, enabled }` when `toggleable`.
 */
@RegisterDataType("key_value")
export class KeyValueType extends DataType {
  constructor(public readonly options: KeyValueTypeOptions = {}) {
    super(PRESENCE_COMPARE_MODES, undefined, { ...options });
  }

  private valueType(): DataType {
    return this.options.valueType ?? new DefaultTextType();
  }

  protected defaultInputComponent() {
    const valueType = this.valueType();
    return FormComponents.InputKeyValue({
      value: {
        type: getDataTypeId(valueType),
        component: valueType.inputComponent(),
      },
      toggleable: this.options.toggleable,
      addLabel: this.options.addLabel,
      keyLabel: this.options.keyLabel,
      valueLabel: this.options.valueLabel,
    });
  }

  getValidation() {
    const value = this.valueType().getValidation().nullable();
    const entry = this.options.toggleable
      ? z.object({ value, enabled: z.boolean() })
      : value;
    return z.record(z.string().min(1), entry);
  }
}

/**
 * A secret the module hands to the user (an API key, a webhook secret). It
 * travels as is: the input shows it masked but its last characters, "Show"
 * reveals it and the copy button copies it, in the browser; "Rotate…"
 * (with `rotateUrl`) asks the module for a new one.
 */
@RegisterDataType("secret")
export class SecretType extends DataType {
  constructor(public readonly options: SecretTypeOptions = {}) {
    super(PRESENCE_COMPARE_MODES, undefined, { ...options });
  }

  protected defaultInputComponent() {
    return FormComponents.InputSecret({
      revealable: this.options.revealable ?? true,
      copyable: this.options.copyable ?? true,
      rotateUrl: this.options.rotateUrl,
      placeholder: this.options.placeholder,
    });
  }

  getValidation() {
    return z.string();
  }
}

function isJson(text: string): boolean {
  if (!text.trim()) return true;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Code in a language (`json`, `sql`, `html`, `javascript` or `text`), stored
 * as text and edited in a code editor: line numbers, highlighting and an
 * autocomplete of the language's keywords and the module's `completions`.
 * JSON is refused when it does not parse.
 */
@RegisterDataType("code")
export class CodeType extends DataType {
  constructor(public readonly options: CodeTypeOptions) {
    super(PRESENCE_COMPARE_MODES, undefined, { ...options });
  }

  protected defaultInputComponent() {
    const { fallback: _fallback, ...options } = this.options;
    return FormComponents.InputCode(options);
  }

  getValidation() {
    if (this.options.language !== "json") return z.string();
    return z.string().refine(isJson, { message: INVALID_JSON_MESSAGE });
  }
}

/**
 * A list of short texts typed as tags: a pill per item, duplicates ignored.
 * With `itemType: "email"`, an item that is no address is refused.
 */
@RegisterDataType("tags")
export class TagsType extends DataType {
  constructor(public readonly options: TagsTypeOptions = {}) {
    super(PRESENCE_COMPARE_MODES, undefined, { ...options });
  }

  protected defaultInputComponent() {
    const { fallback: _fallback, ...options } = this.options;
    return FormComponents.InputTags(options);
  }

  getValidation() {
    const item =
      this.options.itemType === "email"
        ? z.string().email()
        : z.string().min(1);
    const list = z.array(item);
    return this.options.max === undefined ? list : list.max(this.options.max);
  }
}

/** The text a key-value pair holds when no value type is given. */
class DefaultTextType extends DataType {
  constructor() {
    super([]);
  }

  protected defaultInputComponent() {
    return FormComponents.InputText();
  }

  getValidation() {
    return z.string();
  }
}
