"use strict";

const assert = require("node:assert/strict");

function baselineContract() {
  const inventory = {
    "attachments/": "access bindings constraints fields read registry save table-view uploads",
    "automation/": "actions events i18n index registration-lifecycle send-notification sources triggers",
    "": "client-origin-cors config frontend-module index startup-config",
    "crons/": "cleanup-user-invites index sweep-expired-sessions sweep-stale-exports",
    "db/": "index",
    "db/models/": "attachments.model index notification-feed-filter signInAttempts.model systemState.model userEmailChanges.model userKnownDevices.model userNotificationPreferences.model userNotifications.model",
    "db/tables/": "attachments.table index signInAttempts.table systemState.table userEmailChanges.table userKnownDevices.table userNotificationPreferences.table userNotifications.table",
    "dev/": "module-update-notifications",
    "hooks/": "invite-extensions tenant-deleted workspace-notifications",
    "implementations/dms-auth/": "account-emails index session-handoff token-secret token-session",
    "implementations/dms-base/": "bulk-selection export-jobs filter-tokens footer-summary search-route table-view tenant-export-archive",
    "implementations/dms-html-render/": "constants index service-jwt template-registry",
    "implementations/dms-notifications/": "delivery-dedupe delivery-guard index registry",
    "implementations/dms/": "api-base-url attachments client-base-url client-ip dev-handshake dev-reload frontend-backend-proxies frontend-bootstrap frontend-modules frontend-public-endpoints frontend-ready guards invite-extensions layout-banners manifest menu-categories nav-badges page permission-preview permissions-resolver permissions quick-actions realtime resolver-timeout route-params saas-mode stale-session tenant-access uploads warn-once",
    "page-extensions/": "pending-report",
    "pages/": "index",
    "pages/modules/": "index modules-index modules-store",
    "pages/public/auth/": "2fa accounts backup forgot-validation forgot login oauth-complete recover-success recover signup validate",
    "pages/public/": "index",
    "pages/public/onboarding/": "index",
    "pages/public/preview/": "block-types fixtures index",
    "pages/settings/": "index settings-index",
    "pages/settings/overview/": "account-activity account-summary",
    "pages/settings/users/": "account-activity-feed account-activity-store account-activity account-credentials account-data-store account-data appearance category current-password dashboard-languages email-change index invite-email-outcome invite-extension-routes invite-resend invites member-change-notifications member-invite-batch member-invite-form member-management member-role-options member-roles-field members notifications permission-tree-nodes permission-warnings profile-access profile-helpers profile quick-actions region-form region regional-preferences role-editor-store role-editor role-preview roles security-attention security shortcuts two-factor-operations",
    "realtime/": "broker current heartbeat index instance presence redis-broker registry sessions sse table-view",
    "routes/": "auth block-preview files index onboarding realtime store system-state",
    "routes/auth/": "client-ip constants forgot-password index invite login-throttle login logout me pick-tenant refresh request-2fa-email request-email-verification reset-code reset-password session-handoff session-response signup switch-tenant two-factor-throttle types validate-forgot-password-token validate-invite-token verify-2fa verify-email",
    "routes/auth/oauth/": "authorize-url callback config identity-resolution index linking-policy providers relay state token-exchange",
    "store/": "activity cache catalog compatibility declarations frontend-compatibility interfaces listing operations registry requirements runtime tarball",
    "utils/": "account-notifications admin-invite-email attempt-limiter auth-key email-change-mail email-subjects ensure-default-tenant export-jobs-run export-jobs failed-sign-ins index notification-emitter notification-rules notification-tones one-time-code row-action-rule-evaluator run-in-batches sign-in-country sign-in-devices sign-in-monitor tenant-export-archive tenant-instances two-factor-codes upload-constraints upload-token user-activity user-agent workspace-notifications",
    "validation/": "account-deletion.schema auth.schema file.schema issue-message member-invite.schema member-ownership.schema password regional-preferences.schema role-editor.schema security.schema store.schema user-notification-preferences.schema",
    "validation/onboarding/": "index register-admin.schema",
  };
  const modules = Object.entries(inventory).flatMap(([directory, names]) =>
    names.split(" ").map((name) => `${directory}${name}.js`)).sort();
  assert.equal(modules.length, 273);
  const moves = new Map(Object.entries({
    "config.js": "config/internal/state.js",
    "startup-config.js": "config/startup-config.js",
    "client-origin-cors.js": "config/client-origin-cors.js",
    "implementations/dms-notifications/registry.js": "utils/notification-registry.js",
    "routes/auth/client-ip.js": "utils/client-ip.js",
    "routes/auth/constants.js": "utils/auth-constants.js",
    "routes/auth/login-throttle.js": "utils/login-throttle.js",
    "routes/auth/request-email-verification.js": "utils/request-email-verification.js",
    "utils/sign-in-monitor.js": "hooks/internal/sign-in-monitor.js",
    "utils/workspace-notifications.js": "hooks/internal/workspace-notifications.js",
  }));
  for (const name of ["dev-reload", "frontend-backend-proxies", "frontend-bootstrap",
    "frontend-modules", "frontend-public-endpoints", "frontend-ready", "manifest", "warn-once"]) {
    moves.set(`implementations/dms/${name}.js`, `store/internal/frontend/${name}.js`);
  }
  const privateBarrels = {
    "automation/index.js": "__esModule registerAutomationNodes unregisterAutomationNodes listenersFor emitAutomationEvent",
    "db/index.js": "__esModule AttachmentModel SignInAttemptsModel SystemStateModel UserEmailChangesModel UserKnownDevicesModel UserNotificationPreferencesModel UserNotificationsModel buildNewUserNotification attachmentsTableName Attachment signInAttemptsTableName SignInAttempt systemStateTableName SystemState userEmailChangesTableName UserEmailChange userKnownDevicesTableName UserKnownDevice userNotificationPreferencesTableName UserNotificationPreferences userNotificationsTableName UserNotification",
    "db/models/index.js": "__esModule AttachmentModel SignInAttemptsModel SystemStateModel UserEmailChangesModel UserKnownDevicesModel UserNotificationPreferencesModel UserNotificationsModel buildNewUserNotification",
    "realtime/index.js": "__esModule getPresenceTracker getRealtimeBroker subscribeRealtime setRealtimeBroker configureRealtime stopRealtime EVERY_TENANT InMemoryBroker isEventForTenant instanceId PRESENCE_EVENT_TYPE PresenceTracker RedisBroker MENU_CHANGED_EVENT_TYPE MENU_BROADCAST_TOPIC buildMenuTopic buildMemberMenuTopic buildUserNotificationTopic registerPageTopic unregisterPageTopic clearPageTopics getPageTopics openSseStream",
    "routes/auth/index.js": "__esModule resolveClientIp resolveRequestClientIp trustedProxyCount forgotPassword login logout me buildOAuthAuthorizeUrl oauthCallback OAUTH_CALLBACK_PATH resolveOAuthPolicy listEnabledOAuthProviders describeEnabledOAuthProviders getEnabledOAuthProvider buildOAuthRedirectUri claimUnvalidatedAccount resolveOAuthUser decideOAuthResolution OAUTH_PROVIDERS deriveOAuthRelaySecret assertOAuthRelay signOAuthState assertValidOAuthState exchangeCodeForAccessToken HTTP_FORBIDDEN refresh request2FAEmail requestEmailVerification resetPassword redeemSessionHandoff issueAuthResponse resolveLoginOutcome signupLanguage signup switchTenant validateForgotPasswordToken validateInviteToken verify2FA verifyEmail",
    "utils/index.js": "__esModule ensureDefaultTenantExists provisionDefaultTenant DEFAULT_DELIVERY DEFAULT_EXPORT_FORMAT EMAIL_DELIVERY EXPORT_JOB_QUERY_PARAM EXPORT_TTL_MS DEFAULT_EXPORT_HISTORY_LIMIT getExporter readJobResult getDeliverer getExportLocalScratchPath uploadExportToStorage streamExportFromStorage deleteExportFromStorage sweepStaleExportsAllTenants deleteUserExportsInTenant deleteAllExportsForTenant buildExportFilename runExportJob loadExportJobForUser getExportJobExpiry getExportJobStatus listExportJobs downloadExportJob runInBatches TENANT_EXPORT_CONTENT_TYPE TENANT_EXPORT_EXTENSION buildTenantExportArchive startTenantExportJob getRowInstance MILLISECONDS_PER_SECOND MILLISECONDS_PER_MINUTE MILLISECONDS_PER_HOUR MILLISECONDS_PER_DAY assertPrimitiveValue parseValue parseObject isStringKeyword isStringNumber isStringDate isStringJSON registerTenantInstance registerExistingTenantInstances",
  };
  const implementationEntries = [
    "implementations/dms-auth/index.js",
    "implementations/dms-base/export-jobs.js",
    "implementations/dms-base/table-view.js",
    "implementations/dms-base/tenant-export-archive.js",
    "implementations/dms-html-render/index.js",
    "implementations/dms-notifications/index.js",
    ..."api-base-url attachments client-base-url client-ip guards invite-extensions layout-banners page permissions permissions-resolver quick-actions realtime saas-mode tenant-access uploads"
      .split(" ").map((name) => `implementations/dms/${name}.js`),
  ].sort();
  return {
    modules,
    moves,
    implementationEntries,
    privateBarrels: Object.fromEntries(Object.entries(privateBarrels)
      .map(([name, keys]) => [name, keys.split(" ")])),
  };
}

module.exports = { baselineContract };
