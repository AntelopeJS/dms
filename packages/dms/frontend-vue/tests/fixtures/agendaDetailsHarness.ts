/**
 * The details of a FullAgenda (`useAgendaDetails`) mounted over a fake
 * context, and the overlay their prompts and confirmations open in: what the
 * details tests share. A test file calls `useDetailsHarness()`.
 */
import { stubRecordingOverlay, type OverlayAnswer } from "./agendaRuntime";
import { createApp, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, vi, type Mock } from "vitest";
import {
  fakeAgendaContext,
  fakeOccurrence,
  type FakeAgenda,
} from "./agendaFakeContext";
import {
  useAgendaDetails,
  type AgendaDetailsApi,
} from "../../layers/dms-ui/app/entries/composables/agenda/useAgendaDetails";
import type { AgendaFormValues } from "../../layers/dms-ui/app/entries/composables/agenda/agendaForm";
import type { FullAgendaOptions } from "../../layers/dms-ui/app/types/full-agenda";

/** What the prompts and confirmations answer, and the spies they open through. */
interface DetailsOverlay {
  modalAnswer: OverlayAnswer;
  confirmAnswer: boolean;
  modalOpen: Mock;
  confirmOpen: Mock<() => Promise<boolean>>;
}

export const detailsOverlay: DetailsOverlay = {
  modalAnswer: undefined,
  confirmAnswer: true,
  modalOpen: vi.fn(),
  confirmOpen: vi.fn(async () => true),
};

export const BRUSSELS = "Europe/Brussels";
export const MEETING = {
  id: "e1",
  title: "Sprint planning",
  start: "2026-10-26T09:00:00+01:00",
  end: "2026-10-26T10:00:00+01:00",
  calendarId: "design",
  data: { status: "open" },
};
export const CALENDARS = [
  { id: "hidden", label: "Hidden" },
  { id: "design", label: "Design" },
];

const apps: Array<{ unmount: () => void }> = [];

/** Types into the form as its inputs do (each field touched), and gives what it then holds. */
export function typeIn(
  api: AgendaDetailsApi,
  changes: AgendaFormValues,
): AgendaFormValues {
  for (const [field, value] of Object.entries(changes)) api.touch(field, value);
  return api.initialValues();
}

/** The details of a fake agenda, and the agenda. */
export interface DetailsUnderTest {
  api: AgendaDetailsApi;
  agenda: FakeAgenda;
}

/** Another details instance over the same agenda (the form mounted anew). */
export function detailsOn(agenda: FakeAgenda): AgendaDetailsApi {
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
  if (!api) throw new Error("the details mounted");
  return api;
}

/** The details of a fake agenda over the meeting and the calendars, with `raw` over them. */
export function details(
  raw: Partial<FullAgendaOptions> = {},
): DetailsUnderTest {
  const agenda = fakeAgendaContext({
    saveUrl: "/save",
    calendars: CALENDARS,
    timeZone: BRUSSELS,
    staticData: { events: [MEETING] },
    ...raw,
  });
  return { api: detailsOn(agenda), agenda };
}

/** An occurrence of a daily series of the meeting. */
export const recurringOccurrence = () =>
  fakeOccurrence(
    { ...MEETING, id: "standup" },
    {
      key: "standup@2026-10-26",
      recurring: { seriesId: "standup", occurrence: "2026-10-26" },
    },
  );

/** The globals and overlay each details test starts from; unmounts after it. */
export function useDetailsHarness(): void {
  beforeEach(() => {
    stubRecordingOverlay({
      modalOpen: detailsOverlay.modalOpen,
      confirm: detailsOverlay.confirmOpen,
    });
    vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
    detailsOverlay.modalAnswer = undefined;
    detailsOverlay.confirmAnswer = true;
    detailsOverlay.modalOpen.mockReset().mockImplementation(() => ({
      result: Promise.resolve(detailsOverlay.modalAnswer),
    }));
    detailsOverlay.confirmOpen
      .mockReset()
      .mockImplementation(async () => detailsOverlay.confirmAnswer);
  });
  afterEach(() => {
    for (const app of apps.splice(0)) app.unmount();
    vi.unstubAllGlobals();
  });
}
