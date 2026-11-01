/** @internal */
import assert from "node:assert";
import {
  type ControllerClass,
  ControllerMeta,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { MakeMethodAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import {
  DataAPIMeta,
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

type FieldDecoratorArguments = Parameters<
  Parameters<typeof MakeMethodAndPropertyDecorator>[0]
>;

/** @internal */
export function buildTableConfig(
  view: TableViewMeta,
  serialize: typeof serializeType,
) {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published target constructor type does not establish ControllerClass.location; registration is assumed rather than validated here.
  const apimeta = GetMetadata(view.target as ControllerClass, ControllerMeta);
  const datameta = GetMetadata(view.target, DataAPIMeta);

  return {
    location: apimeta.location,
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
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The decorator accepts PropertyKey while the column registry, the localization lookup and Filter take string keys; symbol and number inputs are not rejected or converted here.
  const columnKey = key as string;
  meta.setColumn(columnKey, options);

  if (options.validate !== false) {
    // oxlint-disable-next-line typescript/unbound-method -- This assertion checks method presence without calling it; getValidation is called through options.type below.
    assert(options.type.getValidation, "Type has no getValidation method");

    const dataMeta = GetMetadata(target.constructor, DataAPIMeta);
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

    Validator((value) => zodSchema.safeParseAsync(value))(
      target,
      key,
      descriptor ?? {},
    );
  }

  if (options.filterable) {
    Filter(options.type.filter.bind(options.type))(target, columnKey);
  }

  if (options.type.decorateField) {
    options.type.decorateField(target, key, descriptor);
  }
}
