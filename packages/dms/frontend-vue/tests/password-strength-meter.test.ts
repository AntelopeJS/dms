// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { createApp, defineComponent, h, type App } from "vue";
import PasswordStrength from "../layers/dms-ui/app/components/PasswordStrength.vue";

let app: App | undefined;

afterEach(() => app?.unmount());

it("scales the meter to the number of requirements", () => {
  const host = document.createElement("div");
  const strength = Array.from({ length: 5 }, (_, index) => ({
    met: true,
    text: `requirement ${index}`,
  }));

  app = createApp(PasswordStrength, { color: "success", score: 5, strength });
  app.config.globalProperties.$t = (key: string) => key;
  app.component(
    "UProgress",
    defineComponent({
      props: { modelValue: Number, max: Number },
      setup: (props) => () =>
        h("progress", { value: props.modelValue, max: props.max }),
    }),
  );
  app.component("UIcon", defineComponent({ render: () => null }));
  app.mount(host);

  const meter = host.querySelector("progress")!;
  expect(meter.getAttribute("max")).toBe("5");
  expect(meter.getAttribute("value")).toBe("5");
});
