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
  display?: {
    type: string;
    options?: Record<string, unknown>;
    /** Grid header in place of `header`. */
    label?: string;
  };
}
