/** @vitest-environment jsdom */
/**
 * The date picker closes once the day is picked, as a select closes on its
 * pick; a range closes on its end, a multiple picker stays open for more.
 * Its calendar is named in the user's language.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type App,
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  watch,
} from "vue";
import { CalendarDate } from "@internationalized/date";
import { useFormField } from "@nuxt/ui/composables/useFormField";
import {
  isFunction,
  isObject,
  isString,
} from "../layers/dms-core/app/utils/type-check";
import type { CalendarProps } from "@nuxt/ui/components/Calendar.vue";
import { defined } from "./helpers/defined";

let app: App | undefined;
let host: HTMLDivElement;
type PickedValue =
  | CalendarDate
  | CalendarDate[]
  | { start: CalendarDate; end: CalendarDate | undefined };

let pick: (value: PickedValue) => void = () => {};
let calendarLabel: unknown;

async function flush(): Promise<void> {
  for (let tick = 0; tick < 4; tick++) await nextTick();
}

const Popover = defineComponent({
  props: { open: Boolean },
  emits: ["update:open"],
  setup:
    (props, { slots, emit }) =>
    () =>
      h("div", { "data-open": String(props.open) }, [
        h("button", {
          "data-toggle": "",
          onClick: () => emit("update:open", !props.open),
        }),
        slots.content?.(),
      ]),
});

const Calendar = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs }) {
    calendarLabel = attrs["calendar-label"];
    pick = (value) => {
      const listener = attrs["onUpdate:modelValue"];
      if (!isFunction(listener))
        throw new Error("The picker received no update listener");
      listener(value);
    };
    return () => h("div");
  },
});

async function mount(
  props: Pick<CalendarProps<boolean, boolean>, "range" | "multiple"> = {},
) {
  const { default: DatePicker } = await import(
    "../layers/dms-ui/app/components/form/components/DatePicker.vue"
  );
  app = createApp({ render: () => h(DatePicker, { id: "due", ...props }) });
  app.component("UPopover", Popover);
  app.component("UButton", defineComponent({ setup: () => () => null }));
  app.component("UCalendar", Calendar);
  app.mount(host);
  await flush();
  defined(host.querySelector<HTMLButtonElement>("[data-toggle]")).click();
  await flush();
}

const isOpen = () =>
  defined(host.querySelector("[data-open]")).getAttribute("data-open");
const day = (date: number) => new CalendarDate(2026, 10, date);

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
    locale: ref("en-GB"),
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

describe("the date picker", () => {
  it("closes once a day is picked", async () => {
    await mount();
    expect(isOpen()).toBe("true");
    pick(day(18));
    await flush();
    expect(isOpen()).toBe("false");
  });

  it("stays open on a range's start, and closes on its end", async () => {
    await mount({ range: true });
    pick({ start: day(18), end: undefined });
    await flush();
    expect(isOpen()).toBe("true");
    pick({ start: day(18), end: day(20) });
    await flush();
    expect(isOpen()).toBe("false");
  });

  it("names its calendar in the user's language, not the library's English default", async () => {
    await mount();
    expect(calendarLabel).toBe("dms.form.select_date");
  });

  it("stays open for the next day of a multiple pick", async () => {
    await mount({ multiple: true });
    pick([day(18)]);
    await flush();
    expect(isOpen()).toBe("true");
  });
});
