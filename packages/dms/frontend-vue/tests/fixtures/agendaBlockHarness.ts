/* eslint-disable vue/one-component-per-file -- stand-ins for Nuxt UI and the views */
/**
 * The FullAgenda block mounted in jsdom over a fake context: the stand-ins
 * of Nuxt UI, of the views and of the containers, the module mocks the test
 * files hand to `vi.mock` (`mocks.*`), the static data, and `mountBlock`.
 * A test file mocks the modules it reaches with these factories, then
 * imports the block and calls `useAgendaBlockHarness()`.
 */
import {
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  provide,
  ref,
  type Component,
  type InjectionKey,
} from "vue";
import { afterEach, beforeEach, vi } from "vitest";
import { fakeAgendaContext, type FakeAgenda } from "./agendaFakeContext";
import { DMS_CONTAINER_KEY } from "../../layers/dms-ui/app/build/composables/containers/context";
import type { AgendaContext } from "../../layers/dms-ui/app/build/composables/agenda/agendaModel";
import type {
  AgendaData,
  FullAgendaOptions,
} from "../../layers/dms-ui/app/types/full-agenda";

const AGENDA_KEY: InjectionKey<AgendaContext> = Symbol("agenda");

/** What the mocks share with the tests. */
export const harness = {
  agenda: null as FakeAgenda | null,
  drawerOpen: vi.fn(),
  modalOpen: vi.fn(),
  confirm: vi.fn(async () => true),
  pageFills: ref(false),
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

const CellValue = defineComponent({
  props: { value: { type: null, default: undefined } },
  setup: (props) => () =>
    h("span", { "data-cell-value": "" }, String(props.value ?? "")),
});

const FieldInput = defineComponent({
  props: {
    modelValue: { type: null, default: undefined },
    id: { type: String, default: undefined },
  },
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      h("input", {
        id: props.id,
        value: props.modelValue ?? "",
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      }),
});

const SaveBar = defineComponent({
  props: { saveLabel: { type: String, default: undefined } },
  emits: ["save", "discard"],
  setup:
    (props, { emit }) =>
    () =>
      h(
        "button",
        { "data-save-bar": "", onClick: () => emit("save") },
        props.saveLabel,
      ),
});

const InlineStatus = defineComponent({
  props: { state: { type: String, default: undefined } },
  setup: (props) => () => h("div", { "data-block-status": props.state }),
});

/** The factories the test files give `vi.mock`, by module. */
export const mocks = {
  useAgenda: {
    useAgenda: () => {
      const ctx = harness.agenda!.ctx;
      provide(AGENDA_KEY, ctx);
      return ctx;
    },
    useAgendaContext: () => inject(AGENDA_KEY)!,
  },
  view: (name: string) => ({ default: stub(name) }),
  calendar: { default: stub("calendar") },
  cellValue: { default: CellValue },
  fieldInput: { default: FieldInput },
  resolveDmsComponent: { resolveDmsComponent: () => stub("dms-input") },
  useDrawer: { useDrawer: () => ({ open: harness.drawerOpen }) },
  useModal: { useModal: () => ({ open: harness.modalOpen }) },
  useConfirm: { useConfirm: () => ({ confirm: harness.confirm }) },
  usePageFillHeight: { usePageFillHeight: () => harness.pageFills },
  saveBar: { default: SaveBar },
  inlineStatus: { default: InlineStatus },
  useWatch: { useWatch: () => ({ state: ref({}) }) },
  useComponentEvent: { useComponentEvent: vi.fn() },
};

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
        (props.items as SelectItem[]).map((item) =>
          h("option", { value: item.value }, item.label),
        ),
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
  "DmsSegmented",
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
  const el = document.createElement("div");
  el.setAttribute("style", place.parentStyle ?? FLEX_COLUMN);
  document.body.append(el);
  const root = defineComponent({
    setup() {
      if (place.container)
        provide(DMS_CONTAINER_KEY, { id: "container", close: async () => {} });
      return () => h(block, props);
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
  beforeEach(() => {
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en-GB"),
      t: (key: string, params?: Record<string, unknown>) =>
        params && typeof params === "object"
          ? `${key} ${JSON.stringify(params)}`
          : key,
    }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
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
