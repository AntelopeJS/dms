import { defineAsyncComponent } from "vue";
import { isEligibleKanbanColumn } from "../composables/table-view/kanban";
import {
  KANBAN_DISPLAY_ID,
  TABLE_DISPLAY_ID,
} from "../composables/table-view/types";

const KanbanDisplay = defineAsyncComponent(
  () => import("../components/table-view/KanbanDisplay.vue"),
);

// Registers the presentation of the built-in displays (client-only: displays
// carry callables stripped from the SSR payload). Data behaviour and chrome
// (selfManagedData/capabilities) are config-driven for SSR safety.
export default defineDmsPlugin(() => {
  registerTableViewDisplay({
    id: TABLE_DISPLAY_ID,
    label: "dms.table.view_mode_table",
    icon: "i-ph-rows",
    order: 10,
  });

  registerTableViewDisplay({
    id: KANBAN_DISPLAY_ID,
    label: "dms.table.view_mode_kanban",
    icon: "i-ph-kanban",
    order: 20,
    component: KanbanDisplay,
    isAvailable: (ctx) => ctx.columns.some(isEligibleKanbanColumn),
  });
});
