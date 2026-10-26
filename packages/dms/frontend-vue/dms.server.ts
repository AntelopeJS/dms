import { defineDmsServer } from "#dms/server";
import * as actions from "./layers/dms-auth/app/entries/server/actions";
import * as oauth from "./layers/dms-auth/app/entries/server/oauth";
import * as session from "./layers/dms-auth/app/entries/server/session";
import { renderHtml } from "./layers/dms-layout/app/entries/server/html-render";

const STORAGE_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;

const STORAGE_UPLOADS = {
  auth: "none",
  maxBodyBytes: STORAGE_UPLOAD_MAX_BYTES,
} as const;

export default defineDmsServer((server) => {
  server.registerBackendProxy("/api/**");
  server.registerBackendProxy("/dms/**");

  server.registerBackendProxy("/file-storage/upload/**", STORAGE_UPLOADS);
  server.registerBackendProxy("/file-storage/files/**", { auth: "none" });

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

  server.registerRoute("POST", "/api/html/render", renderHtml, {
    sameOrigin: false,
    overridesBackend: true,
  });
});
