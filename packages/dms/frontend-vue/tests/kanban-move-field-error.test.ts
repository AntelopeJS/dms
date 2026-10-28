/** @vitest-environment jsdom */
/**
 * A card dropped on a column the server refuses for a mandatory field it
 * lacks (a deal moved to "Lost" without its reason): the toast names the
 * field by its column's label, translated, never the raw fetch error line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "./helpers/table-runtime";
import { useRealDataEngine } from "./fixtures/dataEngine";
import Sortable from "sortablejs";
import {
  type App,
  type Component,
  Suspense,
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  ref,
  watch,
} from "vue";

const flushPromises = () => new Promise((resolve) => setTimeout(resolve));

const DEAL = { _id: "d1", stage: "lead", lostReason: null };

const STAGE_COLUMN = {
  accessorKey: "stage",
  header: "Stage",
  type: {
    id: "select",
    inputComponent: {
      options: {
        items: [
          { value: "lead", label: "Lead" },
          { value: "lost", label: "Lost" },
        ],
      },
    },
  },
};
const LOST_REASON_COLUMN = {
  accessorKey: "lostReason",
  header: "Loss reason",
  type: { id: "select" },
};

const refusal = Object.assign(
  new Error('[PUT] "/deals/edit?id=d1": 400 Bad Request'),
  {
    name: "FetchError",
    statusCode: 400,
    data: { code: "missing_mandatory_fields", fields: ["lostReason"] },
  },
);

const authFetch = vi.fn(
  async (url: string, options: { query?: Record<string, string> } = {}) => {
    if (url.endsWith("/edit")) throw refusal;
    if (url.endsWith("/get")) return { ...DEAL };
    const stage = options.query?.filter_stage?.replace("is:", "");
    const results = stage === DEAL.stage ? [{ ...DEAL }] : [];
    return { results, total: results.length };
  },
);

const addToast = vi.fn();

const translate = (
  key: string,
  params?: Parameters<
    (typeof import("../layers/dms-ui/app/entries/composables/confirm/confirmDialogTexts"))["resolveConfirmText"]
  >[1],
) =>
  key === "dms.field_errors.named_required"
    ? `${String(params?.field)} est obligatoire.`
    : key;

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  addToast.mockClear();
  for (const [name, value] of Object.entries({
    computed,
    ref,
    watch,
    h,
    inject,
    useAuthFetch: () => ({ $authFetch: authFetch }),
    useI18n: () => ({ locale: ref("fr"), t: translate }),
    useToast: () => ({ add: addToast }),
    resolveDmsComponent: () => undefined,
    Color: { error: "error", success: "success" },
    CONTENT_LANGUAGE_HEADER: "x-content-language",
    AccessMode: { ReadOnly: 1, WriteOnly: 2, ReadWrite: 3 },
  })) {
    vi.stubGlobal(name, value);
  }
  useRealDataEngine();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

async function mountBoard() {
  const { default: KanbanBoard } = await import(
    "../layers/dms-ui/app/components/table-view/KanbanBoard.vue"
  );
  app = createApp({
    render: () =>
      h(Suspense, null, {
        // SAFETY: The imported SFC is a Vue component; mounting it does not require preserving its generic row signature.
        default: () =>
          h(KanbanBoard as Component, {
            groupByField: "stage",
            location: "/deals",
            columns: [STAGE_COLUMN, LOST_REASON_COLUMN],
            baseQuery: {},
          }),
      }),
  });
  for (const name of ["UButton", "UIcon", "USkeleton"]) {
    app.component(name, defineComponent({ setup: () => () => h("span") }));
  }
  app.mount(host);
  await flushPromises();
  await nextTick();
}

describe("a card dropped on a column the server refuses", () => {
  it("names the missing field by its column's label", async () => {
    await mountBoard();
    const lists = [...host.querySelectorAll("div")]
      .map((element) => Sortable.get(element))
      .filter((list) => list !== undefined);
    expect(lists).toHaveLength(2);
    const [source, target] = lists;
    const item = source!.el.children[0]!;
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Sortable's full event requires browser drag fields; this synthetic callback fixture supplies only the fields consumed by the board.
    source!.option("onStart")!({ item, oldIndex: 0 } as never);
    target!.el.append(item);
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This callback fixture intentionally omits Sortable browser drag fields unused by the board.
    target!.option("onAdd")!({ item, newIndex: 0 } as never);
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This callback fixture intentionally omits Sortable browser drag fields unused by the board.
    source!.option("onRemove")!({ item, oldIndex: 0 } as never);
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The board's end callback consumes no event fields; constructing a browser drag event would add irrelevant fixture state.
    source!.option("onEnd")!({} as never);
    await flushPromises();
    await flushPromises();

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "error",
        title: "dms.table.kanban.move_error",
        description: "Loss reason est obligatoire.",
      }),
    );
  });
});
