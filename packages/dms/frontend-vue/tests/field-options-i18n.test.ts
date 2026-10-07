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

  it("leaves a field without options as it is", () => {
    const field = { id: "f", component: {} };
    expect(processFieldI18n(field, translate)).toBe(field);
  });
});
