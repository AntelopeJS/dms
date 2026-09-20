export const GRID_CONTEXT = Symbol("grid-context");

export interface GridContext {
  registerRowColumnCount: (count: number) => void;
  maxColumns: ComputedRef<number>;
  gap: ComputedRef<string>;
  minColumnWidth: ComputedRef<string>;
}
