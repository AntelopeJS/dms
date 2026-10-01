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
   * How table cells (and expanded-row fields) draw the value: the id of a
   * data type registered on the frontend and its options. The column keeps
   * `type` for its forms, filters, validation and exports. The frontend
   * formatter also receives the row, so a display can compose sibling fields.
   * @example { type: "identity", options: { subtitleField: "email" } }
   */
  display?: ColumnDisplay;
}

/** A frontend data type a column renders its cells with. */
export interface ColumnDisplay {
  /** Id of the data type registered on the frontend (`registerDataType`). */
  type: string;
  /** Options handed to its formatter. */
  options?: Record<string, unknown>;
  /**
   * Column header in the grid, in place of `name` (which forms, filters and
   * exports keep). `$`-prefixed: an i18n key.
   */
  label?: string;
}

/**
 * What one table view enforces on the rows its write actions reach: its own
 * row rules (archive-mode defaults included) and how it identifies a row.
 * Kept per table view: the data routes are shared by every table view over
 * the controller, the rules of one of them are not.
 */
export interface TableViewRowScope {
  rowActions?: TableViewRowActionOptions<any>;
  idField: string;
  strictMode: boolean;
}

export class TableViewMeta {
  public static key = Symbol();

  constructor(public readonly target: new (...args: unknown[]) => unknown) {}

  public options: TableViewOptions<any> = {};
  public readonly columns: Record<string, ColumnOptions> = {};
  public readonly groups: Record<string, ColumnGroupConfig> = {};
  public archiveField?: string;
  /**
   * Row rules applied controller-wide, on top of each table view's own: set
   * only by an explicit `setControllerRowActionRules`. `TableView()` keeps a
   * table's rules to that table (see `setRowScope`).
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
  private readonly resourceFormRefs = new WeakRefList<FormBuilder>();

  /**
   * Every live TableView built on this controller, in build order. Several
   * pages may mount their own TableView over the same data routes: an action
   * is guarded by the permission of each table view mounting it (see
   * `actionPermissionIds`).
   */
  public get componentBuilders(): ComponentBuilder<TableViewOptionsSerialized>[] {
    return this.componentBuilderRefs.live();
  }

  /** Records a TableView built on this controller (once per builder). */
  public addComponentBuilder(
    builder: ComponentBuilder<TableViewOptionsSerialized>,
  ): void {
    this.componentBuilderRefs.add(builder);
  }

  /** The live table view built last over this controller. */
  public get componentBuilder():
    | ComponentBuilder<TableViewOptionsSerialized>
    | undefined {
    return this.componentBuilders.at(-1);
  }

  /**
   * Records a table view built over this controller, like
   * `addComponentBuilder`: it joins the others, never replaces them.
   */
  public set componentBuilder(
    builder: ComponentBuilder<TableViewOptionsSerialized> | undefined,
  ) {
    if (builder) this.addComponentBuilder(builder);
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
   * TableViews and its `new` / `edit` forms (ResourceForm blocks, and the
   * forms a page-mode TableView mounts on its form sub-pages). A file one of
   * them staged is one those routes may save.
   */
  public get writingComponents(): Component[] {
    return [...this.componentBuilders, ...this.resourceFormBuilders];
  }

  /**
   * The permission id `actionId` carries on each TableView of this controller
   * that a page mounts, without duplicates. The data routes are shared by all
   * of them, so holding any one of these ids is what authorizes the action.
   * Empty when no mounted table view declares the action.
   */
  public actionPermissionIds(actionId: string): string[] {
    const ids = this.componentBuilders
      .map((builder) => builder.getAction(actionId)?.permissionId)
      .filter((id): id is string => !!id);
    return [...new Set(ids)];
  }

  /**
   * The mounted table view a request names by its component permission id
   * (`tableKey`), provided it declares `actionId`. Undefined for an unknown
   * key, an unstamped table view or one without the action.
   */
  public tableViewFor(
    tableKey: string,
    actionId: string,
  ): ComponentBuilder<TableViewOptionsSerialized> | undefined {
    const permissionId = `${tableKey}.${actionId}`;
    return this.componentBuilders.find(
      (builder) => builder.getAction(actionId)?.permissionId === permissionId,
    );
  }

  // Weak, like the builders: a hot-reloaded table view's rules go with it.
  private readonly rowScopes = new WeakMap<
    ComponentBuilder<TableViewOptionsSerialized>,
    TableViewRowScope
  >();

  /** Records the row rules a table view built over this controller enforces. */
  public setRowScope(
    builder: ComponentBuilder<TableViewOptionsSerialized>,
    scope: TableViewRowScope,
  ): void {
    this.rowScopes.set(builder, scope);
  }

  /** The row rules of one table view, as `setRowScope` recorded them. */
  public rowScopeOf(
    builder: ComponentBuilder<TableViewOptionsSerialized>,
  ): TableViewRowScope | undefined {
    return this.rowScopes.get(builder);
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
            display: options.display,
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

      Validator(async (value) => {
        const result = await zodSchema.safeParseAsync(value);
        return result.success;
      })(target, key, descriptor ?? {});
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
