import { confirmLeave } from "#dms-ui/app/composables/unsaved-changes/registry";

export default defineDmsMiddleware(async (to, from) => {
  if (to.path === from.path) {
    return;
  }

  // Unsaved changes anywhere (the page's forms, an open drawer or modal, a
  // settings panel): one warning dialog, whatever holds them.
  if (!(await confirmLeave())) {
    return abortNavigation();
  }

  const { executeGuards } = useLeaveGuard();
  const pageKey = `${PAGE_GUARD_PREFIX}-${from.path}`;

  const canLeave = await executeGuards(pageKey);

  if (!canLeave) {
    return abortNavigation();
  }
});
