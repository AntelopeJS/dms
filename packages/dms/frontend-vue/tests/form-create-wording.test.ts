/** @vitest-environment jsdom */
import { expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { FormProps } from "../layers/dms-ui/app/composables/form/types/props";
import fr from "../layers/dms-ui/app/entries/i18n/locales/ui-fr-FR.json";
import {
  button,
  host,
  i18n,
  mountForm,
  openPrompt,
  router,
  t,
  typeName,
  unmountForm,
} from "./helpers/form-runtime";

it.each(["en", "fr"] as const)(
  "rejects create forms labeled Save changes or showing change notes in %s",
  async (locale) => {
    i18n.global.locale.value = locale;
    await mountForm({ kind: "create" });
    expect(button(locale === "en" ? "Create" : "Créer")).toBeDefined();
    await typeName();
    expect(host.textContent).not.toContain(t("dms.form.field_notes.changed"));
    unmountForm();
    await mountForm({ kind: "record" });
    await typeName();
    expect(button(t("dms.button.save_changes"))).toBeDefined();
    expect(host.textContent).toContain(t("dms.form.field_notes.changed"));
  },
);

it("rejects Cancel that fails to return to the app page or navigates before discarding", async () => {
  window.history.replaceState({ back: "/list" }, "", "/edit");
  router.back.mockImplementation(() => {
    const visit = new CustomEvent("inertia:before", {
      cancelable: true,
      detail: { visit: { url: new URL("/list", window.location.href) } },
    });
    document.dispatchEvent(visit);
    if (!visit.defaultPrevented) window.history.replaceState({}, "", "/list");
    return !visit.defaultPrevented;
  });
  await mountForm();
  await typeName();
  expect(host.textContent).toContain(t("dms.form.field_notes.changed"));
  button("Cancel").click();
  await nextTick();
  expect(router.back).toHaveBeenCalledOnce();
  expect(window.location.pathname).toBe("/list");
  expect(openPrompt).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(host.querySelector("input")?.value).toBe("Ada");
  expect(host.textContent).not.toContain(t("dms.form.field_notes.changed"));
});

it("rejects Cancel that leaves the app instead of using backTo for an external entry", async () => {
  window.history.replaceState({ back: 42 }, "", "/edit");
  await mountForm({ backTo: "/list" });
  button("Cancel").click();
  expect(router.push).toHaveBeenCalledWith("/list");
  expect(router.back).not.toHaveBeenCalled();
});

it("rejects Cancel that navigates instead of closing its container", async () => {
  const close = vi.fn(async () => {});
  window.history.replaceState({ back: "/list" }, "", "/edit");
  await mountForm({}, close);
  button("Cancel").click();
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(router.back).not.toHaveBeenCalled();
});

it("rejects an offered Cancel when the form has nowhere to leave to", async () => {
  await mountForm();
  expect(
    [...host.querySelectorAll("button")].map((entry) => entry.textContent),
  ).not.toContain("Cancel");
});

it("rejects a form that removes its summary when errors clear instead of when changes are discarded", async () => {
  await mountForm();
  expect(host.querySelector('[role="alert"]')).toBeNull();
  button("Reject submit").click();
  await nextTick();
  expect(host.querySelector('[role="alert"] a')?.textContent).toBe("Name");
  button("Fix errors").click();
  await nextTick();
  expect(host.querySelector('section[role="status"]')?.textContent).toContain(
    t("dms.form.error_summary.resolved"),
  );
  await typeName();
  button(t("dms.save_bar.discard")).click();
  await nextTick();
  expect(host.querySelector('section[role="status"]')).toBeNull();
});

it("rejects hiding an empty read-only field on record forms rather than only create forms", async () => {
  const fields: FormProps["fields"] = [
    { id: "name", component: { componentName: "Text" } },
    {
      id: "openedAt",
      label: "Opened at",
      type: "string",
      disabled: true,
      component: { componentName: "Text" },
    },
  ];
  await mountForm({ kind: "record", fields });
  expect(host.textContent).toContain("Opened at");
  unmountForm();
  await mountForm({ kind: "create", fields });
  expect(host.textContent).not.toContain("Opened at");
});

it("does not mistake Discard for Cancel in French", () => {
  expect(fr.dms.save_bar.discard).not.toBe(fr.dms.button.cancel);
});
