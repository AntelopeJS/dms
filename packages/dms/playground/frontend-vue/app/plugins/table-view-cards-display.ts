import { defineAsyncComponent } from "vue";

const TaskCardsDisplay = defineAsyncComponent(
  () => import("../components/TaskCardsDisplay.vue"),
);

// Registers the presentation of a project-contributed "cards" display. Its data
// behaviour (shared list query) and chrome use the config defaults, so the page's
// TableView config needs no extra flags. A universal plugin: the server render
// draws the view switcher with it, so hydration finds it in place.
export default defineDmsPlugin(() => {
  registerTableViewDisplay({
    id: "cards",
    label: "Cards",
    icon: "i-ph-cards",
    order: 30,
    component: TaskCardsDisplay,
  });
});
