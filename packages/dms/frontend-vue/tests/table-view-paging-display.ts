import { h, type FunctionalComponent } from "vue";
import type { TableViewDisplayContext } from "../layers/dms-ui/app/composables/table-view/types";
import type { mountTableView } from "./helpers/table-view-runtime";

export type MountConfig = NonNullable<Parameters<typeof mountTableView>[0]>;

export const PAGING_DISPLAY_NAME = "TestPagingDisplay";

export const PagingDisplay: FunctionalComponent<{
  context: TableViewDisplayContext;
}> = ({ context }) =>
  h(
    "button",
    {
      id: "remember-page",
      onClick: () => {
        context.pagination.setPageSize(24);
        context.pagination.setPage(3);
      },
    },
    "Remember page",
  );

export const arrivalConfig: MountConfig = {
  tableId: "content",
  isSoleTableView: true,
  tabs: [{ id: "open", label: "Open" }],
  displays: [
    { id: "table" },
    { id: "cards" },
    { id: "test:paging", component: { componentName: PAGING_DISPLAY_NAME } },
  ],
  views: {
    layout: "strip",
    items: [
      {
        id: "kept",
        label: "Kept view",
        sort: [{ field: "name", desc: true }],
        filters: [{ accessorKey: "secret", mode: "is", value: "remembered" }],
        columns: { hidden: ["secret"] },
        display: "test:paging",
      },
    ],
  },
};
