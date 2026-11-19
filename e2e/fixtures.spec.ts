import { expect, test } from "@antelopejs/dms/e2e";

test("the administrator opens the members page on a fresh database", async ({
  adminPage,
}) => {
  await adminPage.goto("/settings/workspace/members");
  await expect(
    adminPage.getByRole("heading", { name: "Members", exact: true }),
  ).toBeVisible();
});
