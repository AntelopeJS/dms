import { defineAsyncComponent } from "vue";

const TASK_CARDS_DISPLAY_ID = "playground:task-cards";

const TaskCardsDisplay = defineAsyncComponent(
  () => import("../components/TaskCardsDisplay.vue"),
);

// Registers the presentation of a project-contributed card display, under the
// project's own prefix: the built-in ids (cards among them) are reserved. Its
// data behaviour (shared list query) and chrome use the config defaults, so the
// page's TableView config needs no extra flags. A universal plugin: the server
// render draws the view switcher with it, so hydration finds it in place.
export default defineDmsPlugin(() => {
  registerTableViewDisplay({
    id: TASK_CARDS_DISPLAY_ID,
    label: "Cards",
    icon: "i-ph-cards",
    order: 30,
    component: TaskCardsDisplay,
  });
});
