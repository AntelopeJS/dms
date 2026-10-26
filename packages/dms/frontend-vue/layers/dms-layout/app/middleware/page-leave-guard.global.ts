import { confirmLeave } from "#dms-ui/app/build/composables/unsaved-changes/registry";

export default defineDmsMiddleware(async (to, from) => {
  if (to.path === from.path) {
    return;
  }

  if (!(await confirmLeave())) {
    return abortDmsNavigation();
  }

  const { executeGuards } = useLeaveGuard();
  const pageKey = `${PAGE_GUARD_PREFIX}-${from.path}`;

  const canLeave = await executeGuards(pageKey);

  if (!canLeave) {
    return abortDmsNavigation();
  }
});
