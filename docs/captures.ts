import { defineScenes } from "@antelopejs/tooling-configs/capture";

/**
 * The screenshots of the DMS docs, taken on the Helio demo. The onboarding
 * runs first and creates the administrator every other scene signs in as,
 * except the signed-out sign-in page.
 */
export default defineScenes([
  {
    id: "onboarding",
    route: "/onboarding?token=helio-capture-setup-token",
    setup: true,
    steps: [
      { action: "fill", selector: 'input[name="name"]', value: "Helio" },
      {
        action: "click",
        selector: 'button:has-text("Continue to administrator")',
      },
      { action: "wait", selector: 'input[name="firstName"]' },
      { action: "fill", selector: 'input[name="firstName"]', value: "Sophie" },
      { action: "fill", selector: 'input[name="lastName"]', value: "Lambert" },
      {
        action: "fill",
        selector: 'input[name="email"]',
        value: "sophie.lambert@helio.be",
      },
      {
        action: "fill",
        selector: 'input[name="password"]',
        value: "HelioDocs2026!",
      },
      {
        action: "click",
        selector: 'button:has-text("Create administrator account")',
      },
      { action: "wait", selector: 'button:has-text("Open the dashboard")' },
      { action: "click", selector: 'button:has-text("Open the dashboard")' },
      { action: "click", selector: 'button:has-text("Not now")' },
    ],
  },
  {
    id: "helio-dashboard",
    route: "/helio/dashboard",
    steps: [{ action: "wait", selector: ".apexcharts-canvas" }],
    output: "packages/dms/docs/images/captures/helio-dashboard.webp",
  },
  {
    id: "demo-home",
    route: "/home",
    output: "packages/dms/docs/images/captures/demo-home.webp",
  },
  {
    id: "command-palette",
    route: "/helio/dashboard",
    steps: [
      { action: "wait", selector: ".apexcharts-canvas" },
      { action: "press", key: "Control+k" },
      { action: "wait", selector: '[role="dialog"] input' },
    ],
    crop: '[role="dialog"]',
    output: "packages/dms/docs/images/captures/command-palette.webp",
  },
  {
    id: "settings-overview",
    route: "/settings",
    output: "packages/dms/docs/images/captures/settings-overview.webp",
  },
  {
    id: "modules-page",
    route: "/modules",
    output: "packages/dms/docs/images/captures/modules-page.webp",
  },
  {
    id: "workspace-billing",
    route: "/settings/workspace/billing",
    output: "packages/dms/docs/images/captures/workspace-billing.webp",
  },
  {
    id: "security",
    route: "/settings/user/security",
    output: "packages/dms/docs/images/captures/security.webp",
  },
  {
    id: "two-factor-methods",
    route: "/settings/user/security",
    steps: [
      { action: "click", selector: 'button:has-text("Add method")' },
      { action: "wait", selector: 'text="Email verification"' },
    ],
    output: "packages/dms/docs/images/captures/two-factor-methods.webp",
  },
  {
    id: "notification-bell",
    route: "/helio/dashboard",
    steps: [
      { action: "click", selector: 'button[aria-label="Notifications"]' },
      { action: "wait", selector: 'text="View all notifications"' },
    ],
    output: "packages/dms/docs/images/captures/notification-bell.webp",
  },
  {
    id: "notification-preferences",
    route: "/settings/user/notifications",
    steps: [
      {
        action: "click",
        selector: 'button[aria-label="Show System notifications"]',
      },
    ],
    output: "packages/dms/docs/images/captures/notification-preferences.webp",
  },
  {
    id: "role-editor",
    route: "/settings/workspace/roles",
    steps: [
      { action: "click", selector: 'button:has-text("New role")' },
      {
        action: "fill",
        selector: 'input[placeholder="e.g. Support"]',
        value: "Office",
      },
      {
        action: "fill",
        selector: 'input[placeholder="What members with this role do"]',
        value: "Quotes, invoices and customer records",
      },
      {
        action: "fill",
        selector: 'input[placeholder^="Search permissions"]',
        value: "Invoices",
      },
    ],
    output: "packages/dms/docs/images/captures/role-editor.webp",
  },
  {
    id: "invite-members",
    route: "/settings/workspace/members",
    steps: [
      { action: "click", selector: 'button:has-text("Invite members")' },
      {
        action: "fill",
        selector: 'input[placeholder="Add addresses, separated with a comma"]',
        value: "julie.renard@helio.be",
      },
    ],
    output: "packages/dms/docs/images/captures/invite-members.webp",
  },
  {
    id: "workspace-switcher",
    route: "/helio/dashboard",
    steps: [
      { action: "click", selector: 'button[aria-label="Switch workspace"]' },
      { action: "wait", selector: 'text="Create workspace"' },
    ],
    output: "packages/dms/docs/images/captures/workspace-switcher.webp",
  },
  {
    id: "workspace-members",
    route: "/settings/workspace/members",
    output: "packages/dms/docs/images/captures/workspace-members.webp",
  },
  {
    id: "periods-this-month",
    route: "/helio/dashboard?helio.period=this-month",
    viewport: { width: 1440, height: 664 },
    steps: [{ action: "wait", selector: ".apexcharts-canvas" }],
    output: "packages/dms/docs/images/captures/periods-this-month.webp",
  },
  {
    id: "periods-last-30-days",
    route: "/helio/dashboard?helio.period=last-30-days",
    viewport: { width: 1440, height: 664 },
    steps: [{ action: "wait", selector: ".apexcharts-canvas" }],
    output: "packages/dms/docs/images/captures/periods-last-30-days.webp",
  },
  {
    id: "sign-in",
    route: "/helio/dashboard",
    signedOut: true,
    steps: [{ action: "wait", selector: 'input[name="email"]' }],
    output: "packages/dms/docs/images/captures/sign-in.webp",
  },
  {
    id: "pricing",
    route: "/pricing",
    output: "packages/dms/docs/images/captures/pricing.webp",
  },
]);
