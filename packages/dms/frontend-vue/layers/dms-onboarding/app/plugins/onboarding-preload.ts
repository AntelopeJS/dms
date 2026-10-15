/**
 * Asks for the onboarding status as the app starts rather than when the
 * `onboarding` middleware does, once the plugins and the page have set up:
 * the request runs alongside the others the render makes, and the middleware
 * joins it. A failure stays the middleware's to handle.
 */
export default defineDmsPlugin(() => {
  useOnboarding().catch(() => undefined);
});
