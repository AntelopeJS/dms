/**
 * Demo of the framed ("cadré") app-widget mode. Registers two widgets so the
 * bottom-left dock shows the vertical stack: each renders a low-opacity chip
 * that unfolds its `body` component into an animated card on hover.
 *
 * Registration is serializable (icon/label/body are plain strings), so this is
 * a universal plugin — no `.client` needed, and the dock renders during SSR.
 * For the free, self-positioned mode instead, use `useAppOverlay().register`.
 */
export default defineDmsPlugin(() => {
  const { register } = useAppWidgets();

  register({
    id: "demo:status",
    icon: "i-ph-heartbeat",
    label: "$demo.widgets.status.label",
    body: "WidgetDemoInfo",
    order: 0,
  });

  register({
    id: "demo:actions",
    icon: "i-ph-cursor-click",
    label: "$demo.widgets.actions.label",
    body: "WidgetDemoCard",
    order: 1,
  });
});
