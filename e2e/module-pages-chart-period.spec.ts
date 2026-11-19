import { expect, test } from "@antelopejs/dms/e2e";

test("a user picks a period on the chart page, which the URL and a reload keep and the Ops Metrics page remembers", async ({
  adminPage,
}) => {
  const presets = adminPage
    .getByRole("radiogroup", { name: "Preset" })
    .filter({ has: adminPage.getByRole("radio", { name: "All time" }) });

  await adminPage.goto("/charts/chart-period");
  await expect(
    presets.getByRole("radio", { name: "Last 24 hours" }),
  ).toBeChecked();
  await presets.getByRole("radio", { name: "Last 7 days" }).click();
  await expect(adminPage).toHaveURL(/period-ops\.period=last-7-days/);
  await expect(
    presets.getByRole("radio", { name: "Last 7 days" }),
  ).toBeChecked();

  await adminPage.reload();
  await expect(adminPage).toHaveURL(/period-ops\.period=last-7-days/);
  await expect(
    presets.getByRole("radio", { name: "Last 7 days" }),
  ).toBeChecked();

  await adminPage.goto("/charts/chart-metrics");
  await expect(
    adminPage
      .getByRole("radiogroup", { name: "Preset" })
      .getByRole("radio", { name: "Last 7 days" }),
  ).toBeChecked();
});
