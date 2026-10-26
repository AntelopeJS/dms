// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { host, mountForm, unmountForm } from "./helpers/form-runtime";

describe("a create form", () => {
  it("leaves out a read-only field that holds nothing yet", async () => {
    await mountForm({
      kind: "create",
      fields: [
        {
          id: "openedAt",
          label: "Opened at",
          component: { componentName: "Text" },
          disabled: true,
        },
        {
          id: "closedAt",
          label: "Closed at",
          component: { componentName: "Text" },
          readonly: true,
          defaultValue: "",
        },
      ],
    });
    expect(host.textContent).not.toContain("Opened at");
    expect(host.textContent).not.toContain("Closed at");
  });

  it("shows it once it holds a value, or when it asks to", async () => {
    await mountForm({
      kind: "create",
      fields: [
        {
          id: "openedAt",
          label: "Opened at",
          type: "string",
          component: { componentName: "Text" },
          disabled: true,
          defaultValue: "2026-10-20",
        },
        {
          id: "closedAt",
          label: "Closed at",
          component: { componentName: "Text" },
          disabled: true,
          showEmptyOnCreate: true,
        },
      ],
    });
    expect(host.textContent).toContain("Opened at");
    expect(host.textContent).toContain("2026-10-20");
    expect(host.textContent).toContain("Closed at");
  });

  it("keeps every field that can be filled", async () => {
    await mountForm({
      kind: "create",
      fields: [
        {
          id: "openedAt",
          label: "Opened at",
          component: { componentName: "Text" },
        },
      ],
    });
    expect(host.querySelector("input")).not.toBeNull();
    expect(host.textContent).toContain("Opened at");
  });
});

it("rejects read-only rows that show editing hints or descriptions, including grouped rows", async () => {
  const field = {
    id: "name",
    type: "string",
    label: "Name",
    description: "Choose a name",
    hint: "Type here",
    defaultValue: "Ada",
    component: { componentName: "Text" },
  };
  const Field = defineComponent({
    props: ["help"],
    setup:
      (props, { slots }) =>
      () =>
        h("div", [props.help, slots.default?.()]),
  });
  for (const disabled of [false, true]) {
    await mountForm(
      {
        fields: [
          { ...field, disabled },
          {
            id: "group",
            description: "Group instructions",
            fields: [{ ...field, id: "other", disabled }],
          },
        ],
      },
      undefined,
      (app) => {
        app.component("UFormField", Field);
      },
    );
    if (disabled) expect(host.textContent).toContain("Ada");
    else expect(host.querySelector("input")?.value).toBe("Ada");
    for (const text of ["Type here", "Choose a name", "Group instructions"]) {
      if (disabled) expect(host.textContent).not.toContain(text);
      else expect(host.textContent).toContain(text);
    }
    if (disabled) expect(host.querySelector("input")).toBeNull();
    unmountForm();
  }
});
