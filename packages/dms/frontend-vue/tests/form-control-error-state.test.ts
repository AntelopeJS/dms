// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type App,
  type Component,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  ref,
  watch,
} from "vue";
import {
  formBusInjectionKey,
  formFieldInjectionKey,
  useFormField,
} from "@nuxt/ui/composables/useFormField";

vi.mock(
  "../layers/dms-core/app/composables/user/useUserRegionalPreferences",
  () => ({ useUserRegionalPreferences: () => ({ weekStartsOn: ref(1) }) }),
);

// The field UFormField would provide: its error drives the control's state.
const fieldError = ref<string | undefined>();
const formEvents: Array<{ type: string; name: string }> = [];

let app: App | undefined;
let host: HTMLDivElement;

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

// Renders its props as attributes, so the test reads what the control passed.
const passThrough = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () =>
        h(
          tag,
          Object.fromEntries(
            Object.entries(attrs).map(([key, value]) => [
              key,
              typeof value === "object" && !Array.isArray(value)
                ? JSON.stringify(value)
                : value,
            ]),
          ),
          [slots.default?.(), slots.content?.()],
        );
    },
  });

async function mountInField(
  control: Component,
  props: Record<string, unknown> = {},
): Promise<void> {
  const Field = defineComponent({
    setup() {
      provide(
        formFieldInjectionKey,
        computed(() => ({
          name: "field",
          error: fieldError.value,
          ariaId: "field-aria",
        })) as never,
      );
      provide(formBusInjectionKey, {
        emit: (event: { type: string; name: string }) => formEvents.push(event),
      } as never);
      return () => h(control, { id: "field", ...props });
    },
  });
  app = createApp(Field);
  app.component("UPopover", passThrough("div"));
  app.component("UButton", passThrough("button"));
  app.component("UCalendar", passThrough("div"));
  app.component("UInput", passThrough("input"));
  app.mount(host);
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useFormField", useFormField);
  vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
  vi.stubGlobal(
    "isObject",
    (value: unknown) => typeof value === "object" && value !== null,
  );
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en-GB"),
  }));
  fieldError.value = undefined;
  formEvents.length = 0;
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("marks the date picker trigger invalid and describes it by the error", async () => {
  const { default: DatePicker } = await import(
    "../layers/dms-ui/app/components/form/components/DatePicker.vue"
  );
  await mountInField(DatePicker);
  const trigger = () => host.querySelector("button")!;

  expect(trigger().getAttribute("aria-invalid")).not.toBe("true");
  expect(trigger().getAttribute("class")).not.toContain("ring-error");

  fieldError.value = "This field is required.";
  await flush();

  expect(trigger().id).toBe("field");
  expect(trigger().getAttribute("aria-invalid")).toBe("true");
  expect(trigger().getAttribute("aria-describedby")).toBe("field-aria-error");
  expect(trigger().getAttribute("class")).toContain("ring-error");
});

it("keeps the date bounds on the calendar", async () => {
  const { default: DatePicker } = await import(
    "../layers/dms-ui/app/components/form/components/DatePicker.vue"
  );
  await mountInField(DatePicker, {
    minDate: "2026-01-01",
    maxDate: "2026-12-31",
  });
  const calendar = host.querySelector("[min-value]")!;

  expect(calendar.getAttribute("min-value")).toContain("2026");
  expect(calendar.getAttribute("max-value")).toContain("2026");
});

it("marks the colour field invalid on both its swatch and its input", async () => {
  const { default: InputColor } = await import(
    "../layers/dms-ui/app/components/form/components/InputColor.vue"
  );
  await mountInField(InputColor);
  const swatch = () => host.querySelector("label")!;
  const input = () => host.querySelector("input:not([type=color])")!;

  expect(swatch().className).toContain("border-accented");

  fieldError.value = "This field is required.";
  await flush();

  expect(swatch().className).toContain("border-error");
  expect(swatch().className).not.toContain("border-accented");
  expect(input().getAttribute("color")).toBe("error");
  expect(input().getAttribute("aria-invalid")).toBe("true");
  expect(input().id).toBe("field");
});
