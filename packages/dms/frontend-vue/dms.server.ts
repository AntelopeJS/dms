import { defineDmsServer } from "#dms/server";
import * as actions from "./layers/dms-auth/server/actions";
import * as oauth from "./layers/dms-auth/server/oauth";
import * as session from "./layers/dms-auth/server/session";
import { renderHtml } from "./layers/dms-layout/server/html-render";

// What the DMS serves from the frontend server: its session, sign-in and
// provider sign-in routes, the session logic the server runs outside them,
// the e-mail render the backend asks for, and the backend prefixes the
// browser reaches through it. The renderer proxies no path on its own.
export default defineDmsServer((server) => {
  // The backend's API and the DMS's own routes (menu, page, page layouts,
  // permissions, realtime), with the session's token added server-side.
  server.registerBackendProxy("/api/**");
  server.registerBackendProxy("/dms/**");

  server.registerRoute("GET", "/api/_auth/session", session.readSessionRoute);
  server.registerRoute(
    "POST",
    "/api/_auth/session",
    session.refreshSessionRoute,
  );
  server.registerRoute("DELETE", "/api/_auth/session", session.logoutRoute);
  server.registerRoute(
    ["HEAD", "PUT", "PATCH", "OPTIONS"],
    "/api/_auth/session",
    session.sessionMethodNotAllowed,
    { sameOrigin: false },
  );

  server.registerRoute("POST", "/auth/login", actions.login);
  server.registerRoute("POST", "/auth/register", actions.signup);
  server.registerRoute("POST", "/auth/verify-2fa", actions.verifyTwoFactor);
  server.registerRoute(
    "POST",
    "/auth/request-2fa-email",
    actions.requestTwoFactorEmail,
  );
  server.registerRoute("POST", "/auth/establish", actions.establish);
  server.registerRoute("POST", "/auth/switch-account", actions.switchAccount);
  server.registerRoute("POST", "/auth/switch-tenant", actions.switchTenant);
  server.registerRoute(
    "POST",
    "/auth/validate-account",
    actions.validateAccount,
  );
  server.registerRoute(
    "POST",
    "/auth/remove-account",
    actions.removeStoredAccount,
  );

  server.registerRoute("GET", "/auth/oauth/:provider/start", oauth.oauthStart);
  server.registerRoute(
    "GET",
    "/auth/oauth/:provider/callback",
    oauth.oauthCallback,
  );
  server.registerRoute("POST", "/auth/oauth/handoff", oauth.oauthHandoff);

  server.registerAuth({
    signInPath: "/auth",
    signInExempt: ["/auth/**", "/onboarding"],
    refreshSession: session.renewSession,
    publicSession: session.publicSession,
  });

  // The backend authenticates with a single-use service token, not a
  // browser session, and its default `renderEndpoint` names this path.
  server.registerRoute("POST", "/api/html/render", renderHtml, {
    sameOrigin: false,
    overridesBackend: true,
  });
});
