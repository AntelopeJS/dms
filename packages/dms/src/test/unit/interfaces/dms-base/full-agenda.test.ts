import { expect } from "chai";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import { CodeBlock } from "@antelopejs/interface-dms/base";
import { FullAgenda } from "@antelopejs/interface-dms/base/full-agenda";
import type {
  AgendaData,
  AgendaSaveRequest,
  FullAgendaProps,
} from "@antelopejs/interface-dms/base/full-agenda-types";

const COMPONENT_NAME = "dms-full-agenda-block";

/** Every option set at once but the action targets, as a page author may write them. */
const FULL_OPTIONS: FullAgendaProps = {
  title: "Planning",
  description: "Design office",
  fetchUrl: "/api/planning/events?site={{params.site}}",
  fetchUrlMethod: "GET",
  realtimeTopic: ["planning"],
  periodScope: "planning-period",
  saveUrl: "/api/planning/save",
  saveUrlMethod: "POST",
  views: [
    "week",
    { id: "slots", type: "timeline", scale: "slot", duration: 7 },
    { id: "staff", type: "resources", resourceLayout: "daysFirst" },
    { id: "year", type: "year", yearLayout: "planner", label: "Year" },
  ],
  initialView: "slots",
  initialDate: "2026-09-28",
  minDate: "2026-09-28",
  maxDate: "2026-10-18",
  weekStartsOn: 1,
  hiddenDays: [0, 6],
  timeZone: "Europe/Brussels",
  calendars: [
    { id: "planned", label: "Planned", color: "#2D5BE3", group: "status" },
    { id: "done", label: "Done", color: "success", editable: false },
  ],
  resources: [
    {
      id: "QVERS",
      label: "QVerschelden",
      description: "Zone : Our",
      group: "draughtsmen",
      businessHours: [{ days: [1, 2, 3, 4, 5], start: "08:00", end: "17:00" }],
    },
  ],
  slots: [
    { id: "S1", label: "S1", start: "08:00", end: "10:00" },
    { id: "S2", label: "S2", start: "10:00", end: "12:00" },
  ],
  businessHours: [{ days: [1, 2, 3, 4, 5], start: "09:30", end: "18:30" }],
  dayStart: "07:00",
  dayEnd: "21:00",
  slotMinutes: 30,
  snapMinutes: 15,
  hourHeight: 56,
  scrollTime: "08:00",
  nowIndicator: true,
  allDayRow: true,
  weekNumbers: true,
  overlap: "stack",
  maxEventsPerDay: 3,
  resourceAreaWidth: 210,
  columnMinWidth: 64,
  defaultDurationMinutes: 60,
  eventContent: { subtitle: true, avatar: false },
  tooltips: true,
  editable: true,
  dragMove: true,
  dragResize: true,
  copyOnAltDrag: true,
  create: { trigger: "doubleClick", button: false },
  rangeSelect: "twoClicks",
  constraints: { withinBusinessHours: true, allowOverlap: false },
  saveMode: "staged",
  review: true,
  undoSeconds: 10,
  conflicts: "detect",
  recurringEdit: "ask",
  fields: [
    { id: "title", label: "Client", required: true },
    {
      id: "statut",
      label: "Status",
      kind: "select",
      options: [{ value: "done", label: "Done", tone: "success" }],
      visibleWhen: { field: "tache", in: ["Dessin"] },
    },
  ],
  details: { container: "panel", editDirectly: true, deepLink: false },
  toolbar: { datePicker: true, exportIcs: true, refresh: true },
  sidebar: {
    position: "right",
    width: 260,
    sections: ["unscheduled", "notices", "calendars", "tip"],
    tip: "Drag a dossier onto a slot",
  },
  legend: { position: "sidebar", counts: false, serverFilter: true },
  unscheduled: { title: "To plan", search: true, acceptDrop: true },
  search: true,
  facets: [
    {
      id: "location",
      label: "Place",
      field: "location",
      options: [{ value: "Liège", label: "Liège" }],
      multiple: true,
    },
  ],
  urlState: false,
  shortcuts: false,
  height: "fill",
  responsive: { compactBelow: 640, compactView: "day" },
  emptyLabel: "Nothing planned",
  density: "compact",
};

/** Events given in the options, for an agenda without a route. */
const STATIC_DATA: AgendaData = {
  calendars: [{ id: "it", label: "On call", color: "info" }],
  events: [
    {
      id: "standup",
      title: "Standup",
      start: "2026-10-26T09:00:00+01:00",
      end: "2026-10-26T09:15:00+01:00",
      recurrence: {
        frequency: "weekly",
        weekdays: [1, 2, 3, 4, 5],
        timeZone: "Europe/Brussels",
      },
    },
    {
      id: "oncall",
      title: "On call",
      calendarId: "it",
      allDay: true,
      start: "2026-10-26",
      end: "2026-10-30",
      short: "7,6",
    },
  ],
  backgrounds: [{ start: "2026-11-11", allDay: true, kind: "holiday" }],
};

/**
 * What a block posts once the user confirmed the route's question and chose
 * Overwrite on a conflict: `force` and `overwrite` are two answers, and a
 * `null` clears a field.
 */
const SAVE_REQUEST: AgendaSaveRequest = {
  changes: [
    {
      kind: "move",
      id: "45533-DC-1-Devis-Recap",
      patch: {
        start: "2026-10-21T08:00:00+02:00",
        end: "2026-10-21T10:00:00+02:00",
        location: null,
        data: { remarque: null },
      },
      previous: {
        start: "2026-10-22T13:00:00+02:00",
        end: "2026-10-22T15:00:00+02:00",
        location: null,
      },
    },
  ],
  force: true,
  overwrite: true,
  conflicts: "detect",
  from: "2026-10-19",
  to: "2026-10-25",
  view: "week",
};

/**
 * The FullAgenda block: a calendar by month, week, day, list, year, resource
 * columns or timeline, edited by dragging. Its factory hands the options
 * through, serializing the components its action targets open, and the
 * catalog lists it with the schema of every option.
 */
describe("[unit] interfaces/dms-base — FullAgenda", () => {
  it("serializes under its block component name", () => {
    const serialized = FullAgenda({ title: "Agenda" }).serializeSync();
    expect(serialized.componentName).to.equal(COMPONENT_NAME);
    expect(serialized.options).to.deep.include({ title: "Agenda" });
  });

  it("takes the bare call of a page under construction", () => {
    const serialized = FullAgenda().serializeSync();
    expect(serialized.componentName).to.equal(COMPONENT_NAME);
    expect(serialized.options).to.deep.equal({});
  });

  it("hands every option through as written", () => {
    const { realtimeTopic: _topic, ...options } = FULL_OPTIONS;
    const serialized = FullAgenda(FULL_OPTIONS).serializeSync();
    expect(serialized.options).to.deep.include(options);
    expect(serialized.options?.views).to.deep.equal(FULL_OPTIONS.views);
    expect(serialized.options?.sidebar).to.deep.equal(FULL_OPTIONS.sidebar);
  });

  it("hands static data through as written", () => {
    const serialized = FullAgenda({
      staticData: STATIC_DATA,
      toolbar: false,
    }).serializeSync();
    expect(serialized.options?.staticData).to.deep.equal(STATIC_DATA);
    expect(serialized.options?.toolbar).to.equal(false);
    expect(
      ValidateBlockOptions("FullAgenda", { staticData: STATIC_DATA }).valid,
    ).to.equal(true);
  });

  it("keeps a save request's answers and cleared fields apart on the wire", () => {
    const sent = JSON.parse(JSON.stringify(SAVE_REQUEST)) as AgendaSaveRequest;
    expect(sent).to.deep.include({ force: true, overwrite: true });
    const [change] = sent.changes;
    expect(change?.patch).to.have.property("location", null);
    expect(change?.patch?.data).to.deep.equal({ remarque: null });
    expect(change?.previous).to.have.property("location", null);
  });

  it("serializes the component the event click opens", () => {
    const serialized = FullAgenda({
      eventAction: {
        type: "drawer",
        direction: "right",
        title: "Task",
        component: CodeBlock({ code: "{{row.id}} {{row.start}}" }),
      },
    }).serializeSync();
    const action = serialized.options?.eventAction;
    expect(action?.type).to.equal("drawer");
    const component = action?.type === "drawer" ? action.component : undefined;
    expect(component?.componentName).to.be.a("string");
    expect(component?.options).to.deep.include({
      code: "{{row.id}} {{row.start}}",
    });
  });

  it("serializes the component a picked range opens", () => {
    const serialized = FullAgenda({
      selectAction: {
        type: "modal",
        size: "lg",
        component: CodeBlock({ code: "{{row.from}} → {{row.to}}" }),
      },
    }).serializeSync();
    const action = serialized.options?.selectAction;
    const component = action?.type === "modal" ? action.component : undefined;
    expect(component?.componentName).to.be.a("string");
    expect(component?.options).to.deep.include({
      code: "{{row.from}} → {{row.to}}",
    });
  });

  it("serializes the targets of its event actions", () => {
    const serialized = FullAgenda({
      eventActions: [
        {
          id: "done",
          label: "Mark as done",
          icon: "i-ph-check-circle",
          tone: "success",
          visibleWhen: { field: "done", in: [false] },
          target: {
            type: "api",
            url: "/api/agenda/done?id={{row.id}}",
            method: "POST",
            successMessage: "Done",
          },
        },
        {
          id: "open",
          label: "Open",
          target: {
            type: "drawer",
            title: "Event",
            component: CodeBlock({ code: "{{row.title}}" }),
          },
        },
      ],
    }).serializeSync();
    const [done, open] = serialized.options?.eventActions ?? [];
    expect(done).to.deep.include({ id: "done", tone: "success" });
    expect(done?.visibleWhen).to.deep.equal({ field: "done", in: [false] });
    expect(done?.target).to.deep.equal({
      type: "api",
      url: "/api/agenda/done?id={{row.id}}",
      method: "POST",
      successMessage: "Done",
    });
    const component =
      open?.target.type === "drawer" ? open.target.component : undefined;
    expect(component?.componentName).to.be.a("string");
    expect(component?.options).to.deep.include({ code: "{{row.title}}" });
  });

  it("serializes the targets of its toolbar actions", () => {
    const serialized = FullAgenda({
      toolbarActions: [
        {
          id: "publish",
          label: "Publish",
          tone: "primary",
          target: {
            type: "api",
            url: "/api/schedule/publish?from={{row.from}}&to={{row.to}}",
            method: "POST",
            successMessage: "Published",
          },
        },
        {
          id: "week",
          label: "Template week",
          target: {
            type: "modal",
            component: CodeBlock({ code: "{{row.view}}" }),
          },
        },
      ],
    }).serializeSync();
    const [publish, week] = serialized.options?.toolbarActions ?? [];
    expect(publish?.target).to.deep.equal({
      type: "api",
      url: "/api/schedule/publish?from={{row.from}}&to={{row.to}}",
      method: "POST",
      successMessage: "Published",
    });
    const component =
      week?.target.type === "modal" ? week.target.component : undefined;
    expect(component?.componentName).to.be.a("string");
    expect(component?.options).to.deep.include({ code: "{{row.view}}" });
  });

  it("leaves a page target as it is", () => {
    const target = { type: "page" as const, url: "/tasks/{{row.id}}" };
    const serialized = FullAgenda({ eventAction: target }).serializeSync();
    expect(serialized.options?.eventAction).to.deep.equal(target);
  });

  it("is listed in the catalog with its schema", () => {
    const block = GetBlockType("FullAgenda");
    expect(block?.componentName).to.equal(COMPONENT_NAME);
    expect(block?.meta.group).to.equal("data");
    expect(block?.config.saveMode?.enum).to.deep.equal(["immediate", "staged"]);
    expect(block?.config.conflicts?.enum).to.deep.equal([
      "overwrite",
      "detect",
    ]);
    expect(block?.config.overlap?.enum).to.deep.equal(["columns", "stack"]);
    expect(block?.config.rangeSelect?.enum).to.deep.equal([
      "drag",
      "twoClicks",
    ]);
    expect(block?.config.recurringEdit?.enum).to.deep.equal([
      "ask",
      "occurrence",
      "series",
    ]);
    expect(block?.config.views).to.not.equal(undefined);
    expect(block?.config.eventActions).to.not.equal(undefined);
    expect(block?.config.toolbarActions).to.not.equal(undefined);
    expect(block?.config.search?.type).to.equal("boolean");
  });

  it("accepts a full set of options, and no option at all", () => {
    expect(ValidateBlockOptions("FullAgenda", FULL_OPTIONS).valid).to.equal(
      true,
    );
    expect(ValidateBlockOptions("FullAgenda", {}).valid).to.equal(true);
    expect(
      ValidateBlockOptions("FullAgenda", { sidebar: false, toolbar: false })
        .valid,
    ).to.equal(true);
  });

  it("refuses values outside its enums and ranges", () => {
    const valid = (options: Record<string, unknown>) =>
      ValidateBlockOptions("FullAgenda", options).valid;
    expect(valid({ saveMode: "later" })).to.equal(false);
    expect(valid({ conflicts: "merge" })).to.equal(false);
    expect(valid({ rangeSelect: "hover" })).to.equal(false);
    expect(valid({ weekStartsOn: 3 })).to.equal(false);
    expect(valid({ hiddenDays: [7] })).to.equal(false);
    expect(valid({ dayStart: "7h" })).to.equal(false);
    expect(valid({ dayEnd: "25:00" })).to.equal(false);
    expect(valid({ dayEnd: "24:30" })).to.equal(false);
    expect(valid({ dayEnd: "24:00" })).to.equal(true);
    expect(valid({ slotMinutes: 2 })).to.equal(false);
    expect(valid({ hourHeight: 8 })).to.equal(false);
  });
});
