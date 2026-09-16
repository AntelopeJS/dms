import assert from "node:assert";
import type { RequestContext } from "@antelopejs/interface-api";
import {
  type Class,
  type ClassDecorator,
  MakeClassDecorator,
} from "@antelopejs/interface-core/decorators";
import type {
  ValueProxy,
  ValueProxyOrValue,
} from "@antelopejs/interface-database";
import type { ComponentInfoSerialized } from "../../component";
import type { z } from "zod";

export type FilterComponent = ComponentInfoSerialized | "noInput";

interface DataCompareModeMetadata {
  id: string;
  instance: DataCompareMode;
  noInput: boolean;
}

const dataCompareModes: Record<string, DataCompareMode> = {};
const dataCompareModesMetadata = new Map<
  Class<DataCompareMode>,
  DataCompareModeMetadata
>();
const dataTypes: Record<string, Class<DataType>> = {};
const dataTypesReverse = new Map<Class<DataType>, string>();

export interface DataCompareMode {
  filter(
    context: RequestContext,
    proxy: ValueProxy<unknown>,
    key: string,
    value: unknown,
    row: ValueProxy<Record<string, unknown>>,
  ): ValueProxyOrValue<boolean>;
}

export abstract class DataType {
  constructor(
    public readonly compareModes: Class<DataCompareMode>[] = [],
    public readonly defaultCompareMode?: Class<DataCompareMode>,
    public readonly options?: Record<string, unknown>,
  ) {}

  // A published contract: the runtime calls this positionally and every
  // implementing module declares the same shape, so an options object
  // cannot be introduced from this side.
  // oxlint-disable-next-line eslint/max-params
  public filter(
    context: RequestContext,
    proxy: ValueProxy<unknown>,
    key: string,
    value: string,
    mode: string,
    row: ValueProxy<Record<string, unknown>>,
  ): ValueProxyOrValue<boolean> {
    const compareMode = dataCompareModes[mode];
    if (!compareMode) return false;
    return compareMode.filter(context, proxy, key, value, row);
  }

  /**
   * Returns the default input component for this data type.
   * Override this method in subclasses to provide a custom input component.
   *
   * @returns The default input component for this data type
   */
  protected abstract defaultInputComponent(): ComponentInfoSerialized;

  /**
   * Returns filters components for this data type.
   * This component is used in filters for filtering values of this data type.
   * Must include a 'default' component, and can optionally include
   * mode-specific components for different compare modes.
   * Override this method in subclasses for custom filter components per mode.
   *
   * @returns A record of filter components with at least a 'default' key
   */
  public filterComponents(): Record<string, ComponentInfoSerialized> & {
    default: ComponentInfoSerialized;
  } {
    return {
      default: this.defaultInputComponent(),
    };
  }

  /**
   * Returns the form input component for this data type.
   * This component is used in forms for editing values of this data type.
   *
   * @returns The input component for this data type
   */
  public inputComponent(): ComponentInfoSerialized {
    return this.defaultInputComponent();
  }

  /**
   * Returns a Zod schema for validating values of this data type.
   * This schema is used in the edit or new process in data-api to validate values
   * before saving to the database.
   *
   * @returns A Zod schema for this data type
   */
  abstract getValidation(): z.ZodType;

  /**
   * Called to add additional decorators on the field using this data type.
   *
   * @param target Class prototype
   * @param key Property name
   * @param descriptor Property descriptor
   */
  public decorateField?(
    target: unknown,
    key: PropertyKey,
    descriptor?: PropertyDescriptor,
  ): void;
}

/**
 * Register a new data type
 * @param id - The id of the data type
 * @returns The data type class decorator
 */
export const RegisterDataType: (id: string) => ClassDecorator<Class<DataType>> =
  MakeClassDecorator((target, id: string) => {
    dataTypes[id] = target;
    dataTypesReverse.set(target, id);
  });

/**
 * Register a new data compare mode
 * @param id - The id of the data compare mode
 * @param noInput - Whether this compare mode requires no input (default: false)
 * @returns The data compare mode class decorator
 */
export const RegisterDataCompareMode: (
  id: string,
  noInput?: boolean,
) => ClassDecorator<Class<DataCompareMode>> = MakeClassDecorator(
  (target, id: string, noInput: boolean = false) => {
    const instance = new target();
    dataCompareModes[id] = instance;
    dataCompareModesMetadata.set(target, {
      id,
      instance,
      noInput,
    });
  },
);

/**
 * Create a new data type instance
 * @param id - The id of the data type
 * @param options - The options for the data type
 * @returns The data type instance
 */
export function CreateDataType(id: string, options?: unknown) {
  const cls = dataTypes[id];
  assert(cls, `Unknown type ${id}`);
  return new cls(options);
}

/**
 * Get the ID of a DataType instance
 */
export function getDataTypeId(instance: DataType): string | undefined {
  return dataTypesReverse.get(Object.getPrototypeOf(instance).constructor);
}

export interface DataTypeSerialized {
  id: string;
  compareModes: string[];
  defaultCompareMode?: string;
  filterComponents: Record<string, FilterComponent>;
  inputComponent: ComponentInfoSerialized;
}

export function serializeType(
  instance?: DataType,
): DataTypeSerialized | undefined {
  if (instance) {
    const id = getDataTypeId(instance);
    if (id) {
      const compareModes = instance.compareModes
        .map((modeClass) => dataCompareModesMetadata.get(modeClass)?.id)
        .filter(Boolean) as string[];

      const defaultCompareMode = instance.defaultCompareMode
        ? dataCompareModesMetadata.get(instance.defaultCompareMode)?.id
        : undefined;

      const inputComponents = instance.filterComponents();
      const filteredInputComponents: Record<string, FilterComponent> = {
        ...inputComponents,
      };

      instance.compareModes.forEach((modeClass) => {
        const metadata = dataCompareModesMetadata.get(modeClass);
        if (metadata?.noInput) {
          filteredInputComponents[metadata.id] = "noInput";
        }
      });

      return {
        id,
        compareModes,
        defaultCompareMode,
        filterComponents: filteredInputComponents,
        inputComponent: instance.inputComponent(),
      };
    }
  }
}
