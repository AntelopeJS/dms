/** @vitest-environment jsdom */
/**
 * The end after a corrected start: a start that reads again after one
 * that did not moves the end and keeps the length the form showed, as a first
 * valid edit does.
 */
import { stubRecordingOverlay } from "./fixtures/agendaRuntime";
import { createApp, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeAgendaContext,
  fakeOccurrence,
} from "./fixtures/agendaFakeContext";
import type { AgendaDetailsApi } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaDetails";

const { useAgendaDetails } = await import(
  "../layers/dms-ui/app/entries/composables/agenda/useAgendaDetails"
);

const MEETING = {
  id: "e1",
  title: "Sprint planning",
  start: "2026-10-26T09:00:00+01:00",
  end: "2026-10-26T10:00:00+01:00",
  calendarId: "design",
  data: { status: "open" },
};
const apps: Array<{ unmount: () => void }> = [];

beforeEach(() => {
  stubRecordingOverlay({});
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
});

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  vi.unstubAllGlobals();
});

function editMeeting() {
  const agenda = fakeAgendaContext({
    saveUrl: "/save",
    calendars: [{ id: "design", label: "Design" }],
    timeZone: "Europe/Brussels",
    staticData: { events: [MEETING] },
  });
  let api: AgendaDetailsApi | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        api = useAgendaDetails(agenda.ctx);
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  apps.push(app);
  agenda.ctx.details.value = {
    occurrence: fakeOccurrence(MEETING),
    mode: "edit",
    container: "drawer",
  };
  return { api: api!, agenda };
}

describe("the end after a start that did not read", () => {
  it("moves the end with a valid start typed after an unreadable one, keeping the length the form showed (fails when the end stays and the event shrinks or grows)", async () => {
    const { api, agenda } = editMeeting();

    const unreadable = api.pick(
      "start",
      "2026-10-26T25:00",
      api.initialValues(),
    );
    const values = api.pick("start", "2026-10-26T09:15", unreadable);

    expect([values.start, values.end]).toEqual([
      "2026-10-26T09:15",
      "2026-10-26T10:15",
    ]);
    expect(await api.save(values)).toBe(true);
    expect(agenda.applied[0]?.patch).toMatchObject({
      start: "2026-10-26T09:15:00+01:00",
      end: "2026-10-26T10:15:00+01:00",
    });
  });

  it("keeps the length across an emptied start too (fails when only an unreadable time, not an empty one, remembers the length)", () => {
    const { api } = editMeeting();

    const emptied = api.pick("start", "2026-10-26T", api.initialValues());
    const values = api.pick("start", "2026-10-26T11:00", emptied);

    expect([values.start, values.end]).toEqual([
      "2026-10-26T11:00",
      "2026-10-26T12:00",
    ]);
  });

  it("keeps the length of the last end the member set, not the opening one (fails when the length is read once at open)", () => {
    const { api } = editMeeting();

    const longer = api.pick("end", "2026-10-26T11:00", api.initialValues());
    const unreadable = api.pick("start", "2026-10-26T25:00", longer);
    const values = api.pick("start", "2026-10-26T09:30", unreadable);

    expect(values.end).toBe("2026-10-26T11:30");
  });
});
