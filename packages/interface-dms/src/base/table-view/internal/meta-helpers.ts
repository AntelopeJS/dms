/** @internal */
import assert from "node:assert";
import { ControllerMeta } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { MakeMethodAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import {
  DataAPIMeta,
  type FieldValue,
  Filter,
  Validator,
} from "@antelopejs/interface-data-api/metadata";
import {
  getModifiedFields,
  LocalizationModifier,
} from "@antelopejs/interface-database-decorators";
import type { serializeType } from "../../data-types";
import { adaptFieldValidationSchema } from "../../form-schema";
import { ReadonlyBehaviorType } from "../../types";
import type { ColumnOptions, TableViewMeta } from "../meta";
import { serializeColumnDisplay } from "./column-display";
import { decoratedClass } from "../../../utils/internal/decorated-class";
import {
  isBoolean,
  isNumber,
  isObject,
  isString,
} from "../../../utils/internal/type-check";

/**
 * Whether a value a data type's validation parsed is one data-api stores:
 * text, a number, a flag, `null`, a `Date`, or a list or record of them.
 */
function isFieldValue(value: unknown): value is FieldValue {
  if (value === null || value instanceof Date) return true;
  if (isString(value) || isNumber(value) || isBoolean(value)) return true;
  if (Array.isArray(value)) return value.every(isFieldValue);
  return (
    isObject(value) &&
    Object.values(value).every(
      (part) => part === undefined || isFieldValue(part),
    )
  );
}

type FieldDecoratorArguments = Parameters<
  Parameters<typeof MakeMethodAndPropertyDecorator>[0]
>;

/** @internal */
export function buildTableConfig(
  view: TableViewMeta,
  serialize: typeof serializeType,
) {
  const datameta = GetMetadata(view.target, DataAPIMeta);

  return {
    location: GetMetadata(view.target, ControllerMeta).location,
    columns: Object.entries(view.columns)
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
      .map(([key, options]) => {
        const meta = datameta.fields[key];

        return {
          id: key,
          header: options.name ?? key,
          isVisible: options.isVisible,
          type: serialize(options.type),
          accessorKey: key,
          listable: !!meta.listable?.list,
          enableSorting: meta.sortable !== undefined,
          enableColumnFilter: !!options.filterable,
          cellWrap: options.cellWrap,
          size: options.size,
          display: serializeColumnDisplay(options.display),
          defaultValue: options.defaultValue,
          accessMode: meta.mode,
          readonlyBehavior:
            options.readonlyBehavior ?? ReadonlyBehaviorType.default,
        };
      }),
  };
}

/** @internal */
export function decorateColumn(
  target: FieldDecoratorArguments[0],
  key: FieldDecoratorArguments[1],
  descriptor: FieldDecoratorArguments[2],
  options: ColumnOptions,
  meta: TableViewMeta,
) {
  if (!isString(key)) {
    throw new TypeError(
      `A TableView column must be a member named by a string, not ${String(key)}`,
    );
  }
  const columnKey = key;
  meta.setColumn(columnKey, options);

  if (options.validate !== false) {
    if (!options.type.getValidation) {
      assert.fail("Type has no getValidation method");
    }

    const dataMeta = GetMetadata(decoratedClass(target), DataAPIMeta);
    const localizedFields = getModifiedFields(
      dataMeta.tableClass.prototype,
      LocalizationModifier,
    );
    const isLocalized = localizedFields.includes(key);

    const baseSchema = options.type.getValidation();
    const zodSchema = adaptFieldValidationSchema(baseSchema, {
      localized: isLocalized,
      required: false,
      fallbackLocale: isLocalized
        ? LocalizationModifier.fallbackLocaleOf(dataMeta.tableClass, columnKey)
        : undefined,
    });

    Validator(async (value) => {
      const result = await zodSchema.safeParseAsync(value);
      if (!result.success) return { success: false };
      const { data } = result;
      return data === undefined || isFieldValue(data)
        ? { success: true, data }
        : { success: false };
    })(target, key, descriptor ?? {});
  }

  if (options.filterable) {
    Filter(options.type.filter.bind(options.type))(target, columnKey);
  }

  if (options.type.decorateField) {
    options.type.decorateField(target, key, descriptor);
  }
}
