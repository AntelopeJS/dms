import { expect, test } from "@antelopejs/dms/e2e";
import { isInviteRow, listOf, requiredStringIn } from "./rows.mjs";

const ROLES_API = "/dms/pages/settings/workspace/roles/create";

test("an administrator invites a member from the header's Quick actions menu, and the invitation keeps its role", async ({
  adminPage,
  dms,
}) => {
  const roleName = dms.unique("Support");
  const created = await dms.api("create the role the invitee gets", {
    method: "POST",
    path: ROLES_API,
    body: { name: roleName, description: "", permissions: [] },
  });
  expect(created.status).toBe(200);
  const email = dms.email("quick");

  await adminPage.goto("/settings");
  await adminPage.getByRole("button", { name: "Quick actions" }).click();
  await adminPage.getByRole("menuitem", { name: "Invite a member" }).click();
  await adminPage.getByRole("textbox", { name: "Email addresses" }).fill(email);
  await adminPage
    .getByRole("textbox", { name: "Email addresses" })
    .press("Enter");
  await adminPage.getByRole("combobox", { name: "Team" }).click();
  await adminPage.getByRole("option", { name: "Sales" }).click();
  await adminPage
    .getByRole("group", { name: "Roles" })
    .getByRole("button", { name: roleName, exact: true })
    .click();
  await adminPage.getByRole("button", { name: "Send invitations" }).click();
  await expect(adminPage).toHaveURL(/\/settings\/workspace\/invites$/);

  await adminPage.reload();
  await expect(adminPage.getByRole("cell", { name: email })).toBeVisible();

  const list = await dms.api("list the invitations", {
    method: "GET",
    path: "/api/tables/admin-invites/list",
  });
  const invite = listOf(list.body, isInviteRow).find(
    (row) => row.email === email,
  );
  expect(invite?.roles_ids?.map((role) => role._id)).toEqual([
    requiredStringIn(created.body, "id"),
  ]);
  expect(invite?.asTenantOwner ?? false).toBe(false);
});
