const PAGE_SETUP_DEMO_ID = "dms:demo:form-lifecycle";

const LOGGED_FORM_EVENTS = [
  FormEvents.FIELD_CHANGE,
  FormEvents.SUBMIT,
  FormEvents.SUBMIT_SUCCESS,
  FormEvents.SUBMIT_ERROR,
  FormEvents.RESET,
];

export default defineDmsPlugin(() => {
  const { registerFunction } = useDefinedFunctions();
  registerFunction(PAGE_SETUP_DEMO_ID, ((ctx) => {
    console.log(
      `[dms-demo] page-setup mounted on "${ctx.pageInfo.fullId}" (${ctx.permissions.size} permission(s))`,
    );

    const offEvents = LOGGED_FORM_EVENTS.map((event) =>
      ctx.on("form", event, (data) => {
        console.log(
          `[dms-demo] form ${event} on "${ctx.pageInfo.fullId}"`,
          data,
        );
      }),
    );

    return () => {
      console.log(`[dms-demo] page-setup cleanup for "${ctx.pageInfo.fullId}"`);
      offEvents.forEach((off) => off());
    };
  }) as PageSetupFunction);
});
