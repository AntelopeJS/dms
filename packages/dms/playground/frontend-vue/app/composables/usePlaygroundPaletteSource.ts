/** Id of the playground's command palette source; its group ids start with it. */
export const PLAYGROUND_PALETTE_SOURCE_ID = "demo:shortcuts";

const PLAYGROUND_PALETTE_SOURCE_ORDER = 30;
const FOUNDATIONS_PATH = "/foundations/foundations-labels";
const FEATURE_INDEX_PATH = "/examples/features";

/** Translates a key of the playground's locale files. */
export type PaletteTranslate = (key: string) => string;

/** The open state of the demo side panel, read in a setup context. */
export type DemoSidePanel = ReturnType<typeof useSidePanel>;

/**
 * Registers the playground's own group in the command palette (Ctrl/Cmd+K):
 * two pages, one of them found by words it does not show, and a command that
 * toggles the demo side panel. The items carry callables, so call it from
 * client context (a `.client` plugin, or a component). The caller reads the
 * side panel in its setup: a click handler has no app context to read it in.
 */
export function registerPlaygroundPaletteSource(
  t: PaletteTranslate,
  sidePanel: DemoSidePanel,
): void {
  registerCommandPaletteSource({
    id: PLAYGROUND_PALETTE_SOURCE_ID,
    order: PLAYGROUND_PALETTE_SOURCE_ORDER,
    groups: () => [
      {
        id: `${PLAYGROUND_PALETTE_SOURCE_ID}:items`,
        label: t("demo.frontend.palette.group"),
        items: [
          {
            label: t("demo.frontend.palette.foundations"),
            icon: "i-ph-shapes",
            to: FOUNDATIONS_PATH,
            [COMMAND_PALETTE_SEARCH_TEXT_KEY]: t(
              "demo.frontend.palette.foundations_search",
            ),
          },
          {
            label: t("demo.frontend.palette.features"),
            icon: "i-ph-list-checks",
            to: FEATURE_INDEX_PATH,
          },
          {
            label: t(
              sidePanel.isOpen.value
                ? "demo.frontend.palette.close_panel"
                : "demo.frontend.palette.open_panel",
            ),
            icon: "i-ph-sidebar-simple",
            onSelect: sidePanel.toggle,
          },
        ],
      },
    ],
  });
}
