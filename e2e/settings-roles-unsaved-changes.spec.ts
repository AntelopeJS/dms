import { expect, test } from "@antelopejs/dms/e2e";
import { isRoleRow, listOf } from "./rows.mjs";

const ROLES = "/settings/workspace/roles";

test("an administrator who leaves the role editor with unsaved changes can keep editing, or discard them so the role is stored unchanged", async ({
  adminPage,
  dms,
}) => {
  const name = dms.unique("Support");
  const created = await dms.api("create a role without permissions", {
    method: "POST",
    path: "/dms/pages/settings/workspace/roles/create",
    body: { name, description: "", permissions: [] },
  });
  expect(created.status).toBe(200);
  const stored = async () => {
    const list = await dms.api("read the stored role", {
      method: "GET",
      path: "/api/tables/roles/list",
    });
    return listOf(list.body, isRoleRow).find((role) => role.name === name)
      ?.permissions;
  };
  const leaveDialog = adminPage.getByRole("dialog", {
    name: "Discard unsaved changes?",
  });
  const exportReports = adminPage.getByRole("checkbox", {
    name: "Export reports",
    exact: true,
  });

  await adminPage.goto(ROLES);
  await adminPage.getByRole("option", { name: new RegExp(`^${name}`) }).click();
  await exportReports.click();
  await expect(adminPage.getByText("1 of 1259 selected")).toBeVisible();

  await adminPage.getByRole("link", { name: "Members", exact: true }).click();
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(leaveDialog).toBeHidden();
  await expect(adminPage).toHaveURL(new RegExp(`${ROLES}$`));
  await expect(exportReports).toBeChecked();

  await adminPage.getByRole("link", { name: "Members", exact: true }).click();
  await leaveDialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(adminPage).toHaveURL(/\/settings\/workspace\/members$/);

  await adminPage.goto(ROLES);
  await adminPage.getByRole("option", { name: new RegExp(`^${name}`) }).click();
  await expect(adminPage.getByText("0 of 1259 selected")).toBeVisible();
  await expect(exportReports).not.toBeChecked();
  expect(await stored()).toEqual([]);
});
