/**
 * The FullAgenda block's frame mounted in jsdom over a fake context: the
 * stand-ins of Nuxt UI, an overlay that records the drawers, modals and
 * confirmations the block opens, the static data, and `mountBlock`. A test
 * file mounts `AgendaFrame` (the block as it is laid out, over the context
 * `FullAgendaBlock` provides) and calls `useAgendaBlockHarness()`.
 */
import { AGENDA_CONTEXT_KEY, stubRecordingOverlay } from "./agendaRuntime";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  ref,
  type Component,
  type Ref,
} from "vue";
import { afterEach, beforeEach, vi, type Mock } from "vitest";
import type { NamedValue } from "vue-i18n";
import { isObject, isString } from "../../layers/dms-core/app/utils/type-check";
import { registerDmsComponent } from "#dms/frontend-module";
import { fakeAgendaContext, type FakeAgenda } from "./agendaFakeContext";
import { useRealDataEngine } from "./dataEngine";
import { stubBlockRuntime } from "../helpers/block-runtime";
import { DMS_CONTAINER_KEY } from "../../layers/dms-ui/app/entries/composables/containers/context";
import { providePageFillHeight } from "../../layers/dms-ui/app/composables/layout/usePageFillHeight";
import type { AgendaContext } from "../../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import type {
  AgendaData,
  FullAgendaOptions,
} from "../../layers/dms-ui/app/types/full-agenda";

/** What the overlay and the globals share with the tests. */
interface AgendaHarness {
  agenda: FakeAgenda | null;
  drawerOpen: Mock;
  modalOpen: Mock;
  confirm: Mock<() => Promise<boolean>>;
  pageFills: Ref<boolean>;
  toast: Mock;
}

export const harness: AgendaHarness = {
  agenda: null,
  drawerOpen: vi.fn(),
  modalOpen: vi.fn(),
  confirm: vi.fn(async () => true),
  pageFills: ref(false),
  toast: vi.fn(),
};

/** A stand-in drawing its label, its slot and the attributes it was given. */
export const stub = (name: string) =>
  defineComponent({
    name,
    inheritAttrs: false,
    props: { label: { type: String, default: undefined } },
    setup:
      (props, { attrs, slots }) =>
      () =>
        h("div", { ...attrs, "data-stub": name }, [
          props.label,
          slots.default?.(),
        ]),
  });

/** A text input of the DMS: an `<input>` that emits what is typed. */
const TextInput = defineComponent({
  props: { modelValue: { type: null, default: undefined } },
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      h("input", {
        value: props.modelValue ?? "",
        onInput: (event: Event) =>
          emit(
            "update:modelValue",
            event.target instanceof HTMLInputElement ? event.target.value : "",
          ),
      }),
});

registerDmsComponent("DmsInputText", TextInput);
for (const name of [
  "DmsInputTextarea",
  "DmsInputNumber",
  "DmsInputSelect",
  "DmsInputSwitch",
  "DmsInputTags",
  "DmsDatePicker",
  "DmsInputTime",
  "DmsRichText",
])
  registerDmsComponent(name, stub(name));

const UButton = defineComponent({
  inheritAttrs: false,
  props: {
    label: { type: String, default: undefined },
    type: { type: String, default: "button" },
  },
  setup:
    (props, { attrs, slots }) =>
    () =>
      h("button", { ...attrs, type: props.type }, [
        props.label,
        slots.default?.(),
      ]),
});

const UPopover = defineComponent({
  props: { open: { type: Boolean, default: false } },
  setup:
    (props, { slots }) =>
    () =>
      h("div", { "data-popover": "" }, [
        slots.default?.(),
        props.open ? slots.content?.() : null,
      ]),
});

/** A select listing its items, `value` on the element. */
interface SelectItem {
  label: string;
  value: string;
}

const isSelectItem = (item: unknown): item is SelectItem =>
  isObject(item) && isString(item.label) && isString(item.value);

const USelect = defineComponent({
  inheritAttrs: false,
  props: {
    items: { type: Array, default: () => [] },
    modelValue: { type: null, default: undefined },
  },
  setup:
    (props, { attrs }) =>
    () =>
      h(
        "select",
        { ...attrs, value: props.modelValue },
        props.items
          .filter(isSelectItem)
          .map((item) => h("option", { value: item.value }, item.label)),
      ),
});

const STUBBED = [
  "UTooltip",
  "UIcon",
  "UBadge",
  "UInput",
  "USelectMenu",
  "UAvatar",
  "URadioGroup",
  "DmsSegmentedControl",
  "USwitch",
];

export const AGENDA_STATIC: AgendaData = {
  events: [
    {
      id: "e1",
      title: "Sprint planning",
      start: "2026-10-26T09:00:00+01:00",
      end: "2026-10-26T10:00:00+01:00",
      calendarId: "design",
      location: "Room A",
      data: { dossier: "45601" },
      issues: [{ message: "No room booked", tone: "error" }],
    },
    {
      id: "e2",
      title: "Design critique",
      start: "2026-10-27T14:00:00+01:00",
      end: "2026-10-27T15:00:00+01:00",
      calendarId: "design",
    },
    {
      id: "e3",
      title: "Backend sync",
      start: "2026-10-28T11:00:00+01:00",
      end: "2026-10-28T11:30:00+01:00",
      calendarId: "eng",
    },
  ],
  calendars: [
    { id: "design", label: "Design", color: "oklch(0.62 0.15 258)" },
    { id: "eng", label: "Engineering", color: "#1A7A4A" },
  ],
  unscheduled: [{ id: "p1", title: "Client_1", subtitle: "45601" }],
  notices: [{ message: "Under-staffed on Saturday", date: "2026-10-31" }],
};

/** Where the block is mounted. */
export interface AgendaMountPlace {
  /** The parent's CSS: a flex column by default (a page's filling block). */
  parentStyle?: string;
  /** Inside a drawer or a modal (`DMS_CONTAINER_KEY` provided). */
  container?: boolean;
  /** The page marks the parent as its filling block (`data-dms-page-fill`). Defaults to `true`. */
  pageFill?: boolean;
  /** A wrapper between the parent and the block (a permission veil), with this CSS. */
  veil?: string;
  /** Fields of the fake context to replace before the block mounts (a known day, a real format). */
  context?: (ctx: AgendaContext) => Partial<AgendaContext>;
}

const FLEX_COLUMN = "display: flex; flex-direction: column";
const mounted: Array<{ unmount: () => void; el: HTMLElement }> = [];

/** Mounts `block` over a fake context of the options, `width` pixels wide. */
export async function mountBlock(
  block: Component,
  options: Partial<FullAgendaOptions> = {},
  width = 1400,
  place: AgendaMountPlace = {},
): Promise<{ el: HTMLElement; agenda: FakeAgenda }> {
  const props = {
    componentId: "team",
    pageId: "agenda-team",
    staticData: AGENDA_STATIC,
    ...options,
  };
  harness.agenda = fakeAgendaContext(props, width);
  if (place.context)
    Object.assign(harness.agenda.ctx, place.context(harness.agenda.ctx));
  const el = document.createElement("div");
  el.setAttribute("style", place.parentStyle ?? FLEX_COLUMN);
  if (place.pageFill !== false) el.setAttribute("data-dms-page-fill", "");
  document.body.append(el);
  const root = defineComponent({
    setup() {
      provide(AGENDA_CONTEXT_KEY, harness.agenda!.ctx);
      providePageFillHeight(harness.pageFills);
      if (place.container)
        provide(DMS_CONTAINER_KEY, { id: "container", close: async () => {} });
      return () =>
        place.veil === undefined
          ? h(block, { options: props })
          : h("div", { style: place.veil, "data-veil": "" }, [
              h(block, { options: props }),
            ]);
    },
  });
  const app = createApp(root);
  for (const name of STUBBED) app.component(name, stub(name));
  app.component("UButton", UButton);
  app.component("UPopover", UPopover);
  app.component("USelect", USelect);
  app.mount(el);
  mounted.push({ unmount: () => app.unmount(), el });
  await nextTick();
  return { el, agenda: harness.agenda };
}

/** The globals and container spies each test starts from; unmounts after it. */
export function useAgendaBlockHarness(): void {
  beforeEach(async () => {
    await stubBlockRuntime(vi.fn().mockResolvedValue(null));
    useRealDataEngine();
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en-GB"),
      t: (key: string, params?: NamedValue) =>
        params !== undefined ? `${key} ${JSON.stringify(params)}` : key,
    }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
    harness.toast.mockReset();
    vi.stubGlobal("useToast", () => ({ add: harness.toast }));
    stubRecordingOverlay(harness);
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    harness.drawerOpen.mockReset().mockImplementation(() => ({
      result: new Promise(() => {}),
      close: vi.fn(),
      patch: vi.fn(),
    }));
    harness.modalOpen.mockReset().mockImplementation(() => ({
      result: Promise.resolve(true),
      close: vi.fn(),
      patch: vi.fn(),
    }));
    harness.confirm.mockReset().mockImplementation(async () => true);
    harness.pageFills.value = false;
  });
  afterEach(() => {
    for (const { unmount, el } of mounted.splice(0)) {
      unmount();
      el.remove();
    }
    vi.unstubAllGlobals();
  });
}

/** An element of the block. */
export const query = (el: HTMLElement, selector: string) =>
  el.querySelector<HTMLElement>(selector);

/** The Save button of the block's save bar: its last button. */
export const saveButton = (el: HTMLElement) =>
  [
    ...(el
      .querySelector("[data-agenda-save-bar]")
      ?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ].at(-1);
