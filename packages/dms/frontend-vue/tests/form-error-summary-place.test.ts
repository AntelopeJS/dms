// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { button, host, mountForm, t } from "./helpers/form-runtime";

it("rejects a public form whose summary cannot focus its field or keeps errors after the last fix", async () => {
  await mountForm({
    sections: [{ id: "contact", label: "Contact", fieldIds: ["name"] }],
  });
  button("Reject submit").click();
  await nextTick();
  const link = host.querySelector<HTMLAnchorElement>('[role="alert"] a');
  expect(link?.textContent).toContain("Name");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Contact",
  );
  expect(link?.getAttribute("href")).toBe("#name");
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(host.querySelector("input")),
  );
  button("Fix errors").focus();
  expect(document.activeElement).toBe(button("Fix errors"));
  link?.click();
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(host.querySelector("input")),
  );
  button("Fix errors").click();
  await nextTick();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    t("dms.form.error_summary.resolved"),
  );
  expect(host.querySelector('[role="status"] a')).toBeNull();
});
