export default defineDmsMiddleware(async (to, from) => {
  if (to.path === from.path) {
    return;
  }

  const { executeGuards } = useLeaveGuard();
  const pageKey = `${PAGE_GUARD_PREFIX}-${from.path}`;

  const canLeave = await executeGuards(pageKey);

  if (!canLeave) {
    return abortNavigation();
  }
});
