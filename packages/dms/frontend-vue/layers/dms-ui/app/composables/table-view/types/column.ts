export enum AccessMode {
  ReadOnly = 1,
  WriteOnly = 2,
  ReadWrite = 3,
}

export enum ReadonlyBehaviorMode {
  disabled = "disabled",
  hidden = "hidden",
  default = "default",
}

export interface ReadonlyBehavior {
  new?: ReadonlyBehaviorMode;
  edit?: ReadonlyBehaviorMode;
  view?: ReadonlyBehaviorMode;
}

/** The display a column's cells are drawn with (backend `ColumnDisplay`). */
export interface TableViewColumnDisplay {
  /** Id of the frontend data type drawing the cells. */
  type: string;
  options?: Record<string, unknown>;
}

export interface TableViewColumn {
  id: string;
  header: string;
  isVisible?: boolean;
  order?: number;
  accessorKey: string;
  listable: boolean;
  type: DataTypeConfig;
  required?: {
    new: boolean;
    edit: boolean;
  };
  description?: string;
  defaultValue?: unknown;
  accessMode?: AccessMode;
  readonlyBehavior?: ReadonlyBehaviorMode | ReadonlyBehavior;
  enableSorting?: boolean;
  enableColumnFilter?: boolean;
  /** Wrap grid cell content without a line limit; omitted keeps the theme default. */
  cellWrap?: boolean;
  /** Default grid column width in px (TanStack `size`). */
  size?: number;
  /**
   * Data type the grid draws this column's cells with, instead of `type`
   * (which keeps driving forms and filters).
   */
  display?: TableViewColumnDisplay;
}
