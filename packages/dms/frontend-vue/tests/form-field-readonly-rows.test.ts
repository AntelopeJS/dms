// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { defineComponent, h, type App } from "vue";
import { host, mountForm, unmountForm } from "./helpers/form-runtime";

it.each(["array", "key_value"])(
  "rejects a %s field that collapses nonempty read-only rows to a count",
  async (type) => {
    const Control = defineComponent({
      props: ["modelValue", "disabled"],
      setup: (props) => () =>
        h("textarea", {
          disabled: props.disabled,
          value: JSON.stringify(props.modelValue),
        }),
    });
    vi.stubGlobal("resolveDmsComponent", () => Control);
    const fields = (empty: boolean) => [
      {
        id: "rows",
        type,
        disabled: true,
        component: { componentName: "Rows" },
        defaultValue:
          type === "array"
            ? empty
              ? []
              : ["Ada", "Grace"]
            : empty
              ? {}
              : { first: "Ada", second: "Grace" },
      },
    ];
    const displayEmpty = (app: App) => {
      app.component(
        "DmsDisplay",
        defineComponent({
          setup: () => () => h("span", "Empty"),
        }),
      );
    };
    await mountForm({ fields: fields(false) }, undefined, displayEmpty);
    expect(host.querySelector("textarea")?.disabled).toBe(true);
    expect(host.querySelector("textarea")?.value).toContain("Ada");
    expect(host.querySelector("textarea")?.value).toContain("Grace");
    expect(host.textContent).not.toContain("Empty");
    unmountForm();
    await mountForm({ fields: fields(true) }, undefined, displayEmpty);
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("Empty");
  },
);
