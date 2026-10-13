import { writePageSetupLog } from "../composables/usePageSetupLog";

/** The `setupId` the demo pages name. */
const PAGE_SETUP_DEMO_ID = "dms:demo:form-lifecycle";
/** Key of the form block the demo pages declare. */
const WATCHED_FORM_ID = "form";

/**
 * Demo of a page setup function: a page names it with `setupId`, the DMS
 * runs it once the page mounted and calls what it returns when the page
 * unmounts. It writes what it sees to a log that `PageSetupLog` shows.
 */
export default defineDmsPlugin(() => {
  const { registerFunction } = useDefinedFunctions();
  registerFunction(PAGE_SETUP_DEMO_ID, ((ctx) => {
    writePageSetupLog(
      `Mounted on ${ctx.pageInfo.fullId}`,
      `${ctx.permissions.size} permission(s)`,
    );

    ctx.on(WATCHED_FORM_ID, FormEvents.FIELD_CHANGE, (data) => {
      writePageSetupLog("Form field changed", JSON.stringify(data));
    });

    return () => {
      writePageSetupLog(`Cleaned up on ${ctx.pageInfo.fullId}`);
    };
  }) as PageSetupFunction);
});
