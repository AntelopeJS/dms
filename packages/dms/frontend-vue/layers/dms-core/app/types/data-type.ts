export type ComponentOrNoInput =
  | ComponentInfo<ComponentOptionsData>
  | "noInput";

export interface DataTypeConfig {
  id: string;
  compareModes: string[];
  defaultCompareMode?: string;
  filterComponents: Record<string, ComponentOrNoInput>;
  inputComponent: ComponentInfo<ComponentOptionsData>;
}
