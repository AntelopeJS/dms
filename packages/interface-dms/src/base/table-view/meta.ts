import assert from "node:assert";
import {
  type ControllerClass,
  ControllerMeta,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { MakeMethodAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import {
  AccessMode,
  DataAPIMeta,
  Filter,
  Listable,
  Validator,
} from "@antelopejs/interface-data-api/metadata";
import {
  getModifiedFields,
  LocalizationModifier,
} from "@antelopejs/interface-database-decorators";
import type { Component, ComponentBuilder } from "../../component";
import { isString } from "../../utils/type-check";
import { type ColumnDisplay, serializeColumnDisplay } from "./column-display";
// Through the barrel, not core: the default data types register themselves by
// decorator, and this value import is what evaluates them. serializeType below
// reads the registry they fill, so importing the definitions alone would leave
// every column serialised without a type -- silently, since serializeType then
// just returns undefined.
// oxlint-disable-next-line import/no-cycle
import { type DataType, serializeType } from "../data-types";
import {
  type FieldGroup,
  type FormBuilder,
  type FormField,
  type FormFieldOrGroup,
} from "../form-types";
import { adaptFieldValidationSchema } from "../form-schema";
import {
  type DefaultValue,
  type FieldMetadata,
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
}

/**
 * Whether a TableView built over a controller writes through its data routes
 * (`write`: at least one of add, duplicate, edit, delete, archive or restore
 * is enabled) or only reads them (`read`).
 */
export type TableViewAccess = "read" | "write";

/** A data type of the same class whose options can change on their own. */
function copyDataType(type: DataType): DataType {
  const copy = Object.create(Object.getPrototypeOf(type) as object) as DataType;
  return Object.assign(copy, type, {
    options: type.options && { ...type.options },
  });
}

// A footer summary's id: its index among the controller's summaries.
const FOOTER_SUMMARY_ID = /^\d+$/;

// The actions of a table view that change rows through the data routes.
const WRITE_ACTION_IDS = new Set([
  "add",
  "edit",
  "delete",
  "archive",
  "restore",
]);

export class TableViewMeta {
  public static key = Symbol();

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
  // Held weakly: a page module that hot-reloads builds a new TableView or
  // ResourceForm on the same controller, and the one it replaced must not stay
  // reachable from here.
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
    // Each column gets its own copy of its type: a file column's type carries
    // the attachment field of the controller it saves through, stamped when a
    // form over that controller is built, and the two controllers save
    // through different routes.
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

  // Latched, never reset: routes are shared by every registration of the
  // controller, so a later TableView() call without the flag (another page
  // showing the same data) must not silently re-gate — or un-gate — them.
  public setBypassTenantAccessGate() {
    this.bypassTenantAccessGate = true;
  }

  private gateBypassRegistrations = new Set<boolean>();

  // Both kinds of registration seen for this controller, in any order.
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

  private getRequiredForMode(data: FieldMetadata, mode: FormMode): boolean {
    if (mode === FormMode.view) return false;
    return data.mandatory?.has(mode) || false;
  }

  private buildFormField(
    key: string,
    options: ColumnOptions,
    meta: FieldMetadata,
    formMode: FormMode,
    localizedFields: string[],
  ): FormField {
    const behavior = this.resolveReadonlyBehavior(
      options.readonlyBehavior,
      formMode,
    );
    const isDisabled =
      formMode === FormMode.view ||
      meta.mode === AccessMode.ReadOnly ||
      behavior === ReadonlyBehaviorType.disabled;
    const isRequired = this.getRequiredForMode(meta, formMode);

    return {
      id: key,
      label: options.name ?? key,
      description: options.description,
      type: options.type,
      inputComponent: options.inputComponent?.serializeSync(),
      disabled: isDisabled,
      required: isRequired,
      defaultValue: options.defaultValue,
      localized: localizedFields.includes(key),
    };
  }

  public getFormFields(mode: "view" | "edit" | "new"): FormFieldOrGroup[] {
    const metadata = GetMetadata(this.target as ControllerClass, DataAPIMeta);
    const formMode = FORM_MODE_BY_VIEW_MODE[mode];
    const localizedFields = getModifiedFields(
      metadata.tableClass.prototype,
      LocalizationModifier,
    ) as string[];

    const sortedEntries = Object.entries(this.columns)
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
      .filter(([key, options]) => {
        const meta = metadata.fields[key];

        if (meta.mode === AccessMode.ReadOnly) {
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
      const meta = metadata.fields[key] as FieldMetadata;

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
              metadata.fields[k] as FieldMetadata,
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
    const apimeta = GetMetadata(this.target as ControllerClass, ControllerMeta);
    const datameta = GetMetadata(this.target as ControllerClass, DataAPIMeta);

    return {
      location: apimeta.location,
      columns: Object.entries(this.columns)
        .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
        .map(([key, options]) => {
          const meta = datameta.fields[key];

          return {
            id: key,
            header: options.name ?? key,
            isVisible: options.isVisible,
            type: serializeType(options.type),
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

  public get config() {
    return this.buildConfig();
  }

  public setColumn(key: string, options: ColumnOptions) {
    this.columns[key] = options;
  }

  public setGroup(id: string, config: ColumnGroupConfig) {
    this.groups[id] = config;
  }

  // Footer summaries every table view over the controller declared, by id:
  // the `summary` route computes the ones a request names, and never a
  // figure a table did not declare.
  private readonly footerSummaries: TableViewFooterSummary<any>[] = [];

  /** Records footer summaries; the ids the `summary` route knows them by. */
  public registerFooterSummaries<T extends Record<string, unknown>>(
    summaries: TableViewFooterSummary<T>[],
  ): string[] {
    return summaries.map((summary) => {
      this.footerSummaries.push(summary as TableViewFooterSummary<any>);
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
    meta.setColumn(key as string, options);

    if (options.validate !== false) {
      // Referenced to test that the type declares it; the call below goes
      // through `options.type`, bound.
      // oxlint-disable-next-line typescript/unbound-method
      assert(options.type.getValidation, "Type has no getValidation method");

      const dataMeta = GetMetadata(
        target.constructor as ControllerClass,
        DataAPIMeta,
      );
      const localizedFields = getModifiedFields(
        dataMeta.tableClass.prototype,
        LocalizationModifier,
      ) as string[];
      const isLocalized = localizedFields.includes(key as string);

      const baseSchema = options.type.getValidation();
      const zodSchema = adaptFieldValidationSchema(baseSchema, {
        localized: isLocalized,
        required: false,
      });

      // The parse result rather than its success flag: the data API writes
      // the parsed value, so a date sent as text is stored as a date.
      Validator((value) => zodSchema.safeParseAsync(value))(
        target,
        key,
        descriptor ?? {},
      );
    }

    if (options.filterable) {
      Filter(options.type.filter.bind(options.type))(target, key as string);
    }

    if (options.type.decorateField) {
      options.type.decorateField(target, key, descriptor);
    }
  },
);

export function ColumnGroup(id: string, config: ColumnGroupConfig) {
  return (target: new (...args: unknown[]) => unknown) => {
    GetMetadata(target, TableViewMeta).setGroup(id, config);
  };
}

export const ArchiveField = MakeMethodAndPropertyDecorator((target, key) => {
  GetMetadata(target.constructor, TableViewMeta).setArchiveField(key as string);

  // Archive field need to be data-api filterable and listable to work properly
  Filter()(target, key as string);
  Listable()(target, key as string);
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

export const getTableViewMetaFor = (target: unknown): TableViewMeta =>
  GetMetadata(
    (target as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );

export const getControllerLocation = (target: unknown): string =>
  GetMetadata(
    (target as { constructor: ControllerClass }).constructor,
    ControllerMeta,
  ).location;
