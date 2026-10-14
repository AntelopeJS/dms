const PLAYGROUND_SOURCE_URL =
  "https://github.com/AntelopeJS/dms/tree/main/packages/dms/playground";
const SIGNUP_PATH = "/auth/signup";
// The DMS's own footer links sit at 10 and 20: this one comes after them.
const FOOTER_LINK_ORDER = 30;
const AUTH_LINK_ORDER = 100;

/**
 * Demo of the links a module adds to the sign-in screens: one in the footer
 * of the empty layout (sign-in, errors), one under the sign-in form. Both
 * labels are plain i18n keys. Plain data, so a universal plugin: the server
 * renders them. An auth link is followed in the app, so it stays internal; a
 * footer link may leave it.
 */
export default defineDmsPlugin(() => {
  registerFooterLink({
    id: "demo:playground-source",
    label: "demo.frontend.links.footer",
    to: PLAYGROUND_SOURCE_URL,
    order: FOOTER_LINK_ORDER,
  });

  registerAuthLink({
    id: "demo:signup",
    page: "login",
    label: "demo.frontend.links.auth",
    to: SIGNUP_PATH,
    order: AUTH_LINK_ORDER,
  });
});
