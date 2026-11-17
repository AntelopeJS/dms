/** @vitest-environment jsdom */
/**
 * What the agenda draws when a read fails: a newly asked range whose read
 * failed is drawn empty, never with the previous range's events under its
 * dates; a failed refresh of the range shown keeps what it had. Read through
 * the block's own data source, over the DMS data engine and a route that
 * answers or fails as each test says.
 */
import "./fixtures/agendaRuntime";
import { computed, effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { stubBlockRuntime } from "./helpers/block-runtime";
import type {
  AgendaData,
  FullAgendaOptions,
} from "../layers/dms-ui/app/types/full-agenda";
import type { AgendaRange } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import { resolveAgendaViews } from "../layers/dms-ui/app/entries/composables/agenda/agendaRange";
import { agendaDays } from "./fixtures/agendaOccurrences";

const route = vi.fn();

beforeEach(async () => {
  route.mockReset();
  await stubBlockRuntime(route);
  useRealDataEngine();
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
});

const { useAgendaData } = await import(
  "../layers/dms-ui/app/entries/composables/agenda/useAgendaData"
);

const event = (id: string, day: string) => ({
  id,
  title: id,
  start: `${day}T08:00:00Z`,
  end: `${day}T09:00:00Z`,
});

const RAW: FullAgendaOptions = { fetchUrl: "/api/hours/data" };
const WEEK = resolveAgendaViews(["week"], RAW, () => "")[0]!;

/** The seven days from `from`, as the agenda's range. */
function rangeOf(from: string): AgendaRange {
  const days = agendaDays(from, 7);
  return {
    from: days[0]!.key,
    to: days.at(-1)!.key,
    days,
    start: days[0]!.start,
    end: days.at(-1)!.end,
  };
}

/** The data source of a block over the week of `from`, the range moved by the returned ref. */
function source() {
  const week = ref({ from: "2026-11-23", to: "2026-11-29" });
  const scope = effectScope();
  const data = scope.run(() =>
    useAgendaData({
      raw: RAW,
      routeParams: () => undefined,
      range: computed(() => rangeOf(week.value.from)),
      view: computed(() => WEEK),
      timeZone: () => "Europe/Brussels",
      search: ref(""),
      facetValues: ref({}),
      hiddenCalendarIds: () => undefined,
      watchKey: () => "",
    }),
  );
  if (data === undefined) throw new Error("the data source was built");
  return { data, week, scope };
}

const RESOURCES = [{ id: "m1", label: "M1" }];

/** The route answers these events at its next read. */
const answers = (events: AgendaData["events"]) =>
  route.mockResolvedValueOnce({ events, resources: RESOURCES });

/** The route fails its next read. */
const fails = () => route.mockRejectedValueOnce(new Error("500"));

const settle = async () => {
  await vi.waitFor(() => expect(route).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const drawn = (data: ReturnType<typeof source>["data"]) => ({
  events: data.data.value.events.map((one) => one.id),
  resources: (data.data.value.resources ?? []).map((one) => one.id),
  windowFailed: data.windowFailed.value,
  error: Boolean(data.error.value),
});

describe("a failed read of the agenda", () => {
  it("draws a newly asked week whose read failed empty with the error, then the week once its read answers (fails when the previous week's events stay under the new dates)", async () => {
    answers([event("last-week", "2026-11-24")]);
    const { data, week, scope } = source();
    await settle();
    route.mockClear();
    fails();
    week.value = { from: "2026-11-30", to: "2026-12-06" };
    await settle();
    const failed = drawn(data);
    route.mockClear();
    answers([event("this-week", "2026-12-01")]);
    await data.refresh();
    await settle();
    expect([failed, drawn(data)]).toEqual([
      { events: [], resources: ["m1"], windowFailed: true, error: true },
      {
        events: ["this-week"],
        resources: ["m1"],
        windowFailed: false,
        error: false,
      },
    ]);
    scope.stop();
  });

  it("keeps the events of the week shown when its refresh fails (fails when a failed refresh of the same week empties it)", async () => {
    answers([event("this-week", "2026-11-24")]);
    const { data, scope } = source();
    await settle();
    route.mockClear();
    fails();
    await data.refresh();
    await settle();
    expect(drawn(data)).toEqual({
      events: ["this-week"],
      resources: ["m1"],
      windowFailed: false,
      error: true,
    });
    scope.stop();
  });
});
