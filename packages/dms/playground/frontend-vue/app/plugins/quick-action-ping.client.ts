/**
 * Listens for the window event the playground's `ping` quick action
 * dispatches (`target: { type: "event" }`) and answers with a toast, so
 * running the action from the command palette has a visible effect.
 *
 * Client-only: it listens on `window`.
 */
const PING_EVENT = "playground:quick-action-ping";

export default defineDmsPlugin((context) => {
  const toast = context.runWithContext(() => useToast());
  const { t } = context.$i18n;
  window.addEventListener(PING_EVENT, (event) => {
    const payload = event instanceof CustomEvent ? event.detail : undefined;
    toast.add({
      title: t("demo.pages.quick_actions.ping_toast"),
      description: t("demo.pages.quick_actions.ping_description", {
        payload: JSON.stringify(payload ?? {}),
      }),
      icon: "i-ph-broadcast",
    });
  });
});
