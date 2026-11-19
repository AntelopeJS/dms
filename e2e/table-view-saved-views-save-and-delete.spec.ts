import { expect, test } from "@antelopejs/dms/e2e";

const VIEWS_PAGE = "/table-view/table-view-views";

test("a user saves the Failing filter as a named view, finds it after a reload and in a second tab, reopens it, and deletes it", async ({
  adminPage,
  dms,
}) => {
  const name = dms.unique("My failures");
  const strip = adminPage.getByRole("toolbar", { name: "Views" });
  const saved = strip.getByRole("button", { name: new RegExp(`^${name}`) });

  await adminPage.goto(VIEWS_PAGE);
  await strip.getByRole("button", { name: /^Failing/ }).click();
  await expect(
    adminPage.getByRole("heading", { name: "Job runs 1" }),
  ).toBeVisible();
  await strip.getByRole("button", { name: "Save current view" }).click();
  await adminPage.getByRole("textbox", { name: "Name" }).fill(name);
  await adminPage.getByRole("button", { name: "Save view" }).click();
  await expect(saved).toHaveAttribute("aria-pressed", "true");

  await adminPage.reload();
  await expect(saved).toBeVisible();

  const second = await adminPage.context().newPage();
  await second.goto(VIEWS_PAGE);
  await expect(
    second
      .getByRole("toolbar", { name: "Views" })
      .getByRole("button", { name: new RegExp(`^${name}`) }),
  ).toBeVisible();
  await second.close();

  await strip.getByRole("button", { name: "All runs" }).click();
  await expect(
    adminPage.getByRole("heading", { name: "Job runs 32" }),
  ).toBeVisible();
  await saved.click();
  await expect(
    adminPage.getByRole("heading", { name: "Job runs 1" }),
  ).toBeVisible();
  await expect(
    adminPage
      .getByRole("table", { name: "Job runs" })
      .getByRole("row", { name: /Sync paid invoices to ERP/ }),
  ).toHaveCount(1);

  await strip.getByRole("button", { name: "Delete view" }).click();
  await adminPage
    .getByRole("dialog", { name: "Delete this view?" })
    .getByRole("button", { name: "Delete view" })
    .click();
  await expect(saved).toBeHidden();
  await adminPage.reload();
  await expect(strip.getByRole("button", { name: /^Failing/ })).toBeVisible();
  await expect(saved).toBeHidden();
});
