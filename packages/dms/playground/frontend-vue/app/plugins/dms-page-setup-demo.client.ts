const PAGE_SETUP_DEMO_ID = "dms:demo:form-lifecycle";

export default defineDmsPlugin(() => {
  const { registerFunction } = useDefinedFunctions();
  registerFunction(PAGE_SETUP_DEMO_ID, ((ctx) => {
    console.log(
      `[dms-demo] page-setup mounted on "${ctx.pageInfo.fullId}" (${ctx.permissions.size} permission(s))`,
    );

    const offSubmit = ctx.on("form", FormEvents.FIELD_CHANGE, (data) => {
      console.log(
        `[dms-demo] form field-change on "${ctx.pageInfo.fullId}"`,
        data,
      );
    });

    return () => {
      console.log(`[dms-demo] page-setup cleanup for "${ctx.pageInfo.fullId}"`);
      offSubmit();
    };
  }) as PageSetupFunction);
});
