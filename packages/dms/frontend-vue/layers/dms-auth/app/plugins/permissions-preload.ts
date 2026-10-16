/**
 * Loads the permission set as the app starts when the `auth` middleware will
 * need it, rather than once the middlewares ahead of it are done: the request
 * runs alongside the others the render makes, and the middleware joins it.
 *
 * Only then: a signed-in user opening a registered page that is not public,
 * which is when the middleware loads the set. Anywhere else nothing is asked
 * that was not asked before. A failure stays the middleware's to handle.
 */
export default defineDmsPlugin(() => {
  if (!useDmsUserSession().loggedIn.value) return;
  const page = useSiteLayout().findMatchingRoute(useDmsRoute().path);
  if (!page || page.metadata.publicAccess === true) return;
  usePermissions()
    .loadPermissions()
    .catch(() => undefined);
});
