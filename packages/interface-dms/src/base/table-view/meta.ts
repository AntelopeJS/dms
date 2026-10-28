import { GetMetadata } from "@antelopejs/interface-core";
import { MakeMethodAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import {
  Access,
  AccessMode,
  DataAPIMeta,
  type FieldData,
  Filter,
  GetEffectiveMode,
  Listable,
} from "@antelopejs/interface-data-api/metadata";
import {
  getModifiedFields,
  LocalizationModifier,
} from "@antelopejs/interface-database-decorators";
import type { Component, ComponentBuilder } from "../../component";
import { isString } from "../../utils/internal/type-check";
import type { ColumnDisplay } from "./column-display";
import { buildTableConfig, decorateColumn } from "./internal/meta-helpers";
// oxlint-disable-next-line import/no-cycle -- The barrel evaluates built-in data-type decorators; serializeType needs the registry they populate.
import { type DataType, serializeType } from "../data-types";
import {
  type FieldCondition,
  type FieldGroup,
  type FormBuilder,
  type FormField,
  type FormFieldOrGroup,
} from "../form-types";
import {
  type DefaultValue,
  FormMode,
  type ReadonlyBehavior,
  ReadonlyBehaviorType,
} from "../types";
import type { TableViewGuards } from "../types/guards";
import type {
  TableViewFooterSummary,
  TableViewOptions,
  TableViewOptionsSerialized,
  TableViewRowActionOptions,
} from "./options";

const FORM_MODE_BY_VIEW_MODE: Record<"view" | "edit" | "new", FormMode> = {
  view: FormMode.view,
  edit: FormMode.edit,
  new: FormMode.new,
};

const ACCESS_ACTION_BY_FORM_MODE: Record<FormMode, string> = {
  [FormMode.new]: "new",
  [FormMode.edit]: "edit",
  [FormMode.view]: "get",
};

/** Insertion-ordered set of weakly held objects; `live` drops the collected ones. */
class WeakRefList<T extends object> {
  private readonly refs = new Set<WeakRef<T>>();

  public add(value: T): void {
    if (this.live().includes(value)) return;
    this.refs.add(new WeakRef(value));
  }

  public live(): T[] {
    const values: T[] = [];
    for (const ref of this.refs) {
      const value = ref.deref();
      if (value) values.push(value);
      else this.refs.delete(ref);
    }
    return values;
  }
}

export interface ColumnGroupConfig {
  label: string;
  description?: string;
  orientation?: "horizontal" | "vertical";
  order?: number;
}

export interface ColumnOptions {
  name: string;
  description?: string;
  type: DataType;
  order?: number;
  isVisible?: boolean;
  defaultValue?: DefaultValue;
  readonlyBehavior?: ReadonlyBehavior;
  /**
   * A create form leaves out a read-only column that holds nothing yet (a
   * value the server sets): `true` shows it empty all the same. To leave it
   * out whatever it holds, use `readonlyBehavior: { new: "hidden" }`.
   */
  showEmptyOnCreate?: boolean;
  validate?: boolean;
  filterable?: boolean;
  inputComponent?: Component;
  group?: string;
  /** Wrap grid cell content without a line limit. Omit to keep single-line clipping. */
  cellWrap?: boolean;
  /**
   * Default width of the grid column, in px (150 when omitted). The grid
   * spreads any room left between its columns in proportion.
   */
  size?: number;
  /**
   * How table cells (and expanded-row fields) draw the value: a registered
   * {@link ColumnDisplay} and its typed options. The column keeps `type` for
   * its forms, filters, validation and exports. The frontend formatter also
   * receives the row, so a display can compose sibling fields.
   * @example new DefaultDisplays.IdentityDisplay({ subtitleField: "email" })
   */
  display?: ColumnDisplay<object>;
  /**
   * The column's form field shows only while another column holds one of
   * the listed values, as each form opens and as it is filled in. The data
   * routes hold to it too: a hidden field is not mandatory (`@Mandatory`
   * applies while it shows), the value sent for it is ignored, and an edit
   * that hides it clears the value it stored. An edit reads the condition
   * on the row as it will be stored.
   * @example visibleWhen: { field: "stage", in: ["lost"] }
   */
  visibleWhen?: FieldCondition;
  /**
   * The column's form field is read-only while another column holds one of
   * the listed values; the data routes ignore the value sent for it then.
   * @example disabledWhen: { field: "stage", in: ["won", "lost"] }
   */
  disabledWhen?: FieldCondition;
}

/**
 * Whether a TableView built over a controller writes through its data routes
 * (`write`: at least one of add, duplicate, edit, delete, archive or restore
 * is enabled) or only reads them (`read`).
 */
export type TableViewAccess = "read" | "write";

/** A data type of the same class whose options can change on their own. */
function copyDataType(type: DataType): DataType {
  const copy: DataType = Object.create(Object.getPrototypeOf(type));
  return Object.assign(copy, type, {
    options: type.options && { ...type.options },
  });
}

const FOOTER_SUMMARY_ID = /^\d+$/;

const WRITE_ACTION_IDS = new Set([
  "add",
  "edit",
  "delete",
  "archive",
  "restore",
]);

export class TableViewMeta {
  public static key = Symbol();

  // oxlint-disable-next-line anti-slop/no-unknown-returns -- This published constructor contract accepts arbitrary controller constructors; their instance result cannot be narrowed compatibly here.
  constructor(public readonly target: new (...args: unknown[]) => unknown) {}

  public options: TableViewOptions<any> = {};
  public readonly columns: Record<string, ColumnOptions> = {};
  public readonly groups: Record<string, ColumnGroupConfig> = {};
  public archiveField?: string;
  /**
   * Row rules the data routes enforce on every write: those of the writing
   * TableView over the controller (archive-mode defaults included), unless
   * set explicitly with `setControllerRowActionRules`.
   */
  public controllerRowActionRules?: TableViewRowActionOptions<any>;
  public controllerGuards?: TableViewGuards<any>;
  public bypassTenantAccessGate = false;
  private readonly componentBuilderRefs = new WeakRefList<
    ComponentBuilder<TableViewOptionsSerialized>
  >();
  private readonly readOnlyBuilders = new WeakSet<
    ComponentBuilder<TableViewOptionsSerialized>
  >();
  private readonly resourceFormRefs = new WeakRefList<FormBuilder>();

  /**
   * A controller derived from this one (`DataController(Table, {},
   * Controller("/b", Parent))`) starts with its columns, groups, options and
   * archive field. The TableViews and forms built over the parent stay the
   * parent's: the derived controller serves its own.
   */
  public inherit(parent: TableViewMeta): void {
    for (const [key, column] of Object.entries(parent.columns)) {
      this.columns[key] = { ...column, type: copyDataType(column.type) };
    }
    Object.assign(this.groups, parent.groups);
    this.options = { ...parent.options };
    this.archiveField = parent.archiveField;
  }

  /**
   * Every live TableView built on this controller, in build order. Several
   * pages may mount their own TableView over the same data routes, only one
   * of which writes (see `writingComponentBuilders`).
   */
  public get componentBuilders(): ComponentBuilder<TableViewOptionsSerialized>[] {
    return this.componentBuilderRefs.live();
  }

  /**
   * The live TableViews of `componentBuilders` that write through the data
   * routes. A page mounts one at most: `TableView()` refuses a second one.
   */
  public get writingComponentBuilders(): ComponentBuilder<TableViewOptionsSerialized>[] {
    return this.componentBuilders.filter(
      (builder) => !this.readOnlyBuilders.has(builder),
    );
  }

  /**
   * Records a TableView built on this controller (once per builder). A
   * component standing in for one -- a custom editor carrying the table's
   * actions -- is recorded the same way, as a writer by default.
   */
  public addComponentBuilder(
    builder: ComponentBuilder<TableViewOptionsSerialized>,
    access: TableViewAccess = "write",
  ): void {
    this.componentBuilderRefs.add(builder);
    if (access === "read") this.readOnlyBuilders.add(builder);
    else this.readOnlyBuilders.delete(builder);
  }

  /**
   * Every live `new` / `edit` form built over this controller, in build order:
   * the `ResourceForm` blocks and the forms each TableView opens. They all
   * submit to its data routes.
   */
  public get resourceFormBuilders(): FormBuilder[] {
    return this.resourceFormRefs.live();
  }

  public addResourceFormBuilder(builder: FormBuilder): void {
    this.resourceFormRefs.add(builder);
  }

  /**
   * Every live component that submits to this controller's write routes: its
   * writing TableView and its `new` / `edit` forms (ResourceForm blocks, and
   * the forms a page-mode TableView mounts on its form sub-pages). A file one
   * of them staged is one those routes may save.
   */
  public get writingComponents(): Component[] {
    return [...this.writingComponentBuilders, ...this.resourceFormBuilders];
  }

  /**
   * The permission id `actionId` carries on each TableView of this controller
   * that a page mounts, without duplicates: holding any one of them is what
   * authorizes the action on the data routes. A write action is guarded by
   * the writing TableView alone, so a read-only TableView sharing the
   * controller grants reads only. Empty when no mounted table view declares
   * the action.
   */
  public actionPermissionIds(actionId: string): string[] {
    const writers = this.writingComponentBuilders;
    const builders =
      WRITE_ACTION_IDS.has(actionId) && writers.length > 0
        ? writers
        : this.componentBuilders;
    const ids = builders
      .map((builder) => builder.getAction(actionId)?.permissionId)
      .filter((id): id is string => !!id);
    return [...new Set(ids)];
  }

  public setControllerRowActionRules(rules: TableViewRowActionOptions<any>) {
    this.controllerRowActionRules = rules;
  }

  public setControllerGuards(guards: TableViewGuards<any>) {
    this.controllerGuards = guards;
  }

  public setBypassTenantAccessGate() {
    this.bypassTenantAccessGate = true;
  }

  private gateBypassRegistrations = new Set<boolean>();

  public get hasMixedGateBypassRegistrations(): boolean {
    return this.gateBypassRegistrations.size > 1;
  }

  public recordGateBypassRegistration(requested: boolean): void {
    this.gateBypassRegistrations.add(requested);
  }

  private resolveReadonlyBehavior(
    readonlyBehavior: ReadonlyBehavior | undefined,
    mode: FormMode,
  ): ReadonlyBehaviorType {
    if (!readonlyBehavior) {
      return ReadonlyBehaviorType.default;
    }

    if (isString(readonlyBehavior)) {
      return readonlyBehavior;
    }

    return readonlyBehavior[mode] || ReadonlyBehaviorType.default;
  }

  /** Whether a field is read-only in the data API action a form runs. */
  private isReadOnlyIn(meta: FieldData, mode: FormMode): boolean {
    const action = ACCESS_ACTION_BY_FORM_MODE[mode];
    return GetEffectiveMode(meta, action) === AccessMode.ReadOnly;
  }

  private getRequiredForMode(data: FieldData, mode: FormMode): boolean {
    if (mode === FormMode.view) return false;
    return data.mandatory?.has(mode) || false;
  }

  private buildFormField(
    key: string,
    options: ColumnOptions,
    meta: FieldData,
    formMode: FormMode,
    localizedFields: PropertyKey[],
  ): FormField {
    const behavior = this.resolveReadonlyBehavior(
      options.readonlyBehavior,
      formMode,
    );
    const isDisabled =
      formMode === FormMode.view ||
      this.isReadOnlyIn(meta, formMode) ||
      behavior === ReadonlyBehaviorType.disabled;
    const isRequired = this.getRequiredForMode(meta, formMode);
    const isLocalized = localizedFields.includes(key);
    const { tableClass } = GetMetadata(this.target, DataAPIMeta);

    return {
      id: key,
      label: options.name ?? key,
      description: options.description,
      type: options.type,
      inputComponent:
        options.inputComponent?.serializeSync() ??
        (isDisabled ? options.type.describedInputComponent() : undefined),
      disabled: isDisabled,
      showEmptyOnCreate: options.showEmptyOnCreate,
      required: isRequired,
      defaultValue: options.defaultValue,
      localized: isLocalized,
      fallbackLocale: isLocalized
        ? LocalizationModifier.fallbackLocaleOf(tableClass, key)
        : undefined,
      visibleWhen: options.visibleWhen,
      disabledWhen: options.disabledWhen,
    };
  }

  public getFormFields(mode: "view" | "edit" | "new"): FormFieldOrGroup[] {
    const metadata = GetMetadata(this.target, DataAPIMeta);
    const formMode = FORM_MODE_BY_VIEW_MODE[mode];
    const localizedFields = getModifiedFields(
      metadata.tableClass.prototype,
      LocalizationModifier,
    );

    const sortedEntries = Object.entries(this.columns)
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
      .filter(([key, options]) => {
        const meta = metadata.fields[key];

        if (this.isReadOnlyIn(meta, formMode)) {
          const behavior = this.resolveReadonlyBehavior(
            options.readonlyBehavior,
            formMode,
          );
          if (behavior === ReadonlyBehaviorType.hidden) {
            return false;
          }
        }

        return !!(options.inputComponent || options.type.inputComponent());
      });

    const result: FormFieldOrGroup[] = [];
    const processedGroups = new Set<string>();

    for (const [key, options] of sortedEntries) {
      const meta = metadata.fields[key];

      if (options.group) {
        if (processedGroups.has(options.group)) {
          continue;
        }
        processedGroups.add(options.group);

        const groupConfig = this.groups[options.group];
        const groupFields = sortedEntries
          .filter(([, opts]) => opts.group === options.group)
          .map(([k, opts]) =>
            this.buildFormField(
              k,
              opts,
              metadata.fields[k],
              formMode,
              localizedFields,
            ),
          );

        const fieldGroup: FieldGroup = {
          id: options.group,
          label: groupConfig?.label ?? options.group,
          description: groupConfig?.description,
          orientation: groupConfig?.orientation,
          order: groupConfig?.order,
          fields: groupFields,
        };
        result.push(fieldGroup);
      } else {
        result.push(
          this.buildFormField(key, options, meta, formMode, localizedFields),
        );
      }
    }

    return result;
  }

  private buildConfig() {
    return buildTableConfig(this, serializeType);
  }

  public get config() {
    return this.buildConfig();
  }

  public setColumn(key: string, options: ColumnOptions) {
    this.columns[key] = options;
  }

  public setGroup(id: string, config: ColumnGroupConfig) {
    this.groups[id] = config;
  }

  private readonly footerSummaries: TableViewFooterSummary<any>[] = [];

  /** Records footer summaries; the ids the `summary` route knows them by. */
  public registerFooterSummaries<T extends Record<string, unknown>>(
    summaries: TableViewFooterSummary<T>[],
  ): string[] {
    return summaries.map((summary) => {
      this.footerSummaries.push(summary);
      return String(this.footerSummaries.length - 1);
    });
  }

  /** A footer summary by the id `registerFooterSummaries` gave it. */
  public footerSummary(id: string): TableViewFooterSummary<any> | undefined {
    return FOOTER_SUMMARY_ID.test(id)
      ? this.footerSummaries[Number(id)]
      : undefined;
  }

  public setOptions(options: TableViewOptions<any>) {
    this.options = options;
  }

  public setArchiveField(field: string) {
    this.archiveField = field;
  }
}

export const Column = MakeMethodAndPropertyDecorator(
  (target, key, descriptor, options: ColumnOptions) => {
    const meta = GetMetadata(target.constructor, TableViewMeta);
    decorateColumn(target, key, descriptor, options, meta);
  },
);

export function ColumnGroup(id: string, config: ColumnGroupConfig) {
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The published decorator accepts constructors with arbitrary instance results; constraining the constructor would change its declaration.
  return (target: new (...args: unknown[]) => unknown) => {
    GetMetadata(target, TableViewMeta).setGroup(id, config);
  };
}

export const ArchiveField = MakeMethodAndPropertyDecorator((target, key) => {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published decorator accepts PropertyKey while archive fields are declared as strings; this adapter does not reject non-string keys.
  GetMetadata(target.constructor, TableViewMeta).setArchiveField(key as string);

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published decorator accepts PropertyKey but Filter expects a string; key-kind validation would change existing behavior.
  Filter()(target, key as string);
  Listable()(target, key);
  const field = GetMetadata(target.constructor, DataAPIMeta)
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The published field map uses string keys, while the decorator supplies PropertyKey without verifying its kind.
    .fields[key as string];
  if (!field?.mode) Access(AccessMode.ReadOnly)(target, key);
});

export const Select = MakeMethodAndPropertyDecorator(
  (target, key, descriptor, requiredFields?: boolean | string[]) => {
    return Listable(requiredFields, "select")(target, key, descriptor ?? {});
  },
);

export const Exported = MakeMethodAndPropertyDecorator(
  (target, key, descriptor, requiredFields?: boolean | string[]) => {
    return Listable(requiredFields, "export")(target, key, descriptor ?? {});
  },
);
