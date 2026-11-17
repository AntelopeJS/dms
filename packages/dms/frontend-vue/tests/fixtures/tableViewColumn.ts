import type { TableViewColumn } from "../../layers/dms-ui/app/composables/table-view/types";

/** A complete listable column whose data type is `typeId`; `overrides` replace any member. */
export function tableViewColumn(
  id: string,
  overrides: Partial<TableViewColumn> = {},
  typeId = "text",
): TableViewColumn {
  return {
    id,
    accessorKey: id,
    header: id,
    listable: true,
    type: {
      id: typeId,
      compareModes: [],
      filterComponents: {},
      inputComponent: { componentName: "Input" },
    },
    ...overrides,
  };
}
