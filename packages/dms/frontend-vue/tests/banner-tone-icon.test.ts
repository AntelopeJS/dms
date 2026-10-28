/** @vitest-environment jsdom */
/**
 * A DmsBanner given no icon shows its tone's, as the Banner block does: a
 * check on success, an "i" on info. An icon given wins.
 */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, expect, it } from "vitest";

const { default: DmsBanner } = await import(
  "../layers/dms-ui/app/components/banner/Banner.vue"
);

const UAlert = defineComponent({
  setup:
    (_props, { slots }) =>
    () =>
      h("div", [slots.leading?.()]),
});

let app: App | undefined;

afterEach(() => app?.unmount());

function iconOf(
  props: Partial<InstanceType<typeof DmsBanner>["$props"]>,
): string | null {
  const host = document.createElement("div");
  app = createApp({
    render: () => h(DmsBanner, { title: "Notice", ...props }),
  });
  app.component("UAlert", UAlert);
  app.component(
    "UIcon",
    defineComponent({
      props: { name: String },
      setup: (props) => () => h("i", { "data-icon": props.name }),
    }),
  );
  app.mount(host);
  return host.querySelector("[data-icon]")?.getAttribute("data-icon") ?? null;
}

it.each<
  [NonNullable<InstanceType<typeof DmsBanner>["$props"]["tone"]>, string]
>([
  ["warning", "i-ph-warning"],
  ["success", "i-ph-check-circle"],
  ["info", "i-ph-info"],
  ["error", "i-ph-warning-circle"],
  ["primary", "i-ph-sparkle"],
])("shows the %s tone's icon when given none", (tone, icon) => {
  expect(iconOf({ tone })).toBe(icon);
});

it("keeps the warning icon of its default tone", () => {
  expect(iconOf({})).toBe("i-ph-warning");
});

it("shows the icon it is given whatever the tone", () => {
  expect(iconOf({ tone: "success", icon: "i-ph-rocket" })).toBe("i-ph-rocket");
});
