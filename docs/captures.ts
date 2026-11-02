import { defineScenes } from "@antelopejs/tooling-configs/capture";

/**
 * The screenshots of the DMS docs, taken on the Helio demo. The onboarding
 * runs first and creates the administrator every other scene signs in as.
 */
export default defineScenes([
  {
    id: "onboarding",
    route: "/onboarding",
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
]);
