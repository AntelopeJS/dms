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
}

export class TableViewMeta {
  public static key = Symbol();

  constructor(public readonly target: new (...args: unknown[]) => unknown) {}

  public options: TableViewOptions<any> = {};
  public readonly columns: Record<string, ColumnOptions> = {};
  public readonly groups: Record<string, ColumnGroupConfig> = {};
  public archiveField?: string;
  public controllerRowActionRules?: TableViewRowActionOptions<any>;
  public controllerGuards?: TableViewGuards<any>;
  public bypassTenantAccessGate = false;
  public componentBuilder?: ComponentBuilder<TableViewOptionsSerialized>;

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
