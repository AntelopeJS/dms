/**
 * A formal check: the source files it covers, the check's own files, the
 * command that runs it and how its output names a violated rule.
 */
export interface FormalCheck {
  name: string;
  covers: string[];
  files: string[];
  command: string[];
  violation: RegExp | null;
}

/** The formal checks of the repository, which CI's selector (`checks/affected-packages.mjs`) runs when a change touches their `covers` or `files`. */
export const formal: FormalCheck[] = [
  {
    name: "formal-onboarding-bootstrap",
    covers: [
      "packages/dms/src/routes/onboarding.ts",
      "packages/dms/src/db/models/systemState.model.ts",
      "packages/dms/src/db/tables/systemState.table.ts",
      "packages/dms/src/db/models/setupToken.model.ts",
      "packages/dms/src/db/tables/setupToken.table.ts",
      "packages/interface-dms/src/auth/db/tables/users.table.ts",
      "packages/interface-dms/src/tenant-ownership.ts",
      "packages/interface-dms/src/internal/tenant-ownership.ts",
      "packages/dms/src/routes/auth/oauth/callback.ts",
      "packages/dms/src/routes/auth/oauth/linking-policy.ts",
      "packages/dms/src/routes/auth/oauth/identity-resolution.ts",
      "packages/dms/src/routes/auth/oauth/config.ts",
      "packages/dms/src/routes/auth/signup.ts",
    ],
    files: [".agents/skills/formal-onboarding-bootstrap/**"],
    command: [
      "node",
      ".agents/skills/formal-onboarding-bootstrap/check.mjs",
      "--full",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-tenant-lifecycle",
    covers: [
      "packages/interface-dms/src/tenant-lifecycle.ts",
      "packages/interface-dms/src/tenant-members.ts",
      "packages/interface-dms/src/db/internal/tenantLifecycle.model.ts",
      "packages/interface-dms/src/db/internal/tenantLifecycle.table.ts",
      "packages/dms/src/hooks/tenant-deleted.ts",
    ],
    files: [".agents/skills/formal-tenant-lifecycle/**"],
    command: [
      "node",
      ".agents/skills/formal-tenant-lifecycle/check.mjs",
      "--full",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-default-tenant-provisioning",
    covers: [
      "packages/dms/src/utils/ensure-default-tenant.ts",
      "packages/dms/src/index.ts",
      "packages/interface-dms/src/tenant-provisioning.ts",
      "packages/interface-dms/src/db/tables/tenants.table.ts",
    ],
    files: [".agents/skills/formal-default-tenant-provisioning/**"],
    command: [
      "node",
      ".agents/skills/formal-default-tenant-provisioning/check.mjs",
      "--full",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-realtime-tabs",
    covers: [
      "packages/dms/src/routes/realtime.ts",
      "packages/dms/src/realtime/broker.ts",
      "packages/dms/src/realtime/index.ts",
      "packages/dms/src/realtime/sessions.ts",
      "packages/dms/src/realtime/sse.ts",
      "packages/dms/src/realtime/registry.ts",
      "packages/dms/src/realtime/table-view.ts",
      "packages/dms/src/implementations/dms/realtime.ts",
      "packages/dms/src/implementations/dms-base/table-view.ts",
      "packages/interface-dms/src/base/table-view/internal/realtime.ts",
      "packages/dms/frontend-vue/layers/dms-core/app/build/utils/crossTab.ts",
      "packages/dms/frontend-vue/layers/dms-core/app/build/utils/sharedRealtimeConnection.ts",
      "packages/dms/frontend-vue/layers/dms-core/app/composables/realtime/useUserRealtime.ts",
      "packages/dms/frontend-vue/layers/dms-core/app/composables/realtime/usePageRealtime.ts",
      "packages/dms/frontend-vue/layers/dms-core/app/composables/realtime/useRealtimeTopic.ts",
      "packages/dms/frontend-vue/layers/dms-core/app/composables/auth/useApiData.ts",
      "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/live/usePageDataRefresh.ts",
      "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/live/currentPageLive.ts",
      "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/blocks/useRefreshTriggers.ts",
      "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/tableViewRealtime.ts",
      "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/useTableRows.ts",
      "packages/dms/frontend-vue/layers/dms-ui/app/build/composables/table-view/useTableListData.ts",
      "packages/dms/frontend-vue/layers/dms-layout/app/pages/[...slug].vue",
    ],
    files: [".agents/skills/formal-realtime-tabs/**"],
    command: [
      "node",
      ".agents/skills/formal-realtime-tabs/check.mjs",
      "--full",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-route-patterns",
    covers: [
      "packages/dms/src/mockup/model.ts",
      "packages/dms/frontend-vue/layers/dms-ui/app/build/utils/mockup.ts",
      "packages/dms/frontend-vue/layers/dms-ui/app/build/utils/urlVariables.ts",
    ],
    files: [
      ".agents/skills/formal-route-patterns/**",
      ".agents/formal/run-properties.cts",
    ],
    command: [
      "node",
      ".agents/skills/formal-route-patterns/check.mjs",
      "--full",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-option-patch-prune",
    covers: [
      "packages/dms/src/implementations/dms-builder/engine/options-patch.ts",
      "packages/dms/src/implementations/dms-builder/engine/local-bindings.ts",
      "packages/dms/src/implementations/dms-builder/engine/writable.ts",
    ],
    files: [
      ".agents/skills/formal-option-patch-prune/**",
      ".agents/formal/run-properties.cts",
    ],
    command: [
      "node",
      ".agents/skills/formal-option-patch-prune/check.mjs",
      "--full",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-theme-logo-orphans",
    covers: [
      "packages/dms/src/implementations/dms-builder/engine/theme.ts",
      "packages/dms/src/implementations/dms-builder/engine/theme-assets.ts",
      "packages/dms/src/implementations/dms-builder/engine/theme-app-config.ts",
      "packages/dms/src/implementations/dms-builder/engine/theme-config-imports.ts",
      "packages/dms/src/implementations/dms-builder/engine/theme-literals.ts",
    ],
    files: [
      ".agents/skills/formal-theme-logo-orphans/**",
      "packages/dms/src/test/unit/builder/theme-logo-orphans.formal.test.ts",
      "packages/dms/src/test/unit/builder/helpers/logo-spellings.ts",
    ],
    command: ["node", ".agents/skills/formal-theme-logo-orphans/check.mjs"],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-ai-answers-no-row-values",
    covers: [
      "packages/dms/src/mcp/tool.ts",
      "packages/dms/src/mcp/hidden-values.ts",
      "packages/dms/src/mcp/redact.ts",
      "packages/dms/src/mcp/page-verify/redact-report.ts",
      "packages/dms/src/mcp/tools/index.ts",
      "packages/dms/src/mcp/tools/builder-shared.ts",
      "packages/dms/src/mcp/tools/builder-pages.ts",
      "packages/dms/src/mcp/tools/builder-resources.ts",
      "packages/dms/src/mcp/tools/builder-compose.ts",
      "packages/dms/src/mcp/tools/builder-project.ts",
      "packages/dms/src/mcp/tools/builder-queries.ts",
      "packages/dms/src/mcp/tools/builder-table-view.ts",
      "packages/dms/src/mcp/tools/database.ts",
      "packages/dms/src/mcp/tools/page-verify.ts",
      "packages/dms/src/implementations/dms-builder/engine/mapped-modules.ts",
    ],
    files: [
      ".agents/skills/formal-ai-answers-no-row-values/**",
      ".agents/formal/generated-check.mjs",
      "packages/dms/src/test/formal/ai-answers-no-row-values.test.ts",
      "packages/dms/src/test/formal/helpers/**",
    ],
    command: [
      "node",
      ".agents/skills/formal-ai-answers-no-row-values/check.mjs",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-block-writes-judge-request-targets",
    covers: [
      "packages/dms/src/mcp/tools/builder-request-targets.ts",
      "packages/dms/src/mcp/tools/builder-pages.ts",
      "packages/dms/src/mcp/tools/builder-compose.ts",
      "packages/dms/src/mcp/tools/mockup-apply-to-page.ts",
      "packages/dms/src/mcp/tools/index.ts",
      "packages/dms/src/mockup/apply-to-page.ts",
      "packages/dms/src/implementations/dms-builder/engine/configure-target.ts",
    ],
    files: [
      ".agents/skills/formal-block-writes-judge-request-targets/**",
      ".agents/formal/generated-check.mjs",
      "packages/dms/src/test/formal/block-writes-judge-request-targets.test.ts",
      "packages/dms/src/test/formal/helpers/**",
    ],
    command: [
      "node",
      ".agents/skills/formal-block-writes-judge-request-targets/check.mjs",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-builder-option-echo",
    covers: [
      "packages/dms/src/implementations/dms-builder/engine/config-literal.ts",
      "packages/dms/src/implementations/dms-builder/engine/held-value.ts",
      "packages/dms/src/implementations/dms-builder/engine/literal-overrides.ts",
      "packages/dms/src/implementations/dms-builder/engine/local-bindings.ts",
      "packages/dms/src/implementations/dms-builder/engine/ops-categories.ts",
      "packages/dms/src/implementations/dms-builder/engine/ops.ts",
      "packages/dms/src/implementations/dms-builder/engine/options-patch.ts",
      "packages/dms/src/implementations/dms-builder/engine/page-draft.ts",
      "packages/dms/src/implementations/dms-builder/engine/page-structure.ts",
    ],
    files: [
      ".agents/skills/formal-builder-option-echo/**",
      "packages/dms/src/test/unit/builder/builder-option-echo.formal.test.ts",
      "packages/dms/src/test/unit/builder/helpers/option-spellings.ts",
    ],
    command: ["node", ".agents/skills/formal-builder-option-echo/check.mjs"],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
  {
    name: "formal-invite-creation",
    covers: [
      "packages/interface-dms/src/invites.ts",
      "packages/interface-dms/src/invite-resolution.ts",
      "packages/interface-dms/src/internal/invite-resolution.ts",
      "packages/interface-dms/src/internal/invite-replacement.ts",
      "packages/interface-dms/src/internal/invite-content.ts",
      "packages/interface-dms/src/internal/invite-handout.ts",
      "packages/interface-dms/src/db/internal/inviteResolutions.model.ts",
      "packages/interface-dms/src/db/models/user_invites.model.ts",
      "packages/interface-dms/src/db/tables/user_invites.table.ts",
      "packages/interface-dms/src/db/tables/inviteResolutions.table.ts",
    ],
    files: [".agents/skills/formal-invite-creation/**"],
    command: [
      "node",
      ".agents/skills/formal-invite-creation/check.mjs",
      "--full",
    ],
    violation: /^(?:finding|BROKEN|CHANGED|HOLDS) +(\w+)/gm,
  },
];
