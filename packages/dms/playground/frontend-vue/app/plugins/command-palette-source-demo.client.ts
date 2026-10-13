import { registerPlaygroundPaletteSource } from "../composables/usePlaygroundPaletteSource";
import { useSidePanelDemo } from "../composables/useSidePanelDemo";

/**
 * Demo of a command palette source: a group of the playground's own entries
 * in Ctrl/Cmd+K. Client-only: the items carry callables (`onSelect`), which
 * the SSR payload would drop.
 */
export default defineDmsPlugin(({ $i18n }) => {
  registerPlaygroundPaletteSource((key) => $i18n.t(key), useSidePanelDemo());
});
