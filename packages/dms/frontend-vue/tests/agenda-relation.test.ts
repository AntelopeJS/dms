/** @vitest-environment jsdom */
/**
 * The guest field of the booking drawer: a `relation` field searches a route as the
 * user types, keeps the id, and saves it under the event's `data` like any custom field.
 */
import {
  type AgendaFormValue,
  buildPatch,
  resolveFormFields,
  valuesFromOccurrence,
  type AgendaFormSources,
} from "../layers/dms-ui/app/entries/composables/agenda/agendaForm";
import { isObject, isString } from "../layers/dms-core/app/utils/type-check";
import { createApp, defineComponent, h, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgendaRelationInput from "../layers/dms-ui/app/entries/components/agenda/AgendaRelationInput";
import type { AgendaField } from "../layers/dms-ui/app/types/full-agenda";

const RELATION = { searchUrl: "/api/agenda/guests" };
interface RelationAnswerItem {
  value: string;
  label: string;
}

const isRelationItem = (item: unknown): item is RelationAnswerItem =>
  isObject(item) && isString(item.value) && isString(item.label);

const SOURCES: AgendaFormSources = {
  calendars: [],
  resources: [],
  text: String,
  fields: [
    { id: "guestId", kind: "relation", relation: RELATION },
    { id: "title" },
  ] satisfies AgendaField[],
};

describe("the relation field in the details form", () => {
  it("keeps the search route on the resolved field (fails when the field loses where to search)", () => {
    const [field] = resolveFormFields(SOURCES);

    expect(field?.kind).toBe("relation");
    expect(field?.relation).toEqual(RELATION);
  });

  it("saves the chosen id under data and clears it with null (fails when a cleared guest keeps its old id)", () => {
    const fields = resolveFormFields(SOURCES);

    expect(
      buildPatch(fields, { guestId: "p9", title: "x" }, "Europe/Brussels").data,
    ).toEqual({ guestId: "p9" });
    expect(
      buildPatch(fields, { guestId: undefined, title: "x" }, "Europe/Brussels")
        .data,
    ).toEqual({ guestId: null });
  });

  it("opens with the guest already on the event (fails when the drawer shows an empty guest)", () => {
    const fields = resolveFormFields(SOURCES);
    const values = valuesFromOccurrence(
      {
        key: "a",
        event: {
          id: "a",
          title: "Jeanne",
          start: "2026-11-09T08:00:00Z",
          end: "2026-11-09T08:30:00Z",
          data: { guestId: "p1" },
        },
        allDay: false,
        start: Date.parse("2026-11-09T08:00:00Z"),
        end: Date.parse("2026-11-09T08:30:00Z"),
        startDay: "2026-11-09",
        endDay: "2026-11-09",
        startMinutes: 0,
        endMinutes: 0,
        resourceIds: [],
        paint: { background: "", bar: "", text: "", onBar: "" },
        canMove: true,
        canResize: true,
        canDelete: false,
        details: "drawer",
      },
      fields,
      "Europe/Brussels",
    );

    expect(values["guestId"]).toBe("p1");
  });
});

const SelectStub = defineComponent({
  props: {
    items: { type: Array, default: () => [] },
    modelValue: { type: String, default: undefined },
    searchTerm: { type: String, default: "" },
  },
  emits: ["update:modelValue", "update:searchTerm"],
  setup(props, { emit }) {
    return () =>
      h("div", [
        h("input", {
          "data-search": "",
          value: props.searchTerm,
          onInput: (event: Event) =>
            emit(
              "update:searchTerm",
              event.target instanceof HTMLInputElement
                ? event.target.value
                : "",
            ),
        }),
        ...props.items.filter(isRelationItem).map((item) =>
          h(
            "button",
            {
              "data-item": item.value,
              onClick: () => emit("update:modelValue", item.value),
            },
            item.label,
          ),
        ),
        h("span", { "data-selected": "" }, props.modelValue ?? ""),
      ]);
  },
});

async function settle() {
  await vi.advanceTimersByTimeAsync(300);
  await nextTick();
}

describe("the relation input", () => {
  const authFetch = vi.fn();
  const apps: Array<{ unmount: () => void }> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    authFetch.mockReset();
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  });

  afterEach(() => {
    for (const app of apps.splice(0)) app.unmount();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountInput(modelValue?: string) {
    const emitted: unknown[] = [];
    const root = document.createElement("div");
    const app = createApp({
      render: () =>
        h(AgendaRelationInput, {
          relation: RELATION,
          label: "Guest",
          modelValue,
          "onUpdate:modelValue": (value: AgendaFormValue) =>
            emitted.push(value),
        }),
    });
    app.component("USelectMenu", SelectStub);
    app.mount(root);
    apps.push(app);
    const type = async (text: string) => {
      const field = root.querySelector<HTMLInputElement>("[data-search]");
      if (!field) throw new Error("no search field");
      field.value = text;
      field.dispatchEvent(new Event("input"));
      await nextTick();
    };
    return { root, emitted, type };
  }

  it("searches only once enough is typed, and pauses between keystrokes (fails when every keystroke hits the server or one letter searches)", async () => {
    authFetch.mockResolvedValue({ items: [] });
    const input = mountInput();

    await input.type("J");
    await settle();
    expect(authFetch).not.toHaveBeenCalled();

    await input.type("Je");
    await input.type("Jea");
    await settle();

    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(authFetch).toHaveBeenCalledWith(RELATION.searchUrl, {
      query: { q: "Jea" },
    });
  });

  it("emits the id of the record picked (fails when it emits the label)", async () => {
    authFetch.mockResolvedValue({
      items: [{ value: "p1", label: "Jeanne Dupont" }],
    });
    const input = mountInput();
    await input.type("Jeanne");
    await settle();

    input.root.querySelector<HTMLElement>("[data-item='p1']")?.click();

    expect(input.emitted).toEqual(["p1"]);
  });

  it("shows the record already chosen by asking for its name (fails when a saved guest opens as a bare id)", async () => {
    authFetch.mockResolvedValue({
      items: [{ value: "p1", label: "Jeanne Dupont" }],
    });
    const input = mountInput("p1");
    await settle();

    expect(authFetch).toHaveBeenCalledWith(RELATION.searchUrl, {
      query: { id: "p1" },
    });
    expect(input.root.querySelector("[data-item='p1']")?.textContent).toBe(
      "Jeanne Dupont",
    );
  });

  it("ignores an answer that arrives after a newer search (fails when a slow old answer overwrites the new one)", async () => {
    let releaseOld: (value: { items: RelationAnswerItem[] }) => void = () => {};
    authFetch
      .mockImplementationOnce(
        () => new Promise((resolve) => (releaseOld = resolve)),
      )
      .mockResolvedValueOnce({ items: [{ value: "new", label: "New" }] });
    const input = mountInput();

    await input.type("Old");
    await settle();
    await input.type("Newer");
    await settle();
    releaseOld({ items: [{ value: "old", label: "Old" }] });
    await settle();

    expect(input.root.querySelector("[data-item='old']")).toBeNull();
    expect(input.root.querySelector("[data-item='new']")).not.toBeNull();
  });
});
