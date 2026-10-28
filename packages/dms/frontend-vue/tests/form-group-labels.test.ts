/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormField } from "../layers/dms-ui/app/composables/form/types/field";
import { host, mountForm } from "./helpers/form-runtime";

const field = (id: string, label?: string): FormField => {
  const result: FormField = {
    id,
    label,
    required: id === "street",
    component: { componentName: "input" },
  };
  if (id === "hidden") {
    result.visibleWhen = { field: "showHidden", in: [true] };
  }
  return result;
};

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim();

beforeEach(() => {
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) =>
      value.startsWith("$") ? `t(${value})` : value,
  }));
});

describe("a field group", () => {
  it("heads its cluster and labels each member's control", async () => {
    await mountForm({
      fields: [
        {
          id: "address",
          label: "Address",
          fields: [field("street", "$street"), field("city", "City")],
        },
      ],
    });
    const labels = [...host.querySelectorAll("label")];
    expect(labels.map((label) => [label.htmlFor, text(label)])).toEqual([
      ["street", "t($street) *"],
      ["city", "City"],
    ]);
    for (const label of labels) {
      expect(host.querySelector(`#${label.htmlFor}`)?.tagName).toBe("INPUT");
    }
    expect(text(host)).toMatch(/^Address \*/);
  });

  it("leaves a member without a label bare, and drops a hidden one", async () => {
    await mountForm({
      fields: [
        {
          id: "contact",
          label: "Contact",
          fields: [
            field("email"),
            field("hidden", "Hidden"),
            field("phone", "Phone"),
          ],
        },
      ],
    });
    expect(
      [...host.querySelectorAll("label")].map((label) => text(label)),
    ).toEqual(["Phone"]);
    expect(host.querySelectorAll("input")).toHaveLength(2);
  });
});
