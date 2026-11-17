/**
 * Mounting the time grid, the month and the chip over a fake context, for
 * their render tests: the context is provided under the key
 * `useAgendaContext` reads.
 */
import { AGENDA_CONTEXT_KEY } from "./agendaRuntime";
import { computed, createApp, defineComponent, h, nextTick } from "vue";
import type { Component } from "vue";
import type { NamedValue } from "vue-i18n";
import type {
  AgendaContext,
  AgendaOccurrence,
} from "../../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import type {
  AgendaViewType,
  FullAgendaOptions,
} from "../../layers/dms-ui/app/types/full-agenda";
import { fakeAgendaContext } from "./agendaFakeContext";
import { agendaDays } from "./agendaOccurrences";

/** The context the mounted parts read. */
export interface MountedAgenda {
  ctx: AgendaContext | null;
}

export const mounted: MountedAgenda = { ctx: null };

const stub = (name: string, slotNames: string[] = ["default"]) =>
  defineComponent({
    name,
    inheritAttrs: false,
    props: {
      label: { type: String, default: undefined },
      name: { type: String, default: undefined },
    },
    setup:
      (props, { attrs, slots }) =>
      () =>
        h("span", { ...attrs, "data-stub": name, "data-name": props.name }, [
          props.label,
          ...slotNames.map((slot) => slots[slot]?.()),
        ]),
  });

const STUBS = {
  UTooltip: stub("UTooltip"),
  UPopover: stub("UPopover", ["default", "content"]),
  UBadge: stub("UBadge"),
  UAvatar: stub("UAvatar"),
  UIcon: stub("UIcon"),
};

/** `t` as the tests read it: the key, then its parameters as JSON. */
export const translate = (key: string, params?: NamedValue) =>
  params && Object.keys(params).length
    ? `${key}${JSON.stringify(params)}`
    : key;

export interface GridSetup {
  raw?: FullAgendaOptions;
  view?: AgendaViewType;
  from?: string;
  dayCount?: number;
  occurrences?: AgendaOccurrence[];
}

/** A fake context over days from `from`, holding `occurrences`. */
export function contextFor(setup: GridSetup): AgendaContext {
  const view = setup.view ?? "week";
  const { ctx } = fakeAgendaContext({ ...setup.raw, views: [view] });
  const days = agendaDays(setup.from ?? "2026-10-26", setup.dayCount ?? 7);
  ctx.range = computed(() => ({
    from: days[0]!.key,
    to: days.at(-1)!.key,
    days,
    start: days[0]!.start,
    end: days.at(-1)!.end,
  }));
  ctx.occurrences = computed(() => setup.occurrences ?? []);
  mounted.ctx = ctx;
  return ctx;
}

/** The props a mounted component receives. */
type MountProps = NonNullable<Parameters<typeof createApp>[1]>;

/** Mounts a component with the Nuxt UI stand-ins, in the document. */
export async function mount(
  component: Component,
  props: MountProps = {},
): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const app = createApp({ render: () => h(component, props) });
  if (mounted.ctx) app.provide(AGENDA_CONTEXT_KEY, mounted.ctx);
  for (const [name, definition] of Object.entries(STUBS))
    app.component(name, definition);
  app.mount(host);
  await nextTick();
  return host;
}
