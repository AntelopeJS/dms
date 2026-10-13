/**
 * The page setup function `/form/form-simple` names in `setupId`. It runs while
 * the page is mounted: it greets the visitor with a toast naming the page and
 * the permissions it receives, and listens to the form's field changes until
 * the page unmounts. The first change also emits an event on the shared bus.
 */
const PAGE_SETUP_DEMO_ID = "dms:demo:form-lifecycle";
const SETUP_DEMO_EVENT = "playground:setup-demo";

export default defineDmsPlugin((context) => {
  const toast = context.runWithContext(() => useToast());
  const { t } = context.$i18n;
  const { registerFunction } = useDefinedFunctions();
  registerFunction(PAGE_SETUP_DEMO_ID, ((ctx) => {
    toast.add({
      title: t("demo.pages.setup.mounted"),
      description: t("demo.pages.setup.mounted_description", {
        page: ctx.pageInfo.fullId,
        count: ctx.permissions.size,
      }),
      icon: "i-ph-plug",
    });

    let heardChange = false;
    const offFieldChange = ctx.on("form", FormEvents.FIELD_CHANGE, (data) => {
      if (heardChange) return;
      heardChange = true;
      toast.add({
        title: t("demo.pages.setup.field_change"),
        icon: "i-ph-ear",
      });
      ctx.emit("form", SETUP_DEMO_EVENT, data);
    });

    return () => {
      offFieldChange();
    };
  }) as PageSetupFunction);
});
