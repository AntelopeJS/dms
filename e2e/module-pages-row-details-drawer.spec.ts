import { expect, test } from "@antelopejs/dms/e2e";

const VIEWS_PAGE = "/table-view/table-view-views";
const RUN = "Sync paid invoices to ERP";
const RUN_CODE = "run_8f3a2c";

test("a user opens a run's details drawer by double-clicking its row, reloads to find it open on the same run, and inspects it in the side sheet", async ({
  adminPage,
}) => {
  const drawer = adminPage.getByRole("dialog", { name: "Run details" });
  const runRow = adminPage.getByRole("row", { name: new RegExp(RUN_CODE) });
  const runName = drawer.getByRole("heading", { name: RUN, level: 3 });

  await adminPage.goto(VIEWS_PAGE);
  await runRow.getByRole("cell", { name: RUN }).first().dblclick();
  await expect(runName).toBeVisible();
  await expect(adminPage).toHaveURL(/runs\.record=run-1/);

  await adminPage.reload();
  await expect(runName).toBeVisible();
  await expect(adminPage).toHaveURL(/runs\.record=run-1/);

  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();
  await expect(adminPage).not.toHaveURL(/runs\.record=/);

  await runRow.getByRole("button", { name: `Actions for ${RUN}` }).click();
  await adminPage
    .getByRole("menuitem", { name: "Inspect in side sheet" })
    .click();
  await expect(runName).toBeVisible();
});
