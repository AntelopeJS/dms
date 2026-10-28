import { defineAsyncComponent } from "vue";
import { storeTableViewDisplay } from "../build/composables/table-view/displayRegistry";
import { isEligibleKanbanColumn } from "../composables/table-view/kanban";
import {
  CARDS_DISPLAY_ID,
  GROUPED_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
  TABLE_DISPLAY_ID,
} from "../composables/table-view/types";

const KanbanDisplay = defineAsyncComponent(
  () => import("../components/table-view/KanbanDisplay.vue"),
);

const CardsDisplay = defineAsyncComponent(
  () => import("../build/components/table-view/CardsDisplay.vue"),
);

export default defineDmsPlugin(() => {
  storeTableViewDisplay({
    id: TABLE_DISPLAY_ID,
    label: "dms.table.view_mode_table",
    icon: "i-ph-rows",
    order: 10,
  });

  storeTableViewDisplay({
    id: GROUPED_DISPLAY_ID,
    label: "dms.table.view_mode_grouped",
    icon: "i-ph-rows-plus-bottom",
    order: 15,
  });

  storeTableViewDisplay({
    id: KANBAN_DISPLAY_ID,
    label: "dms.table.view_mode_kanban",
    icon: "i-ph-kanban",
    order: 20,
    component: KanbanDisplay,
    isAvailable: (ctx) => ctx.columns.some(isEligibleKanbanColumn),
  });

  storeTableViewDisplay({
    id: CARDS_DISPLAY_ID,
    label: "dms.table.view_mode_cards",
    icon: "i-ph-cards",
    order: 30,
    component: CardsDisplay,
  });
});
