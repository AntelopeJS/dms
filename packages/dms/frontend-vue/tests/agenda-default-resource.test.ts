/** @vitest-environment jsdom */
/**
 * a new booking opens on a room, and the route's
 * refusal of a create with no room shows under the room field.
 */
import { toastEngine, harness } from "./helpers/agenda-save-harness";
import { unawaited, stubRecordingOverlay } from "./fixtures/agendaRuntime";
import { createApp, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChange } from "../layers/dms-ui/app/entries/composables/agenda/agendaFormChanges";
import { defaultResourceOf } from "../layers/dms-ui/app/entries/composables/agenda/agendaPlacement";
import { useAgendaSaveToasts } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaSaveToasts";
import type { AgendaRefusal } from "../layers/dms-ui/app/entries/composables/agenda/agendaModel";
import type { AgendaDetailsApi } from "../layers/dms-ui/app/entries/composables/agenda/useAgendaDetails";
import type { AgendaResource } from "../layers/dms-ui/app/types/full-agenda";
import { fakeAgendaContext } from "./fixtures/agendaFakeContext";

const { useAgendaDetails } = await import(
  "../layers/dms-ui/app/entries/composables/agenda/useAgendaDetails"
);

const ROOM_NEEDED = "$app.error.room_needed";
const apps: Array<{ unmount: () => void }> = [];

beforeEach(() => {
  stubRecordingOverlay({});
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
});

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount();
  vi.unstubAllGlobals();
});

function detailsOf(agenda: ReturnType<typeof fakeAgendaContext>) {
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
  return api!;
}

describe("the room a new booking opens on", () => {
  const rooms: AgendaResource[] = [
    { id: "c1", label: "Room 1", calendarId: "host-a" },
    { id: "c2", label: "Room 2", calendarId: "host-b" },
    { id: "c3", label: "Room 3", editable: false, calendarId: "host-c" },
  ];

  it("opens on the room its provider usually works on (fails when New booking opens with an empty room, or always on the first room)", () => {
    expect(defaultResourceOf(rooms, "host-b")).toBe("c2");
  });

  it("opens on the first room that takes bookings when the provider has no usual room or it is read-only (fails when a read-only room is proposed, or none)", () => {
    expect([
      defaultResourceOf(rooms, "host-x"),
      defaultResourceOf(rooms, "host-c"),
      defaultResourceOf(rooms, undefined),
      defaultResourceOf([], "host-a"),
    ]).toEqual(["c1", "c1", "c1", undefined]);
  });
});

describe("a refusal about one field", () => {
  it("keeps the field the route names on the refused change (fails when the engine drops it and the form cannot point at the room)", async () => {
    const { engine, answer, failedEdits } = harness("immediate");
    unawaited(
      engine.record(
        createChange({ title: "Workshop", start: "2026-11-11T09:00:00+01:00" }),
      ),
    );
    await answer({
      errors: [{ index: 0, message: ROOM_NEEDED, field: "resourceIds" }],
    });
    expect(failedEdits.map((edit) => [edit.message, edit.field])).toEqual([
      [ROOM_NEEDED, "resourceIds"],
    ]);
  });

  it("passes the field of a refused change on to the form (fails when the toast keeps the message and loses the field)", () => {
    vi.stubGlobal("useToast", () => ({
      add: () => ({ id: 1 }),
      remove: vi.fn(),
    }));
    const lastRefusal = ref<AgendaRefusal | null>(null);
    const { failed } = useAgendaSaveToasts({
      raw: {},
      text: String,
      announce: vi.fn(),
      engine: () => toastEngine(),
      lastRefusal,
      resend: vi.fn(),
    });
    const [edit] = harnessEdit();
    failed([edit]);
    expect(lastRefusal.value).toMatchObject({
      message: ROOM_NEEDED,
      field: "resourceIds",
    });
  });

  it("shows the route's message under the field it names, and keeps it with a form mounted again (fails when it shows at the foot of the form, away from the room)", async () => {
    const agenda = fakeAgendaContext({
      saveUrl: "/save",
      timeZone: "Europe/Brussels",
      resources: [{ id: "c1", label: "Room 1" }],
      staticData: { events: [] },
    });
    const api = detailsOf(agenda);
    const start = Date.parse("2026-11-11T09:00:00+01:00");
    agenda.ctx.details.value = {
      occurrence: null,
      placement: {
        start,
        end: start + 1_800_000,
        allDay: false,
        resourceIds: [],
      },
      mode: "edit",
      container: "drawer",
    };
    agenda.ctx.apply = vi.fn(async () => {
      agenda.ctx.lastRefusal!.value = {
        message: ROOM_NEEDED,
        field: "resourceIds",
      };
      return false;
    });
    api.touch("title", "Workshop");
    expect(await api.save(api.initialValues())).toBe(false);
    expect([api.errors.value.resourceIds, api.errors.value._form]).toEqual([
      ROOM_NEEDED,
      undefined,
    ]);
    expect(detailsOf(agenda).errors.value.resourceIds).toBe(ROOM_NEEDED);
  });

  it("keeps a refusal about a field the form does not show at the foot of the form (fails when the message hides under a missing field)", async () => {
    const agenda = fakeAgendaContext({
      saveUrl: "/save",
      timeZone: "Europe/Brussels",
      staticData: { events: [] },
    });
    const api = detailsOf(agenda);
    const start = Date.parse("2026-11-11T09:00:00+01:00");
    agenda.ctx.details.value = {
      occurrence: null,
      placement: {
        start,
        end: start + 1_800_000,
        allDay: false,
        resourceIds: [],
      },
      mode: "edit",
      container: "drawer",
    };
    agenda.ctx.apply = vi.fn(async () => {
      agenda.ctx.lastRefusal!.value = {
        message: ROOM_NEEDED,
        field: "resourceIds",
      };
      return false;
    });
    api.touch("title", "Workshop");
    await api.save(api.initialValues());
    expect(api.errors.value._form).toBe(ROOM_NEEDED);
  });
});

describe("one message for a refusal the form shows", () => {
  function toastsOf() {
    const add = vi.fn((_toast: { actions?: unknown[] }) => ({ id: 1 }));
    vi.stubGlobal("useToast", () => ({ add, remove: vi.fn() }));
    const announce = vi.fn();
    const { failed } = useAgendaSaveToasts({
      raw: {},
      text: String,
      announce,
      engine: () => toastEngine(),
      lastRefusal: ref<AgendaRefusal | null>(null),
      resend: vi.fn(),
    });
    return { failed, add, announce };
  }

  it("leaves a refusal about a form field to the form, with no toast whose Retry would only repeat it (fails when 'Could not save' and 'Retry' show over the room's own message)", () => {
    const { failed, add, announce } = toastsOf();
    failed(harnessEdit());
    expect([add.mock.calls.length, announce.mock.calls.length]).toEqual([0, 1]);
  });

  it("still offers Retry on a refusal that names no field, such as a dragged booking refused (fails when every refusal loses its toast)", () => {
    const { failed, add } = toastsOf();
    const [edit] = harnessEdit();
    failed([{ ...edit, field: undefined }]);
    expect(add.mock.calls).toHaveLength(1);
    expect(add.mock.calls[0]?.[0].actions).toHaveLength(1);
  });
});

/** A refused create as the engine hands it to `failed`. */
function harnessEdit() {
  return [
    {
      key: "tmp-1",
      change: createChange({ title: "Workshop" }),
      status: "error" as const,
      message: ROOM_NEEDED,
      field: "resourceIds",
    },
  ];
}
