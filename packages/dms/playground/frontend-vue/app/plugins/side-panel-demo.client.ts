import {
  SIDE_PANEL_DEMO_ID,
  useSidePanelDemoOpen,
} from "../composables/useSidePanelDemo";

const SIDE_PANEL_DEMO_ICON = "i-ph-sidebar-simple-light";
const SIDE_PANEL_DEMO_ORDER = 90;

/**
 * Demo of a docked side panel (see `registerSidePanel`), toggled from a header
 * action. Both carry callables, so this is a `.client` plugin, and both join
 * the dashboard once the app is mounted: the header renders the actions it
 * knows, and one added before hydration would differ from the server's.
 */
export default defineDmsPlugin((context) => {
  context.hook("app:mounted", () =>
    context.runWithContext(() => {
      const isOpen = useSidePanelDemoOpen();
      const { translate } = getPluginI18n();

      registerHeaderAction({
        id: SIDE_PANEL_DEMO_ID,
        icon: SIDE_PANEL_DEMO_ICON,
        label: translate("demo.side_panel.toggle", {}),
        order: SIDE_PANEL_DEMO_ORDER,
        onSelect: () => {
          isOpen.value = !isOpen.value;
        },
        isActive: () => isOpen.value,
      });

      registerSidePanel({
        id: SIDE_PANEL_DEMO_ID,
        component: "SidePanelDemo",
        ariaLabel: "$demo.side_panel.title",
        isOpen: () => isOpen.value,
        onClose: () => {
          isOpen.value = false;
        },
      });
    }),
  );
});
