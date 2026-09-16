export default defineDmsMiddleware((to) => {
  if (to.path !== "/") {
    return;
  }

  const homepage = useHomepage();

  if (homepage !== "/") {
    return navigateDms(homepage, { replace: true });
  }
});
