const COMPACT_ACTION_ID = "demo:compact";
const COMPACT_ACTION_ORDER = 80;
const CHROME_PATH_PREFIX = "/dashboard-chrome/";
const COMPACT_SCALE = "small";
const DEFAULT_SCALE = "normal";

/**
 * Demo of a header action that runs code: a toggle between the compact and
 * the default interface scale, engaged while compact, shown only on the
 * dashboard chrome pages. Client-only: `onSelect`, `isActive` and `isVisible`
 * are callables, which the SSR payload would drop.
 */
export default defineDmsPlugin(() => {
  const route = useDmsRoute();
  const scale = useInterfaceScale();

  registerHeaderAction({
    id: COMPACT_ACTION_ID,
    icon: "i-ph-arrows-in",
    label: "$demo.frontend.header_action",
    order: COMPACT_ACTION_ORDER,
    isVisible: () => route.path.startsWith(CHROME_PATH_PREFIX),
    isActive: () => scale.value === COMPACT_SCALE,
    onSelect: () => {
      scale.value =
        scale.value === COMPACT_SCALE ? DEFAULT_SCALE : COMPACT_SCALE;
    },
  });
});
