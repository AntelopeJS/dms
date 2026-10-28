/** Stable relation data types. @packageDocumentation */
import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataAPIMeta, Foreign } from "@antelopejs/interface-data-api/metadata";
import { z } from "zod";
import { Form, FormComponents } from "../../form-schema";
import type { TableViewMeta } from "../../table-view/meta";
import type { FormContainerPageTexts } from "../../table-view/options";
import { HttpMethod } from "../../types";
import { DataType, RegisterDataType } from "../core";
import { absolutizeJoinedSchemas } from "../internal/compare-types";
import { DefaultDataCompareTypes } from "../compare-types";

/** {@link FormComponents.RelationFilterBy}, `field` typed on the related row. */
export interface RelationFilterBy<T extends ControllerClass> {
  field: keyof InstanceType<T> & string;
  from: string;
}

function relationCompareModes(multiple?: boolean) {
  return [
    multiple ? DefaultDataCompareTypes.Include : DefaultDataCompareTypes.Is,
    multiple ? DefaultDataCompareTypes.Exclude : DefaultDataCompareTypes.IsNot,
    DefaultDataCompareTypes.IsEmpty,
    DefaultDataCompareTypes.IsNotEmpty,
  ];
}

function relationDefaultCompareMode(multiple?: boolean) {
  return multiple
    ? DefaultDataCompareTypes.Include
    : DefaultDataCompareTypes.Is;
}

@RegisterDataType("relation")
export class RelationType<T extends ControllerClass> extends DataType {
  constructor(
    public readonly options: {
      placeholder?: string;
      multiple?: boolean;
      deselectable?: boolean;
      dataApiController: T;
      index?: string;
      keyMapping?: {
        label?: keyof InstanceType<T> & string;
        value?: keyof InstanceType<T> & string;
        avatar?: keyof InstanceType<T> & string;
        disabled?: keyof InstanceType<T> & string;
      };
      fallback?: string;
      /**
       * Use the relation purely as a native FILTER, without resolving the
       * related row into the `/list` output.
       *
       * By default a relation column applies a `Foreign(...)` join
       * (see {@link decorateField}) so list rows carry the resolved related
       * object (e.g. `{ name: "..." }`) instead of the raw foreign-key id.
       * That join is right for grid/form display but wrong for a column that
       * is only meant to drive the funnel filter on a read-only list: it
       * rewrites the scalar id away and (because the join also rebuilds the
       * list projection) can drop the row's own id key from the pluck.
       *
       * With `filterOnly: true` the join is skipped entirely. The column keeps
       * its relation `compareModes` and `filterComponents` (the searchable
       * relation picker in the funnel) and, when declared `filterable: true`,
       * the backend `@Filter` still runs equality on the RAW scalar column —
       * so the funnel filters correctly while `/list` rows keep the raw id
       * under its key and keep the row id key (`_id`/`rowIdKey`) untouched.
       *
       * The backend filter operates on the stored scalar, which already holds
       * exactly the value the relation picker emits (`keyMapping.value`, or
       * the `index` value), so equality filtering stays correct without the
       * join.
       */
      filterOnly?: boolean;
      /**
       * Title and description of the drawer the picker's "add" entry
       * opens, e.g. "New user". `$`-prefixed: i18n keys. Default to "New
       * entry".
       */
      addForm?: FormContainerPageTexts;
      /**
       * Lists only the related rows whose `field` equals the form's value
       * of `from`, e.g. `{ field: "customer", from: "customer" }` for a
       * ticket's site. `field` must be filterable on the related
       * controller: declaring it otherwise throws at registration.
       */
      filterBy?: RelationFilterBy<T>;
    },
  ) {
    super(
      relationCompareModes(options.multiple),
      relationDefaultCompareMode(options.multiple),
      options,
    );
  }

  protected defaultInputComponent() {
    return this.relationInput(true, this.options.multiple);
  }

  override filterComponents() {
    return { default: this.relationInput(false, false) };
  }

  public describedInputComponent() {
    return this.relationInput(false, this.options.multiple);
  }

  private relationInput(canAdd: boolean, multiple: boolean | undefined) {
    const tableViews: typeof import("../../table-view/meta") = require("../../table-view/meta");
    const tableViewMeta = GetMetadata(
      this.options.dataApiController,
      tableViews.TableViewMeta,
    );
    const { config } = tableViewMeta;
    const { endpoints } = GetMetadata(
      this.options.dataApiController,
      DataAPIMeta,
    );

    const location = `${config.location}/${endpoints.select.endpoint || "select"}`;
    const addOptions = canAdd
      ? this.buildAddOptions(tableViewMeta, endpoints)
      : undefined;

    return FormComponents.InputRelation({
      placeholder: this.options.placeholder,
      multiple,
      deselectable: this.options.deselectable,
      searchUrl: location,
      keyMapping: this.options.keyMapping,
      filterBy: this.options.filterBy,
      addForm: addOptions?.addForm,
      addPermissionIds: addOptions?.addPermissionIds,
      addFormTexts: this.options.addForm,
    });
  }

  private buildAddOptions(
    tableViewMeta: TableViewMeta,
    endpoints: { new?: unknown },
  ) {
    if (!endpoints.new) return undefined;

    const newFields = tableViewMeta.getFormFields("new");
    if (newFields.length === 0) return undefined;

    const submitUrl = `${tableViewMeta.config.location}/new`;
    const addForm = Form({
      fields: newFields,
      submitUrl,
      submitUrlMethod: HttpMethod.post,
      kind: "create",
    }).serializeSync();

    return {
      addForm,
      addPermissionIds: tableViewMeta.actionPermissionIds("add"),
    };
  }

  getValidation(): z.ZodType {
    return this.options.multiple ? z.array(z.string()) : z.string();
  }

  private assertFilterByFilterable(key: PropertyKey): void {
    const field = this.options.filterBy?.field;
    if (!field) return;
    const { filters } = GetMetadata(
      this.options.dataApiController,
      DataAPIMeta,
    );
    if (filters[field]) return;
    throw new Error(
      `Relation "${String(key)}": filterBy.field "${field}" is not filterable on ${this.options.dataApiController.name}; declare it filterable: true there.`,
    );
  }

  public decorateField(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Preserve DataType's decorator target contract.
    target: unknown,
    key: PropertyKey,
    descriptor?: PropertyDescriptor,
  ): void {
    this.assertFilterByFilterable(key);
    if (this.options.filterOnly) {
      return;
    }
    const meta = GetMetadata(this.options.dataApiController, DataAPIMeta);
    absolutizeJoinedSchemas(meta);
    const { tableName, pluck } = meta;
    Foreign(
      tableName,
      this.options.index,
      this.options.multiple,
      Array.from(pluck.select?.keys() || []),
      meta.schemaName,
      meta,
    )(target, key, descriptor ?? {});
  }
}

/**
 * Relation to a self-referencing table rendered as a cascader.
 *
 * The target controller exposes a flat list through its `select` endpoint
 * (the `parent` field of `keyMapping` must be decorated with `@Select()`);
 * the widget rebuilds the tree client-side and displays the full path
 * (e.g. `Electronics / Audio / Headphones`) in table cells.
 */
@RegisterDataType("cascader_relation")
export class CascaderRelationType<T extends ControllerClass> extends DataType {
  constructor(
    public readonly options: {
      placeholder?: string;
      multiple?: boolean;
      deselectable?: boolean;
      dataApiController: T;
      index?: string;
      keyMapping: {
        label: keyof InstanceType<T> & string;
        value: keyof InstanceType<T> & string;
        parent: keyof InstanceType<T> & string;
        disabled?: keyof InstanceType<T> & string;
      };
      maxDepth?: number;
      leafOnly?: boolean;
      fallback?: string;
      /**
       * Use the cascader relation purely as a native FILTER, without
       * resolving the related row into the `/list` output.
       *
       * @see RelationType `filterOnly` for the full rationale: the relation
       * picker and the backend `@Filter` keep working on the raw scalar id,
       * while the join (which would rewrite the value and can drop the row id
       * key) is skipped.
       */
      filterOnly?: boolean;
    },
  ) {
    super(
      relationCompareModes(options.multiple),
      relationDefaultCompareMode(options.multiple),
      options,
    );
  }

  protected defaultInputComponent() {
    return this.cascaderInput(this.options.multiple);
  }

  override filterComponents() {
    return { default: this.cascaderInput(false) };
  }

  private cascaderInput(multiple: boolean | undefined) {
    const tableViews: typeof import("../../table-view/meta") = require("../../table-view/meta");
    const { config } = GetMetadata(
      this.options.dataApiController,
      tableViews.TableViewMeta,
    );
    const { endpoints } = GetMetadata(
      this.options.dataApiController,
      DataAPIMeta,
    );

    return FormComponents.InputCascader({
      placeholder: this.options.placeholder,
      multiple,
      deselectable: this.options.deselectable,
      searchUrl: `${config.location}/${endpoints.select.endpoint || "select"}`,
      keyMapping: this.options.keyMapping,
      maxDepth: this.options.maxDepth,
      leafOnly: this.options.leafOnly,
      fallback: this.options.fallback,
    });
  }

  getValidation(): z.ZodType {
    return this.options.multiple ? z.array(z.string()) : z.string();
  }

  public decorateField(
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Preserve DataType's decorator target contract.
    target: unknown,
    key: PropertyKey,
    descriptor?: PropertyDescriptor,
  ): void {
    if (this.options.filterOnly) {
      return;
    }
    const meta = GetMetadata(this.options.dataApiController, DataAPIMeta);
    absolutizeJoinedSchemas(meta);
    const { tableName, pluck } = meta;
    Foreign(
      tableName,
      this.options.index,
      this.options.multiple,
      Array.from(pluck.select?.keys() || []),
      meta.schemaName,
      meta,
    )(target, key, descriptor ?? {});
  }
}
