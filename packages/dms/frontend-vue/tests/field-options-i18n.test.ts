import { describe, expect, it } from "vitest";
import { processFieldI18n } from "../layers/dms-ui/app/build/utils/fieldOptionsI18n";

const translate = (key: string) => (key.startsWith("$") ? `t(${key})` : key);

describe("processFieldI18n", () => {
  it("translates the texts of the options, their items and columns", () => {
    const field = processFieldI18n(
      {
        id: "f",
        component: {
          componentName: "dms-repeater",
          options: {
            placeholder: "$p",
            label: "$l",
            description: "plain",
            addLabel: "$add",
            items: [{ label: "$a", description: "$d", value: 1 }],
            columns: [{ id: "name", label: "$name" }],
            min: 1,
          },
        },
      },
      translate,
    );
    expect(field.component.options).toEqual({
      placeholder: "t($p)",
      label: "t($l)",
      description: "plain",
      addLabel: "t($add)",
      items: [{ label: "t($a)", description: "t($d)", value: 1 }],
      columns: [{ id: "name", label: "t($name)" }],
      min: 1,
    });
  });

  it("translates the fields nested in repeater columns and key-value values", () => {
    const select = (label: string) => ({
      componentName: "dms-select",
      options: { placeholder: "$pick", items: [{ label, value: "a" }] },
    });
    const field = processFieldI18n(
      {
        id: "f",
        component: {
          componentName: "dms-repeater",
          options: {
            columns: [
              {
                id: "channel",
                label: "$channel",
                component: select("$x.y"),
              },
              {
                id: "headers",
                component: {
                  componentName: "dms-key-value",
                  options: {
                    keyLabel: "$key",
                    value: { type: "select", component: select("$x.z") },
                  },
                },
              },
            ],
          },
        },
      },
      translate,
    );
    expect(field.component.options).toEqual({
      columns: [
        {
          id: "channel",
          label: "t($channel)",
          component: {
            componentName: "dms-select",
            options: {
              placeholder: "t($pick)",
              items: [{ label: "t($x.y)", value: "a" }],
            },
          },
        },
        {
          id: "headers",
          component: {
            componentName: "dms-key-value",
            options: {
              keyLabel: "t($key)",
              value: {
                type: "select",
                component: {
                  componentName: "dms-select",
                  options: {
                    placeholder: "t($pick)",
                    items: [{ label: "t($x.z)", value: "a" }],
                  },
                },
              },
            },
          },
        },
      ],
    });
  });

  it("leaves a field without options as it is", () => {
    const field = { id: "f", component: {} };
    expect(processFieldI18n(field, translate)).toBe(field);
  });
});
