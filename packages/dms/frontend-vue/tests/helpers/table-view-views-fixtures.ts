import type { TableFilter } from "../../layers/dms-ui/app/build/components/table/Table.vue";
import type { TableStateDefaults } from "../../layers/dms-ui/app/build/composables/table-view/utils/views";
const pinnedStatus: TableFilter = {
  accessorKey: "status",
  mode: "is",
  value: "open",
  pinned: true,
  initialValue: "open",
};

const DEFAULTS: TableStateDefaults = {
  pinnedFilters: [pinnedStatus],
  sorting: [{ id: "createdAt", desc: true }],
  visibility: { title: true, owner: true, email: false },
  columnOrder: ["title", "owner", "email"],
  display: "table",
  density: "default",
  displays: new Set(["table", "grouped"]),
};

export { pinnedStatus, DEFAULTS };
