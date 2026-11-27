// @vitest-environment jsdom
/**
 * The inline calendar field names its calendar in the user's language, as
 * the date picker does, instead of the library's English "Event Date".
 *
 * @packageDocumentation
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  ref,
  watch,
  type App,
} from "vue";
import { useFormField } from "@nuxt/ui/composables/useFormField";
import { isObject, isString } from "../layers/dms-core/app/utils/type-check";

let app: App | undefined;
let calendarLabel: unknown;

const Calendar = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    calendarLabel = attrs["calendar-label"];
    return () => h("div");
  },
});

beforeEach(() => {
  vi.stubGlobal("useDmsUserSession", () => ({ user: ref(null) }));
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useFormField", useFormField);
  vi.stubGlobal("isString", isString);
  vi.stubGlobal(
    "isObject",
    <Value>(value: Value) => isObject(value) && value !== null,
  );
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("fr-FR"),
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

it("labels its calendar with the translated date prompt", async () => {
  const { default: InputCalendar } = await import(
    "../layers/dms-ui/app/components/form/components/InputCalendar.vue"
  );
  app = createApp({ render: () => h(InputCalendar, { id: "due" }) });
  app.config.globalProperties.$t = String;
  app.component("UCalendar", Calendar);
  app.mount(document.createElement("div"));
  expect(calendarLabel).toBe("dms.form.select_date");
});
