import { expect, test } from "@antelopejs/dms/e2e";
import { isTaskRow, listOf } from "./rows.mjs";

const ARCHIVE_PAGE = "/table-view/table-view-archive";
const TASKS_API = "/api/tasks/archive-mode";
const ACTIVE = "&showArchived=false";
const ARCHIVED = "&showArchived=true";
const TASK_EMAIL = "bob.brown@example.com";

test("a user archives a task so it leaves the list and shows under the archive, then restores it back into the list", async ({
  adminPage,
  dms,
}) => {
  const taskRow = adminPage.getByRole("row", { name: /^Task 4 / });
  const archiveToggle = adminPage.getByRole("button", { name: /^Archived?$/ });
  const showOnlyTask = async () => {
    await adminPage.getByRole("button", { name: "Open search" }).click();
    await adminPage.getByRole("textbox", { name: "Search" }).fill(TASK_EMAIL);
  };
  const apiTask = async (scope: string) => {
    const list = await dms.api(`list tasks ${scope}`, {
      method: "GET",
      path: `${TASKS_API}/list?limit=500${scope}`,
    });
    return listOf(list.body, isTaskRow).find((task) => task._id === "4");
  };

  await adminPage.goto(ARCHIVE_PAGE);
  await showOnlyTask();
  await expect(taskRow).toBeVisible();
  await taskRow.getByRole("button", { name: "Actions for Task 4" }).click();
  await adminPage.getByRole("menuitem", { name: "Archive" }).click();
  await adminPage
    .getByRole("dialog", { name: "Archive this item?" })
    .getByRole("button", { name: "Archive" })
    .click();
  await expect(
    adminPage.getByText("1 item archived", { exact: true }),
  ).toBeVisible();
  await expect(taskRow).toBeHidden();

  await adminPage.reload();
  await showOnlyTask();
  await expect(taskRow).toBeHidden();
  expect(await apiTask(ACTIVE)).toBeUndefined();
  expect((await apiTask(ARCHIVED))?.isArchived).toBe(true);

  await archiveToggle.click();
  await expect(adminPage.getByText("Viewing archived items.")).toBeVisible();
  await expect(taskRow).toBeVisible();
  await taskRow.getByRole("button", { name: "Restore" }).click();
  await expect(
    adminPage.getByText("1 item restored", { exact: true }),
  ).toBeVisible();
  await expect(taskRow).toBeHidden();

  await adminPage.reload();
  await showOnlyTask();
  await expect(taskRow).toBeVisible();
  expect((await apiTask(ACTIVE))?.isArchived ?? false).toBe(false);
  expect(await apiTask(ARCHIVED)).toBeUndefined();
});
